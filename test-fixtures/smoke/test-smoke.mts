/**
 * Smoke test for the deterministic detection layer. Runs the ACTUAL production
 * detector (vscode + cspell stubbed via ../regression/register-loader.mjs) in
 * plain Node — no Electron host, no API key.
 *
 *   npm run test:smoke                  # fixture assertions (CI-able)
 *   npm run test:smoke -- <spec-file>   # vibe check: lint any real file and
 *                                       # print every deterministic issue
 *
 * Fixture mode builds a throwaway git repo shaped like a real customer repo
 * (rexsoftware-style: persona-suffixed .md titles, abbreviated spec titles,
 * a spec with zero checksumAI wrappers) and asserts exact rule/line output —
 * both that real problems fire AND that the known false-positive shapes stay
 * silent. Add a fixture here whenever a customer repo surfaces a new shape.
 */

import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import * as deterministicNs from '../../src/services/detection/deterministicDetector';
import type { LintIssue } from '../../src/types';

type DeterministicModule = {
  detectDeterministicPatterns: (fileContent: string, filePath?: string) => Promise<LintIssue[]>;
  resetChecksumConfigCache: () => void;
};

const { detectDeterministicPatterns, resetChecksumConfigCache }: DeterministicModule =
  (deterministicNs as unknown as { default?: DeterministicModule }).default ??
  (deterministicNs as unknown as DeterministicModule);

async function lintFile(workspaceRoot: string, filePath: string): Promise<LintIssue[]> {
  resetChecksumConfigCache();
  process.env.TAL_MOCK_WORKSPACE_ROOT = workspaceRoot;
  return detectDeterministicPatterns(readFileSync(filePath, 'utf-8'), filePath);
}

function write(root: string, relPath: string, content: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
}

/** Fixture repo mirroring the real-world shapes that broke v0.6.3. */
function buildFixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'tal-smoke-'));

  // Abbreviated pair (the rexsoftware false-positive shape): persona suffix in
  // the story title, shortened words in the spec title. Must NOT flag.
  write(root, 'checksum/tests/enter-ap-invoice - SM01.checksum.md',
    '---\ntitle: Enter Accounts Payable Invoice (Trust Accountant)\nchecksumTestId: SM01\n---\n');
  write(root, 'checksum/tests/enter-ap-invoice - SM01.checksum.spec.ts',
    'import { init } from "@checksum-ai/runtime";\nconst { test, defineChecksumTest } = init();\n' +
    'test(defineChecksumTest("Enter AP Invoice", "SM01"), async ({ page }) => {});\n');

  // Genuinely divergent pair (the Medicillio bug shape). MUST flag.
  write(root, 'checksum/tests/dashboard-shows-alerts - SM02.checksum.md',
    '---\ntitle: Dashboard shows alerts\nchecksumTestId: SM02\n---\n');
  write(root, 'checksum/tests/dashboard-shows-alerts - SM02.checksum.spec.ts',
    'import { init } from "@checksum-ai/runtime";\nconst { test, defineChecksumTest } = init();\n' +
    'test(defineChecksumTest("Sidebar collapses on mobile viewport", "SM02"), async ({ page }) => {});\n');

  // Orphaned story. MUST flag.
  write(root, 'checksum/tests/orphan-story - SM03.checksum.md',
    '---\ntitle: Orphan story with no spec\nchecksumTestId: SM03\n---\n');

  // Gibberish filename. MUST flag filename mismatch.
  write(root, 'checksum/tests/zzz-qqq-www - SM04.checksum.md',
    '---\ntitle: Reset password via email recovery link\nchecksumTestId: SM04\n---\n');
  write(root, 'checksum/tests/zzz-qqq-www - SM04.checksum.spec.ts',
    'import { init } from "@checksum-ai/runtime";\nconst { test, defineChecksumTest } = init();\n' +
    'test(defineChecksumTest("Reset password via email recovery link", "SM04"), async ({ page }) => {});\n');

  // The RX004 shape: checksum spec with zero checksumAI wrappers — raw goto,
  // locator fills/blur, click. Plus one properly wrapped action as a control.
  write(root, 'checksum/tests/unwrapped - SM05.checksum.spec.ts', [
    'import { init } from "@checksum-ai/runtime";',
    'const { test, expect, checksumAI, defineChecksumTest, login } = init();',
    'test(defineChecksumTest("Unwrapped Actions", "SM05"), async ({ page }) => {',
    '  await login(page);',
    '  await page.goto("/receipts", { waitUntil: "domcontentloaded" });',        // line 5: flag
    '  await page.locator("#rec_date").fill("01/01/2026");',                     // line 6: flag
    '  await page.locator("#rec_date").blur();',                                 // line 7: flag
    '  await checksumAI("Click process to submit the receipt", async () => {',
    '    await page.locator(\'button:text-is("Process Receipt")\').click();',    // wrapped: no flag
    '  });',
    '  await expect(page.getByText("Processed."), "receipt should process").toBeVisible();',
    '});',
    '',
  ].join('\n'));

  // Utility file with raw actions: wrapping happens at the call site, so the
  // unwrapped_action rule must stay silent here.
  write(root, 'checksum/tests/helpers.ts',
    'import { IChecksumPage } from "@checksum-ai/runtime";\n' +
    'export async function openReceipts(page: IChecksumPage) {\n' +
    '  await page.goto("/receipts");\n' +
    '}\n');

  // Plain (non-checksum) Playwright spec: rule gated off, no flags.
  write(root, 'checksum/tests/plain.spec.ts',
    'import { test } from "@playwright/test";\n' +
    'test("plain", async ({ page }) => {\n' +
    '  await page.goto("/");\n' +
    '});\n');

  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'smoke@test.local');
  git('config', 'user.name', 'Smoke');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixtures');
  return root;
}

function rules(issues: LintIssue[], rule: string): LintIssue[] {
  return issues.filter(i => i.rule === rule);
}

async function runFixtureAssertions(): Promise<void> {
  const root = buildFixtureRepo();
  try {
    const specPath = join(root, 'checksum/tests/unwrapped - SM05.checksum.spec.ts');
    const issues = await lintFile(root, specPath);

    // unwrapped_action: exactly the three raw actions, not the wrapped click.
    const unwrapped = rules(issues, 'unwrapped_action');
    assert.deepStrictEqual(
      unwrapped.map(i => i.line).sort((a, b) => a - b),
      [5, 6, 7],
      `unwrapped_action lines wrong: ${JSON.stringify(unwrapped, null, 2)}`,
    );

    // Repo-wide .md scan (attached to whichever file is linted first).
    const specMismatch = rules(issues, 'checksum_md_title_spec_mismatch');
    assert.strictEqual(specMismatch.length, 1, `expected only SM02 spec-mismatch, got: ${JSON.stringify(specMismatch, null, 2)}`);
    assert.ok(specMismatch[0].message.includes('SM02'), `spec-mismatch should be SM02: ${specMismatch[0].message}`);

    const orphans = rules(issues, 'checksum_md_orphaned_story');
    assert.strictEqual(orphans.length, 1, `expected only SM03 orphan, got: ${JSON.stringify(orphans, null, 2)}`);
    assert.ok(orphans[0].message.includes('SM03'), `orphan should be SM03: ${orphans[0].message}`);

    const filenameMismatch = rules(issues, 'checksum_md_title_filename_mismatch');
    assert.strictEqual(filenameMismatch.length, 1, `expected only SM04 filename mismatch, got: ${JSON.stringify(filenameMismatch, null, 2)}`);
    assert.ok(filenameMismatch[0].message.includes('SM04'), `filename mismatch should be SM04: ${filenameMismatch[0].message}`);

    // Abbreviated pair must never appear in any rule.
    assert.ok(!issues.some(i => i.message.includes('SM01')), 'SM01 (abbreviated titles) must not be flagged');

    // Utility file: raw goto is fine there.
    const helperIssues = await lintFile(root, join(root, 'checksum/tests/helpers.ts'));
    assert.strictEqual(rules(helperIssues, 'unwrapped_action').length, 0, 'utility files must not get unwrapped_action');

    // Plain Playwright spec: rule gated off.
    const plainIssues = await lintFile(root, join(root, 'checksum/tests/plain.spec.ts'));
    assert.strictEqual(rules(plainIssues, 'unwrapped_action').length, 0, 'non-checksum specs must not get unwrapped_action');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log('✅ smoke: all fixture assertions pass');
}

/** Vibe-check mode: lint a real file, print everything the detector reports. */
async function runVibeCheck(filePath: string): Promise<void> {
  const abs = resolve(filePath);
  const workspaceRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: dirname(abs),
    encoding: 'utf-8',
  }).trim();

  const issues = await lintFile(workspaceRoot, abs);
  console.log(`\n${basename(abs)} — ${issues.length} deterministic issue(s)`);
  console.log(`workspace: ${workspaceRoot}\n`);
  const icon: Record<string, string> = { error: '❌', warning: '⚠️', info: 'ℹ️' };
  for (const i of [...issues].sort((a, b) => a.line - b.line)) {
    console.log(`  ${icon[i.severity] ?? '·'} :${i.line} [${i.rule}] ${i.message}`);
  }
}

(async () => {
  const target = process.argv[2];
  if (target) {
    await runVibeCheck(target);
  } else {
    await runFixtureAssertions();
  }
})().catch(err => {
  console.error('❌ smoke failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
