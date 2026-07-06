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

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Full end-to-end test of the `.checksum.md` title-mismatch rules.
 *
 * Runs the real `teamAiLinter.runAll` command against the fixture workspace
 * (built by runTest.ts), then inspects the diagnostics the extension actually
 * publishes — exercising activate -> command -> Claude call -> deterministic
 * scan -> diagnostic collection end to end.
 */
suite('checksum.md title-mismatch rules (E2E)', () => {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const targetUri = vscode.Uri.file(path.join(root, 'checksum/tests/target.spec.ts'));

  /** Collect every diagnostic code the extension published for the linted file. */
  function codesFor(uri: vscode.Uri): Set<string> {
    return new Set(
      vscode.languages
        .getDiagnostics(uri)
        .map(d => String(d.code ?? ''))
        .filter(Boolean),
    );
  }

  test('flags spec-mismatch (error), orphan (warning), and filename (warning)', async function () {
    this.timeout(120_000);

    const doc = await vscode.workspace.openTextDocument(targetUri);
    await vscode.window.showTextDocument(doc);

    // Run the real command. It awaits the full pipeline (git safety + Claude
    // lint + deterministic scan) before resolving.
    await vscode.commands.executeCommand('teamAiLinter.runAll');

    // Diagnostics are set synchronously at the end of runAllChecks, but poll
    // briefly to be robust against any event-loop deferral.
    let codes = codesFor(targetUri);
    for (let i = 0; i < 20 && codes.size === 0; i++) {
      await new Promise(r => setTimeout(r, 250));
      codes = codesFor(targetUri);
    }

    const all = [...codes].join(', ');
    assert.ok(
      codes.has('checksum_md_title_spec_mismatch'),
      `expected spec-mismatch error (AB03). Got: ${all}`,
    );
    assert.ok(
      codes.has('checksum_md_orphaned_story'),
      `expected orphan warning (AB04). Got: ${all}`,
    );
    assert.ok(
      codes.has('checksum_md_title_filename_mismatch'),
      `expected filename warning (AB02). Got: ${all}`,
    );
    assert.ok(
      codes.has('unwrapped_action'),
      `expected unwrapped_action error for raw page.goto. Got: ${all}`,
    );
  });

  test('does not flag the control fixture (AB01)', () => {
    // AB01's title agrees with both its filename and paired spec. The only way
    // to over-flag it would be a false positive in one of the three rules; the
    // assertions above already require the true positives to be present, so a
    // clean run here confirms the rules are specific, not blanket.
    const diags = vscode.languages.getDiagnostics(targetUri);
    const ab01 = diags.filter(d => /AB01/.test(d.message));
    assert.strictEqual(ab01.length, 0, `AB01 should not be flagged; got: ${ab01.map(d => d.message).join(' | ')}`);
  });

  test('does not flag abbreviated spec titles (AB05)', () => {
    // AB05's spec title "Enter AP Invoice" abbreviates the story title
    // "Enter Accounts Payable Invoice (Trust Accountant)" — same test, so the
    // word-overlap comparison must not report a spec-mismatch.
    const diags = vscode.languages.getDiagnostics(targetUri);
    const ab05 = diags.filter(d => /AB05/.test(d.message));
    assert.strictEqual(ab05.length, 0, `AB05 should not be flagged; got: ${ab05.map(d => d.message).join(' | ')}`);
  });

  test('does not flag actions wrapped in checksumAI', () => {
    // target.spec.ts has one wrapped click (line 6) — only the raw goto at
    // line 4 may carry unwrapped_action.
    const diags = vscode.languages.getDiagnostics(targetUri);
    const unwrapped = diags.filter(d => String(d.code) === 'unwrapped_action');
    assert.ok(
      unwrapped.every(d => d.range.start.line === 3), // 0-indexed line 4
      `unwrapped_action should only hit the raw goto; got lines: ${unwrapped.map(d => d.range.start.line + 1).join(', ')}`,
    );
  });
});
