/**
 * Regression test that exercises the ACTUAL production TypeScript source of
 * src/services/detection/deterministicDetector.ts and astDetector.ts.
 *
 * The goal: prove that adding the ESLint detection layer did NOT silently
 * regress the pre-existing regex + ts-morph detectors. We load the real
 * modules through tsx (with a vscode stub) and assert specific rule names
 * fire on targeted fixtures.
 *
 * Run via: npm run test:regression
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// See register-loader.mjs — it monkey-patches `require('vscode')` BEFORE
// these imports land so the CJS-compiled detectors resolve to our stub.
import * as deterministicNs from '../../src/services/detection/deterministicDetector';
import * as astNs from '../../src/services/detection/astDetector';
import type { LintIssue } from '../../src/types';

type DeterministicModule = {
  detectDeterministicPatterns: (fileContent: string, filePath?: string) => Promise<LintIssue[]>;
  resetChecksumConfigCache: () => void;
};

type AstModule = {
  findUnusedImports: (content: string, fileName?: string) => Array<{ line: number; importName: string; moduleSpecifier: string }>;
  findExpectsInsideChecksumAI: (content: string, fileName?: string) => Array<{ line: number; checksumAIDescription: string }>;
  findMultipleActionsInChecksumAI: (content: string, fileName?: string) => Array<{ line: number; actionCount: number; checksumAIDescription: string }>;
  validateBugAnnotations: (content: string, fileName?: string) => Array<{ line: number; testName: string; missingComponents: string[] }>;
  findExpectsWithoutMessages: (content: string, fileName?: string) => Array<{ line: number }>;
};

const deterministic: DeterministicModule =
  (deterministicNs as unknown as { default?: DeterministicModule }).default ??
  (deterministicNs as unknown as DeterministicModule);

const ast: AstModule =
  (astNs as unknown as { default?: AstModule }).default ??
  (astNs as unknown as AstModule);

const { detectDeterministicPatterns, resetChecksumConfigCache } = deterministic;
const {
  findUnusedImports,
  findExpectsInsideChecksumAI,
  findMultipleActionsInChecksumAI,
  validateBugAnnotations,
  findExpectsWithoutMessages,
} = ast;

if (typeof detectDeterministicPatterns !== 'function') {
  console.error('FATAL: failed to resolve detectDeterministicPatterns from production module');
  console.error('namespace keys:', Object.keys(deterministicNs));
  process.exit(1);
}
if (typeof findUnusedImports !== 'function' || typeof findExpectsInsideChecksumAI !== 'function') {
  console.error('FATAL: failed to resolve astDetector exports');
  console.error('namespace keys:', Object.keys(astNs));
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, 'fixtures');

interface TestResult {
  name: string;
  pass: boolean;
  detail?: string;
}
const results: TestResult[] = [];

function record(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail });
}

function loadFixture(name: string): { content: string; path: string } {
  const path = resolve(FIXTURE_ROOT, name);
  return { content: readFileSync(path, 'utf-8'), path };
}

function hasRule(issues: LintIssue[], rule: string): boolean {
  return issues.some((i) => i.rule === rule);
}

function findByRule(issues: LintIssue[], rule: string): LintIssue | undefined {
  return issues.find((i) => i.rule === rule);
}

function ruleSummary(issues: LintIssue[]): string {
  return issues.map((i) => `${i.rule}@${i.line}`).join(', ') || '(none)';
}

console.log('Running regression tests for deterministicDetector + astDetector via tsx...\n');

// Ensure cached state from an earlier lint session can't leak into the first test.
resetChecksumConfigCache();

// --- Test 1: deterministic waitForTimeout ---
{
  const fx = loadFixture('deterministic-waitForTimeout.spec.ts');
  const issues = await detectDeterministicPatterns(fx.content, fx.path);
  const match = findByRule(issues, 'avoid_waitForTimeout');
  record(
    'deterministic: avoid_waitForTimeout fires',
    !!match,
    `rules: ${ruleSummary(issues)}`,
  );
  record(
    'deterministic: avoid_waitForTimeout reports correct line (5)',
    match?.line === 5,
    `line was ${match?.line}`,
  );
  record(
    'deterministic: avoid_waitForTimeout message mentions web-first assertions',
    !!match && /web-first assertions/i.test(match.message),
    `message: ${match?.message}`,
  );
}

// --- Test 2: deterministic .nth() selector ---
{
  const fx = loadFixture('deterministic-nth-selector.spec.ts');
  const issues = await detectDeterministicPatterns(fx.content, fx.path);
  const match = findByRule(issues, 'avoid_nth_selector');
  record(
    'deterministic: avoid_nth_selector fires',
    !!match,
    `rules: ${ruleSummary(issues)}`,
  );
  record(
    'deterministic: avoid_nth_selector reports correct line (4)',
    match?.line === 4,
    `line was ${match?.line}`,
  );
}

// --- Test 3: clean fixture -> no known deterministic/AST rule violations ---
{
  const fx = loadFixture('clean-no-issues.spec.ts');
  const issues = await detectDeterministicPatterns(fx.content, fx.path);

  // We allow `spelling` (info-level cspell noise) and `unused_parameter`
  // (only fires for utility files, which this isn't). Every other rule
  // the detector emits should be considered a regression on a clean file.
  const ALLOWED = new Set(['spelling']);
  const unexpected = issues.filter((i) => !ALLOWED.has(i.rule));

  record(
    'clean fixture: no unexpected deterministic/AST rule fires',
    unexpected.length === 0,
    `unexpected: ${ruleSummary(unexpected)}`,
  );
}

// --- Test 4: AST — expect inside checksumAI ---
{
  const fx = loadFixture('ast-expect-in-checksum.spec.ts');

  // Check via the high-level detector...
  const issues = await detectDeterministicPatterns(fx.content, fx.path);
  record(
    'deterministic: expect_inside_checksumai fires via detectDeterministicPatterns',
    hasRule(issues, 'expect_inside_checksumai'),
    `rules: ${ruleSummary(issues)}`,
  );

  // ...and by calling the underlying AST helper directly.
  const direct = findExpectsInsideChecksumAI(fx.content, fx.path);
  record(
    'ast: findExpectsInsideChecksumAI returns >= 1 result',
    direct.length >= 1,
    `count=${direct.length}`,
  );
  record(
    'ast: findExpectsInsideChecksumAI captures checksumAI description',
    direct.length > 0 && direct[0].checksumAIDescription === 'click and verify',
    `description=${direct[0]?.checksumAIDescription}`,
  );
  record(
    'ast: findExpectsInsideChecksumAI reports line 6',
    direct[0]?.line === 6,
    `line=${direct[0]?.line}`,
  );
}

// --- Test 5: AST — multiple actions in one checksumAI block ---
{
  const fx = loadFixture('ast-multi-action-checksumai.spec.ts');

  const direct = findMultipleActionsInChecksumAI(fx.content, fx.path);
  record(
    'ast: findMultipleActionsInChecksumAI returns exactly 1 result',
    direct.length === 1,
    `count=${direct.length}, results=${JSON.stringify(direct)}`,
  );
  record(
    'ast: findMultipleActionsInChecksumAI counts 3 actions',
    direct[0]?.actionCount === 3,
    `actionCount=${direct[0]?.actionCount}`,
  );

  // And the top-level detector should surface it.
  const issues = await detectDeterministicPatterns(fx.content, fx.path);
  record(
    'deterministic: multiple_actions_in_checksumai fires via detectDeterministicPatterns',
    hasRule(issues, 'multiple_actions_in_checksumai'),
    `rules: ${ruleSummary(issues)}`,
  );
}

// --- Test 6: AST — unused import on a utility file ---
{
  const fx = loadFixture('ast-unused-import.ts');
  const direct = findUnusedImports(fx.content, fx.path);
  const resolveImport = direct.find((i) => i.importName === 'resolve');
  record(
    'ast: findUnusedImports flags unused `resolve` from node:path',
    !!resolveImport && resolveImport.moduleSpecifier === 'node:path',
    `direct=${JSON.stringify(direct)}`,
  );
  record(
    'ast: findUnusedImports does NOT flag used `readFileSync`',
    !direct.some((i) => i.importName === 'readFileSync'),
    `direct=${JSON.stringify(direct)}`,
  );

  // Surfaced via the top-level detector, too (utility file path triggers it).
  const issues = await detectDeterministicPatterns(fx.content, fx.path);
  const unusedIssue = issues.find(
    (i) => i.rule === 'unused_import' && i.message.includes("'resolve'"),
  );
  record(
    'deterministic: unused_import for `resolve` fires via detectDeterministicPatterns',
    !!unusedIssue,
    `rules: ${ruleSummary(issues)}`,
  );
}

// --- Test 7: AST — incomplete bug annotation ---
{
  const fx = loadFixture('ast-bug-annotation.spec.ts');
  const direct = validateBugAnnotations(fx.content, fx.path);
  record(
    'ast: validateBugAnnotations returns exactly 1 result',
    direct.length === 1,
    `direct=${JSON.stringify(direct)}`,
  );
  record(
    'ast: validateBugAnnotations flags missing `annotation`',
    direct[0]?.missingComponents.some((m) => m.includes('annotation')) ?? false,
    `missingComponents=${JSON.stringify(direct[0]?.missingComponents)}`,
  );

  const issues = await detectDeterministicPatterns(fx.content, fx.path);
  record(
    'deterministic: incomplete_bug_annotation fires via detectDeterministicPatterns',
    hasRule(issues, 'incomplete_bug_annotation'),
    `rules: ${ruleSummary(issues)}`,
  );
}

// --- Test 8: AST — findExpectsWithoutMessages direct call ---
{
  // Use the multi-action fixture content but append a bare expect() with no message.
  const source = `import { test, expect } from '@checksum-ai/runtime';

test('naked expect', async ({ page }) => {
  await page.goto('/');
  expect(page.getByText('hi')).toBeVisible();
});
`;
  const direct = findExpectsWithoutMessages(source, 'inline.spec.ts');
  record(
    'ast: findExpectsWithoutMessages flags naked expect',
    direct.length === 1 && direct[0].line === 5,
    `direct=${JSON.stringify(direct)}`,
  );

  // And it should NOT fire when the expect has a descriptive message.
  const sourceOk = `import { test, expect } from '@checksum-ai/runtime';

test('expect with message', async ({ page }) => {
  await page.goto('/');
  expect(page.getByText('hi'), 'greeting should render').toBeVisible();
});
`;
  const directOk = findExpectsWithoutMessages(sourceOk, 'inline-ok.spec.ts');
  record(
    'ast: findExpectsWithoutMessages silent when message present',
    directOk.length === 0,
    `direct=${JSON.stringify(directOk)}`,
  );
}

// --- Report ---
let passed = 0;
let failed = 0;
for (const r of results) {
  if (r.pass) {
    console.log(`  PASS  ${r.name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${r.name}`);
    if (r.detail) {
      for (const line of r.detail.split('\n')) {
        console.log(`        ${line}`);
      }
    }
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed (${results.length} total)\n`);
process.exit(failed === 0 ? 0 : 1);
