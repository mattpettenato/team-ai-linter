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

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

/**
 * Diagnostics contract: after teamAiLinter.runAll (which mdTitle.e2e.test.ts
 * has already executed against this workspace), published diagnostics must
 * carry the right source, severity mapping, and sane ranges — and the run must
 * have produced deterministic results DESPITE the AI layer failing (the
 * harness points ANTHROPIC_BASE_URL at a refused port: bug-#2 integration copy).
 */
suite('diagnostics contract (E2E, AI offline)', () => {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath
  const targetUri = vscode.Uri.file(path.join(root, 'checksum/tests/target.spec.ts'))

  suiteSetup(async function () {
    this.timeout(120_000)
    if (vscode.languages.getDiagnostics(targetUri).length === 0) {
      const doc = await vscode.workspace.openTextDocument(targetUri)
      await vscode.window.showTextDocument(doc)
      await vscode.commands.executeCommand('teamAiLinter.runAll')
      for (let i = 0; i < 40 && vscode.languages.getDiagnostics(targetUri).length === 0; i++) {
        await new Promise(r => setTimeout(r, 250))
      }
    }
  })

  test('deterministic diagnostics exist even though the AI call failed', () => {
    const diags = vscode.languages.getDiagnostics(targetUri)
    assert.ok(diags.length > 0, 'expected deterministic diagnostics with AI unreachable — bug #2 regressed')
  })

  test('spec-mismatch is an Error, filename/orphan are Warnings', () => {
    const diags = vscode.languages.getDiagnostics(targetUri)
    const bySev = (code: string) => diags.find(d => String(d.code) === code)?.severity
    assert.strictEqual(bySev('checksum_md_title_spec_mismatch'), vscode.DiagnosticSeverity.Error)
    assert.strictEqual(bySev('checksum_md_title_filename_mismatch'), vscode.DiagnosticSeverity.Warning)
    assert.strictEqual(bySev('checksum_md_orphaned_story'), vscode.DiagnosticSeverity.Warning)
  })

  test('every diagnostic has a non-negative in-file range', () => {
    const content = require('fs').readFileSync(targetUri.fsPath, 'utf-8') as string
    const lineCount = content.split('\n').length
    for (const d of vscode.languages.getDiagnostics(targetUri)) {
      assert.ok(d.range.start.line >= 0 && d.range.start.line < lineCount,
        `diagnostic "${d.code}" has out-of-file line ${d.range.start.line}`)
    }
  })
})
