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

import * as vscode from 'vscode';
import { DiagnosticProvider } from '../diagnostics/diagnosticProvider';
import { LintIssue, ImportedFileIssue } from '../types';

/**
 * Convert an ImportedFileIssue to a LintIssue for diagnostics
 */
export function convertImportedToLintIssue(issue: ImportedFileIssue): LintIssue {
  return {
    line: issue.line,
    column: issue.column,
    endLine: issue.endLine,
    endColumn: issue.endColumn,
    message: issue.message,
    severity: issue.severity,
    rule: issue.rule,
    confidence: issue.confidence,
  };
}

/**
 * Group imported file issues by their source file path
 */
export function groupIssuesByFile(issues: ImportedFileIssue[]): Map<string, LintIssue[]> {
  const issuesByFile = new Map<string, LintIssue[]>();

  for (const issue of issues) {
    const importedFilePath = issue.importedFile;
    if (!issuesByFile.has(importedFilePath))
      issuesByFile.set(importedFilePath, []);

    issuesByFile.get(importedFilePath)!.push(convertImportedToLintIssue(issue));
  }

  return issuesByFile;
}

/**
 * Set diagnostics for all imported files
 */
export function setImportedFileDiagnostics(
  diagnosticProvider: DiagnosticProvider,
  importedFileIssues: ImportedFileIssue[]
): void {
  if (importedFileIssues.length === 0)
    return;


  const issuesByFile = groupIssuesByFile(importedFileIssues);

  for (const [importedFilePath, issues] of issuesByFile) {
    const fileUri = vscode.Uri.file(importedFilePath);
    diagnosticProvider.setLintDiagnostics(fileUri, issues);
  }
}
