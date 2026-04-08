/**
 * Unit test for DiagnosticProvider multi-source preservation.
 *
 * Verifies that the 4 setters (setLintDiagnostics, setGitDiagnostics,
 * setEslintDiagnostics, setAllDiagnostics) correctly preserve diagnostics
 * from the OTHER two sources when called in any order.
 *
 * The `vscode` module is stubbed via the loader hook registered in
 * register-loader.mjs (see `npm run test:diagnostics`).
 */

import * as diagnosticProviderNs from '../../src/diagnostics/diagnosticProvider';
import type { LintIssue, GitIssue } from '../../src/types/issues';
// @ts-expect-error — resolved to mock via loader at runtime
import * as vscodeMock from 'vscode';

// tsx compiles the imported .ts as CJS; named exports land under `default`
// when imported from this ESM (.mts) context. Unwrap so we exercise the EXACT
// production source — not a reimplementation.
const diagnosticProviderModule: any =
  (diagnosticProviderNs as any).default ?? diagnosticProviderNs;
const DiagnosticProvider = diagnosticProviderModule.DiagnosticProvider as new () =>
  import('../../src/diagnostics/diagnosticProvider').DiagnosticProvider;

const vscodeModule: any = (vscodeMock as any).default ?? vscodeMock;
const Uri = vscodeModule.Uri as { parse(v: string): any };
const DiagnosticSeverity = vscodeModule.DiagnosticSeverity as {
  Error: number;
  Warning: number;
  Information: number;
};

if (typeof DiagnosticProvider !== 'function') {
  console.error('FATAL: DiagnosticProvider not resolved.');
  console.error('  diagnosticProviderNs keys:', Object.keys(diagnosticProviderNs));
  console.error('  default keys:', diagnosticProviderModule && Object.keys(diagnosticProviderModule));
  process.exit(1);
}
type Uri = any;
type Diagnostic = {
  source?: string;
  code?: string | number;
  message: string;
  severity: number;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
};

const SRC_LINT = 'Team AI Linter';
const SRC_GIT = 'Team AI Linter (Git)';
const SRC_ESLINT = 'Team AI Linter (ESLint)';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err) {
    results.push({
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

// ----- Helpers to build typed fixtures ------------------------------------

function mkLint(rule: string, line: number, message: string): LintIssue {
  return { rule, line, message, severity: 'warning' };
}

function mkGit(line: number, message: string): GitIssue {
  return {
    importLine: line,
    moduleSpecifier: `./mod-${line}`,
    message,
    severity: 'error',
  };
}

// Query the provider's internal collection through the backing map (we need
// to reach in because DiagnosticProvider exposes no getter). The mock
// collection stores by uri.toString(), and the provider holds a reference to
// it on `collection`. We access via bracket notation to bypass `private`.
function readAll(provider: DiagnosticProvider, uri: Uri): Diagnostic[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coll = (provider as any).collection;
  const diags = coll.get(uri) as Diagnostic[] | undefined;
  return diags ?? [];
}

function bySource(diags: Diagnostic[], source: string): Diagnostic[] {
  return diags.filter((d) => d.source === source);
}

function assertCounts(
  diags: Diagnostic[],
  lint: number,
  git: number,
  eslint: number,
  label: string,
): void {
  assertEqual(bySource(diags, SRC_LINT).length, lint, `${label}: lint count`);
  assertEqual(bySource(diags, SRC_GIT).length, git, `${label}: git count`);
  assertEqual(bySource(diags, SRC_ESLINT).length, eslint, `${label}: eslint count`);
  assertEqual(diags.length, lint + git + eslint, `${label}: total count`);
}

function findByRuleAndLine(
  diags: Diagnostic[],
  source: string,
  rule: string,
  line: number,
): Diagnostic | undefined {
  return diags.find(
    (d) => d.source === source && d.code === rule && d.range.startLine === line - 1,
  );
}

// ----- Tests --------------------------------------------------------------

const uri = Uri.parse('file:///tmp/example.test.ts');

test('1. set only lint (A) -> only A present', () => {
  const dp = new DiagnosticProvider();
  const A: LintIssue[] = [mkLint('no-wait', 10, 'no hardcoded waits')];
  dp.setLintDiagnostics(uri, A);

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 0, 0, 'step 1');
  const a = findByRuleAndLine(diags, SRC_LINT, 'no-wait', 10);
  assert(a, 'lint A not found');
  assertEqual(a.message, '[no-wait] no hardcoded waits', 'lint A message formatting');
  assertEqual(a.source, SRC_LINT, 'lint A source');
  assertEqual(a.code, 'no-wait', 'lint A code');
  dp.dispose();
});

test('2. lint A then git B -> A + B preserved', () => {
  const dp = new DiagnosticProvider();
  dp.setLintDiagnostics(uri, [mkLint('no-wait', 10, 'wait')]);
  dp.setGitDiagnostics(uri, [mkGit(2, 'uncommitted import')]);

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 0, 'step 2');
  assert(findByRuleAndLine(diags, SRC_LINT, 'no-wait', 10), 'lint A lost after git set');
  const g = findByRuleAndLine(diags, SRC_GIT, 'git-safety', 2);
  assert(g, 'git B not found');
  assertEqual(g.source, SRC_GIT, 'git B source');
  assertEqual(g.code, 'git-safety', 'git B code');
  dp.dispose();
});

test('3. lint A, git B, eslint C -> all three preserved', () => {
  const dp = new DiagnosticProvider();
  dp.setLintDiagnostics(uri, [mkLint('no-wait', 10, 'wait')]);
  dp.setGitDiagnostics(uri, [mkGit(2, 'uncommitted')]);
  dp.setEslintDiagnostics(uri, [mkLint('no-floating-promises', 20, 'await me')]);

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 1, 'step 3');
  assert(findByRuleAndLine(diags, SRC_LINT, 'no-wait', 10), 'lint A lost');
  assert(findByRuleAndLine(diags, SRC_GIT, 'git-safety', 2), 'git B lost');
  const c = findByRuleAndLine(diags, SRC_ESLINT, 'no-floating-promises', 20);
  assert(c, 'eslint C not found');
  assertEqual(
    c.message,
    '[no-floating-promises] await me',
    'eslint C message formatting',
  );
  assertEqual(c.source, SRC_ESLINT, 'eslint C source');
  assertEqual(c.code, 'no-floating-promises', 'eslint C code');
  dp.dispose();
});

test('4. replacing lint (A -> A2) preserves git B and eslint C', () => {
  const dp = new DiagnosticProvider();
  dp.setLintDiagnostics(uri, [mkLint('no-wait', 10, 'wait')]);
  dp.setGitDiagnostics(uri, [mkGit(2, 'uncommitted')]);
  dp.setEslintDiagnostics(uri, [mkLint('no-floating-promises', 20, 'await me')]);

  dp.setLintDiagnostics(uri, [mkLint('prefer-locator', 30, 'use locator')]);

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 1, 'step 4');
  assert(
    !findByRuleAndLine(diags, SRC_LINT, 'no-wait', 10),
    'old lint A should have been replaced',
  );
  assert(
    findByRuleAndLine(diags, SRC_LINT, 'prefer-locator', 30),
    'new lint A2 not found',
  );
  assert(findByRuleAndLine(diags, SRC_GIT, 'git-safety', 2), 'git B lost on lint replace');
  assert(
    findByRuleAndLine(diags, SRC_ESLINT, 'no-floating-promises', 20),
    'eslint C lost on lint replace',
  );
  dp.dispose();
});

test('5. replacing git (B -> B2) preserves lint A2 and eslint C', () => {
  const dp = new DiagnosticProvider();
  dp.setLintDiagnostics(uri, [mkLint('prefer-locator', 30, 'use locator')]);
  dp.setGitDiagnostics(uri, [mkGit(2, 'uncommitted')]);
  dp.setEslintDiagnostics(uri, [mkLint('no-floating-promises', 20, 'await me')]);

  dp.setGitDiagnostics(uri, [mkGit(5, 'missing file')]);

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 1, 'step 5');
  assert(findByRuleAndLine(diags, SRC_LINT, 'prefer-locator', 30), 'lint A2 lost on git replace');
  assert(
    !findByRuleAndLine(diags, SRC_GIT, 'git-safety', 2),
    'old git B should have been replaced',
  );
  assert(findByRuleAndLine(diags, SRC_GIT, 'git-safety', 5), 'new git B2 not found');
  assert(
    findByRuleAndLine(diags, SRC_ESLINT, 'no-floating-promises', 20),
    'eslint C lost on git replace',
  );
  dp.dispose();
});

test('6. replacing eslint (C -> C2) preserves lint A2 and git B2', () => {
  const dp = new DiagnosticProvider();
  dp.setLintDiagnostics(uri, [mkLint('prefer-locator', 30, 'use locator')]);
  dp.setGitDiagnostics(uri, [mkGit(5, 'missing file')]);
  dp.setEslintDiagnostics(uri, [mkLint('no-floating-promises', 20, 'await me')]);

  dp.setEslintDiagnostics(uri, [mkLint('one-test-per-file', 40, 'split this file')]);

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 1, 'step 6');
  assert(findByRuleAndLine(diags, SRC_LINT, 'prefer-locator', 30), 'lint A2 lost on eslint replace');
  assert(findByRuleAndLine(diags, SRC_GIT, 'git-safety', 5), 'git B2 lost on eslint replace');
  assert(
    !findByRuleAndLine(diags, SRC_ESLINT, 'no-floating-promises', 20),
    'old eslint C should have been replaced',
  );
  assert(
    findByRuleAndLine(diags, SRC_ESLINT, 'one-test-per-file', 40),
    'new eslint C2 not found',
  );
  dp.dispose();
});

test('7. setAllDiagnostics with all three arrays writes A3 + B3 + C3', () => {
  const dp = new DiagnosticProvider();
  // Seed with the prior state to prove setAll fully replaces.
  dp.setLintDiagnostics(uri, [mkLint('old-lint', 1, 'old')]);
  dp.setGitDiagnostics(uri, [mkGit(2, 'old git')]);
  dp.setEslintDiagnostics(uri, [mkLint('old-eslint', 3, 'old')]);

  dp.setAllDiagnostics(
    uri,
    [mkLint('lint-rule', 11, 'lint msg')],
    [mkGit(12, 'git msg')],
    [mkLint('eslint-rule', 13, 'eslint msg')],
  );

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 1, 'step 7');
  assert(findByRuleAndLine(diags, SRC_LINT, 'lint-rule', 11), 'new lint A3 not found');
  assert(findByRuleAndLine(diags, SRC_GIT, 'git-safety', 12), 'new git B3 not found');
  assert(findByRuleAndLine(diags, SRC_ESLINT, 'eslint-rule', 13), 'new eslint C3 not found');
  // Old entries must be gone.
  assert(!findByRuleAndLine(diags, SRC_LINT, 'old-lint', 1), 'old lint not replaced');
  assert(!findByRuleAndLine(diags, SRC_ESLINT, 'old-eslint', 3), 'old eslint not replaced');
  dp.dispose();
});

test('8. setAllDiagnostics without eslint arg defaults to [] (no eslint present)', () => {
  const dp = new DiagnosticProvider();
  dp.setAllDiagnostics(
    uri,
    [mkLint('lint-rule', 11, 'lint msg')],
    [mkGit(12, 'git msg')],
    [mkLint('eslint-rule', 13, 'eslint msg')],
  );

  dp.setAllDiagnostics(
    uri,
    [mkLint('lint-rule-2', 21, 'lint msg 2')],
    [mkGit(22, 'git msg 2')],
    // no eslint arg → default []
  );

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 0, 'step 8');
  assert(findByRuleAndLine(diags, SRC_LINT, 'lint-rule-2', 21), 'new lint A4 not found');
  assert(findByRuleAndLine(diags, SRC_GIT, 'git-safety', 22), 'new git B4 not found');
  assertEqual(bySource(diags, SRC_ESLINT).length, 0, 'eslint should be empty after default');
  dp.dispose();
});

test('9. source + code + message formatting across all three kinds', () => {
  const dp = new DiagnosticProvider();
  dp.setAllDiagnostics(
    uri,
    [{ rule: 'no-wait', line: 10, message: 'no waits', severity: 'warning', confidence: 0.9 }],
    [mkGit(2, 'uncommitted import for ./foo')],
    [{ rule: 'one-test-per-file', line: 1, message: 'split this file', severity: 'error' }],
  );

  const diags = readAll(dp, uri);
  const lint = bySource(diags, SRC_LINT)[0];
  const git = bySource(diags, SRC_GIT)[0];
  const eslint = bySource(diags, SRC_ESLINT)[0];

  assert(lint, 'missing lint diagnostic');
  assert(git, 'missing git diagnostic');
  assert(eslint, 'missing eslint diagnostic');

  // Lint formatting: `[rule] message (N% confidence)`
  assertEqual(lint.source, SRC_LINT, 'lint source constant');
  assertEqual(lint.code, 'no-wait', 'lint code = rule');
  assertEqual(lint.message, '[no-wait] no waits (90% confidence)', 'lint message format');

  // Git formatting: raw message, code = 'git-safety'
  assertEqual(git.source, SRC_GIT, 'git source constant');
  assertEqual(git.code, 'git-safety', 'git code constant');
  assertEqual(git.message, 'uncommitted import for ./foo', 'git message unchanged');
  assertEqual(git.severity, DiagnosticSeverity.Error, 'git severity mapped to Error');

  // ESLint formatting: `[rule] message`, code = rule, no confidence suffix
  assertEqual(eslint.source, SRC_ESLINT, 'eslint source constant');
  assertEqual(eslint.code, 'one-test-per-file', 'eslint code = rule');
  assertEqual(eslint.message, '[one-test-per-file] split this file', 'eslint message format');

  dp.dispose();
});

test('10. interleaved updates in non-obvious order keep invariants', () => {
  // Exercise a permutation that's not just linear A->B->C.
  const dp = new DiagnosticProvider();
  dp.setEslintDiagnostics(uri, [mkLint('one-test-per-file', 1, 'e1')]);
  dp.setGitDiagnostics(uri, [mkGit(2, 'g1')]);
  dp.setLintDiagnostics(uri, [mkLint('no-wait', 3, 'l1')]);
  // Now replace in a different order: eslint, lint, git.
  dp.setEslintDiagnostics(uri, [mkLint('correct-test-directory', 4, 'e2')]);
  dp.setLintDiagnostics(uri, [mkLint('prefer-locator', 5, 'l2')]);
  dp.setGitDiagnostics(uri, [mkGit(6, 'g2')]);

  const diags = readAll(dp, uri);
  assertCounts(diags, 1, 1, 1, 'step 10');
  assert(findByRuleAndLine(diags, SRC_LINT, 'prefer-locator', 5), 'lint l2 not present');
  assert(findByRuleAndLine(diags, SRC_GIT, 'git-safety', 6), 'git g2 not present');
  assert(
    findByRuleAndLine(diags, SRC_ESLINT, 'correct-test-directory', 4),
    'eslint e2 not present',
  );
  dp.dispose();
});

// ----- Report -------------------------------------------------------------

let passed = 0;
let failed = 0;
for (const r of results) {
  if (r.passed) {
    passed++;
    console.log(`  PASS  ${r.name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${r.name}`);
    console.log(`        ${r.error}`);
  }
}

console.log('');
console.log(`${results.length} tests — ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
