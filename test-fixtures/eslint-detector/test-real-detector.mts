/**
 * Integration test that exercises the ACTUAL production TypeScript source of
 * src/services/detection/eslintDetector.ts (not a reimplementation).
 *
 * Run via: npm run test:detector
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// tsx transpiles the imported .ts as CJS, so the named exports land under
// the synthetic `default` key when imported from this ESM (.mts) context.
// We unwrap it so we're still calling the EXACT same compiled functions
// from the production source file — not a reimplementation.
import * as eslintDetectorNs from '../../src/services/detection/eslintDetector';
import type { LintIssue } from '../../src/types';

type DetectorModule = {
  lintWithEslint: (
    filePath: string,
    source: string,
    workspaceRoot: string,
    typeAware?: boolean,
  ) => Promise<LintIssue[]>;
  resetEslintCache: () => void;
};

const detector: DetectorModule =
  (eslintDetectorNs as unknown as { default?: DetectorModule }).default ??
  (eslintDetectorNs as unknown as DetectorModule);

const { lintWithEslint, resetEslintCache } = detector;

if (typeof lintWithEslint !== 'function' || typeof resetEslintCache !== 'function') {
  console.error('FATAL: failed to resolve lintWithEslint/resetEslintCache from production module');
  console.error('namespace keys:', Object.keys(eslintDetectorNs));
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = __dirname;

interface TestResult {
  name: string;
  pass: boolean;
  detail?: string;
}
const results: TestResult[] = [];

function record(name: string, pass: boolean, detail?: string): void {
  results.push({ name, pass, detail });
}

function fmtIssues(issues: LintIssue[]): string {
  return JSON.stringify(issues, null, 2);
}

function isValidShape(issue: LintIssue): string | null {
  if (typeof issue.line !== 'number') return `line not number: ${typeof issue.line}`;
  if (typeof issue.message !== 'string') return `message not string`;
  if (typeof issue.rule !== 'string') return `rule not string`;
  if (!['error', 'warning', 'info'].includes(issue.severity)) {
    return `severity invalid: ${issue.severity}`;
  }
  if (issue.column !== undefined && typeof issue.column !== 'number') {
    return `column not number`;
  }
  if (issue.endLine !== undefined && typeof issue.endLine !== 'number') {
    return `endLine not number`;
  }
  if (issue.endColumn !== undefined && typeof issue.endColumn !== 'number') {
    return `endColumn not number`;
  }
  return null;
}

function assertAllShapesValid(name: string, issues: LintIssue[]): void {
  for (const issue of issues) {
    const err = isValidShape(issue);
    if (err) {
      record(`${name}: shape validation`, false, `${err}\nissue: ${JSON.stringify(issue)}`);
      return;
    }
  }
  record(`${name}: shape validation`, true);
}

async function lintFixture(relPath: string, typeAware = true): Promise<LintIssue[]> {
  const filePath = resolve(FIXTURE_ROOT, relPath);
  const source = readFileSync(filePath, 'utf-8');
  return lintWithEslint(filePath, source, FIXTURE_ROOT, typeAware);
}

function hasRule(issues: LintIssue[], rule: string): boolean {
  return issues.some((i) => i.rule === rule);
}

console.log('Running REAL eslintDetector.ts integration tests via tsx...\n');

// --- Test 0 (runs FIRST): cache hit — 2nd call much faster than 1st ---
// Must run before any other lint to capture the real cold-start cost
// (ESLint instance construction + plugin loading inside getEslint()).
{
  const filePath = resolve(FIXTURE_ROOT, 'tests/clean.checksum.spec.ts');
  const source = readFileSync(filePath, 'utf-8');

  const t1Start = process.hrtime.bigint();
  await lintWithEslint(filePath, source, FIXTURE_ROOT, true);
  const t1Ns = Number(process.hrtime.bigint() - t1Start);

  const t2Start = process.hrtime.bigint();
  await lintWithEslint(filePath, source, FIXTURE_ROOT, true);
  const t2Ns = Number(process.hrtime.bigint() - t2Start);

  const ratio = t1Ns / Math.max(t2Ns, 1);
  record(
    'cache hit: 2nd call >= 5x faster than 1st',
    ratio >= 5,
    `1st=${(t1Ns / 1e6).toFixed(2)}ms, 2nd=${(t2Ns / 1e6).toFixed(2)}ms, ratio=${ratio.toFixed(2)}x`,
  );
  console.log(
    `  [timing] 1st call: ${(t1Ns / 1e6).toFixed(2)}ms, 2nd call: ${(t2Ns / 1e6).toFixed(2)}ms (${ratio.toFixed(2)}x speedup)\n`,
  );
}

// --- Test 1: clean fixture -> zero issues ---
{
  const issues = await lintFixture('tests/clean.checksum.spec.ts');
  record(
    'clean fixture: zero issues',
    issues.length === 0,
    `expected 0 issues, got ${issues.length}: ${fmtIssues(issues)}`,
  );
  assertAllShapesValid('clean', issues);
}

// --- Test 2: two-tests fires checksum/one-test-per-file ---
{
  const issues = await lintFixture('tests/two-tests.checksum.spec.ts');
  const fires = hasRule(issues, 'checksum/one-test-per-file');
  record(
    'two-tests: fires checksum/one-test-per-file',
    fires,
    `rules: ${issues.map((i) => i.rule).join(', ') || '(none)'}\n${fmtIssues(issues)}`,
  );
  record(
    'two-tests: does NOT fire correct-test-directory',
    !hasRule(issues, 'checksum/correct-test-directory'),
    `unexpectedly fired correct-test-directory`,
  );
  // Validate line number is a positive integer
  const rel = issues.find((i) => i.rule === 'checksum/one-test-per-file');
  record(
    'two-tests: issue has positive line number',
    !!rel && rel.line >= 1,
    `line was ${rel?.line}`,
  );
  assertAllShapesValid('two-tests', issues);
}

// --- Test 3: no-tests fires checksum/one-test-per-file ---
{
  const issues = await lintFixture('tests/no-tests.checksum.spec.ts');
  record(
    'no-tests: fires checksum/one-test-per-file',
    hasRule(issues, 'checksum/one-test-per-file'),
    `rules: ${issues.map((i) => i.rule).join(', ') || '(none)'}\n${fmtIssues(issues)}`,
  );
  assertAllShapesValid('no-tests', issues);
}

// --- Test 4: floating-promise fires @typescript-eslint/no-floating-promises ---
{
  const issues = await lintFixture('tests/floating-promise.checksum.spec.ts');
  record(
    'floating-promise: fires no-floating-promises',
    hasRule(issues, '@typescript-eslint/no-floating-promises'),
    `rules: ${issues.map((i) => i.rule).join(', ') || '(none)'}\n${fmtIssues(issues)}`,
  );
  record(
    'floating-promise: does NOT fire one-test-per-file',
    !hasRule(issues, 'checksum/one-test-per-file'),
    `unexpectedly fired one-test-per-file`,
  );
  assertAllShapesValid('floating-promise', issues);
}

// --- Test 5: wrong-place fires checksum/correct-test-directory ---
{
  const issues = await lintFixture('outside/wrong-place.checksum.spec.ts');
  record(
    'wrong-place: fires checksum/correct-test-directory',
    hasRule(issues, 'checksum/correct-test-directory'),
    `rules: ${issues.map((i) => i.rule).join(', ') || '(none)'}\n${fmtIssues(issues)}`,
  );
  record(
    'wrong-place: does NOT fire one-test-per-file',
    !hasRule(issues, 'checksum/one-test-per-file'),
    `unexpectedly fired one-test-per-file`,
  );
  assertAllShapesValid('wrong-place', issues);
}

// --- Test 6: resetEslintCache() — works after reset ---
{
  resetEslintCache();
  const issues = await lintFixture('tests/two-tests.checksum.spec.ts');
  record(
    'resetEslintCache: still works after reset',
    hasRule(issues, 'checksum/one-test-per-file'),
    `rules: ${issues.map((i) => i.rule).join(', ') || '(none)'}`,
  );
}

// --- Test 7: typeAware=false suppresses no-floating-promises ---
{
  resetEslintCache();
  const issues = await lintFixture('tests/floating-promise.checksum.spec.ts', false);
  record(
    'typeAware=false: no-floating-promises suppressed',
    !hasRule(issues, '@typescript-eslint/no-floating-promises'),
    `unexpectedly fired: ${fmtIssues(issues)}`,
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
