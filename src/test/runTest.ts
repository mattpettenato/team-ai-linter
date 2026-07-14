/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { runTests } from '@vscode/test-electron';

/**
 * End-to-end harness for the `.checksum.md` title-mismatch linter rules.
 *
 * Builds a throwaway git workspace containing controlled fixtures that exercise
 * all three rules, then launches a real VS Code instance, loads the bundled
 * extension, runs `teamAiLinter.runAll`, and asserts the diagnostics appear.
 *
 * Runs fully offline: AI layer fails fast (refused port), deterministic layer
 * still executes. No ANTHROPIC_API_KEY needed. Run with:
 *
 *   npm run test:e2e
 */

/** Write a file, creating parent directories as needed. */
function write(root: string, relPath: string, content: string): void {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

/**
 * Materialize the fixture workspace. Returns the workspace root.
 *
 * Fixtures (each `.checksum.md` carries YAML frontmatter; the scan reads
 * tracked files via `git ls-files`, so everything must be committed):
 *
 *   AB01 — title matches filename and paired spec        -> NO issue (control)
 *   AB02 — filename shares no words with title           -> filename warning
 *   AB03 — story title differs from paired spec title    -> spec-mismatch error
 *   AB04 — story has a testId but no paired spec          -> orphan warning
 *   AB05 — spec title abbreviates the story title          -> NO issue (control)
 */
function buildWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-e2e-'));

  // Control: everything agrees.
  write(root, 'checksum/tests/auth/user-can-log-in-with-valid-credentials-AB01.checksum.md',
    '---\ntitle: User can log in with valid credentials\nchecksumTestId: AB01\n---\n\nStory body.\n');
  write(root, 'checksum/tests/auth/User Login - AB01.checksum.spec.ts',
    'import { defineChecksumTest } from "checksumai";\ndefineChecksumTest("User can log in with valid credentials", "AB01");\n');

  // Check A: filename shares no significant words with the title.
  write(root, 'checksum/tests/billing/zzz-qqq-www-vvv-AB02.checksum.md',
    '---\ntitle: Reset password via the email recovery link\nchecksumTestId: AB02\n---\n\nStory body.\n');
  write(root, 'checksum/tests/billing/Password Reset - AB02.checksum.spec.ts',
    'import { defineChecksumTest } from "checksumai";\ndefineChecksumTest("Reset password via the email recovery link", "AB02");\n');

  // Check B: story title diverges from the paired spec title (same testId).
  write(root, 'checksum/tests/dashboard/dashboard-shows-alerts-AB03.checksum.md',
    '---\ntitle: Dashboard shows alerts\nchecksumTestId: AB03\n---\n\nStory body.\n');
  write(root, 'checksum/tests/dashboard/Sidebar - AB03.checksum.spec.ts',
    'import { defineChecksumTest } from "checksumai";\ndefineChecksumTest("Sidebar collapses on mobile viewport", "AB03");\n');

  // Abbreviation control: spec title is a shortened form of the story title
  // (persona suffix + abbreviated words). Must NOT flag — real customer specs
  // abbreviate like this everywhere.
  write(root, 'checksum/tests/invoices/enter-ap-invoice-AB05.checksum.md',
    '---\ntitle: Enter Accounts Payable Invoice (Trust Accountant)\nchecksumTestId: AB05\n---\n\nStory body.\n');
  write(root, 'checksum/tests/invoices/Enter AP Invoice - AB05.checksum.spec.ts',
    'import { defineChecksumTest } from "checksumai";\ndefineChecksumTest("Enter AP Invoice", "AB05");\n');

  // Orphan: story with a testId but no paired spec.
  write(root, 'checksum/tests/reports/report-export-to-pdf-AB04.checksum.md',
    '---\ntitle: Report export to pdf\nchecksumTestId: AB04\n---\n\nStory body.\n');

  // The file the linter is actually invoked on. The .checksum.md scan is
  // repo-wide and runs regardless of which file is linted.
  // A checksum-flavored spec so the unwrapped_action rule is active: the raw
  // page.goto must be flagged, the wrapped click must not.
  write(root, 'checksum/tests/target.spec.ts',
    'import { test, expect, checksumAI, defineChecksumTest } from "@checksum-ai/runtime";\n\n' +
    'test("loads the home page", async ({ page }) => {\n' +
    '  await page.goto("https://example.com");\n' +
    '  await checksumAI("Click login button to open the login form", async () => {\n' +
    '    await page.getByRole("button", { name: "Login" }).click();\n' +
    '  });\n' +
    '  await expect(page.getByRole("heading")).toBeVisible();\n' +
    '});\n');

  // envLoader reads the key from this file (not process.env) and requires
  // >= 10 chars. The value is fake: the AI call is pointed at a refused port.
  write(root, '.env', 'ANTHROPIC_API_KEY=sk-ant-test-dummy-key\n');
  write(root, '.vscode/settings.json', JSON.stringify({
    'teamAiLinter.envFilePath': path.join(root, '.env'),
    'teamAiLinter.autoUpdate': false,
    'teamAiLinter.enableEslint': false,
    // Model id is irrelevant to behavior here: ANTHROPIC_BASE_URL points at a
    // refused port (unconditionally — no run of this harness is ever live), so
    // the AI layer always fails fast and only deterministic checks are under
    // test. TAL_E2E_MODEL only overrides the id recorded in settings.
    'teamAiLinter.model': process.env.TAL_E2E_MODEL || 'claude-sonnet-4-6',
  }, null, 2));

  // Commit everything so `git ls-files` sees the fixtures. Global/system git
  // config is neutralized: a developer's commit.gpgsign or core.hooksPath
  // would otherwise hang or fail the fixture commit.
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
  git('init', '-q');
  git('config', 'user.email', 'e2e@test.local');
  git('config', 'user.name', 'E2E');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixtures');

  return root;
}

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  const workspace = buildWorkspace();
  console.log(`[e2e] fixture workspace: ${workspace}`);

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspace, '--disable-extensions'],
      // Closed localhost port -> instant ECONNREFUSED in the SDK. Read by the
      // Anthropic client constructor inside the extension host process.
      extensionTestsEnv: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1' },
    });
  } catch (err) {
    console.error('[e2e] tests failed:', err);
    // exitCode, not process.exit(): exit() would skip the finally block and
    // leak the fixture workspace on every failed run.
    process.exitCode = 1;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

void main();
