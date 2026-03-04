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
import * as fs from 'fs';

const LINT_TIMESTAMP_PATTERN = /\/\/\s*Last linted:.*$/m;
const LINT_TIMESTAMP_PREFIX = '// Last linted: ';

/**
 * Update or add a "Last linted" timestamp comment at the bottom of a file
 */
export async function updateLastLintedTimestamp(filePath: string): Promise<void> {
  try {
    const timestamp = new Date().toLocaleString();
    const newComment = `${LINT_TIMESTAMP_PREFIX}${timestamp}`;

    // Read current file content
    const content = fs.readFileSync(filePath, 'utf-8');

    let newContent: string;

    if (LINT_TIMESTAMP_PATTERN.test(content)) {
      // Update existing timestamp
      newContent = content.replace(LINT_TIMESTAMP_PATTERN, newComment);
    } else {
      // Add new timestamp at the end
      // Ensure there's a newline before the comment
      const trimmedContent = content.trimEnd();
      newContent = `${trimmedContent}\n\n${newComment}\n`;
    }

    // Only write if content changed
    if (newContent !== content)
      fs.writeFileSync(filePath, newContent, 'utf-8');

  } catch (error) {
    // Silently fail - timestamp is not critical
    console.warn(`Failed to update lint timestamp for ${filePath}:`, error);
  }
}

/**
 * Update timestamp for a VS Code document (saves the document after)
 */
export async function updateLastLintedTimestampForDocument(document: vscode.TextDocument): Promise<void> {
  try {
    const timestamp = new Date().toLocaleString();
    const newComment = `${LINT_TIMESTAMP_PREFIX}${timestamp}`;

    const content = document.getText();
    const edit = new vscode.WorkspaceEdit();

    if (LINT_TIMESTAMP_PATTERN.test(content)) {
      // Find and replace existing timestamp
      const match = content.match(LINT_TIMESTAMP_PATTERN);
      if (match && match.index !== undefined) {
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        edit.replace(document.uri, new vscode.Range(startPos, endPos), newComment);
      }
    } else {
      // Add new timestamp at the end
      const lastLine = document.lineCount - 1;
      const lastLineText = document.lineAt(lastLine).text;
      const position = new vscode.Position(lastLine, lastLineText.length);

      // Add newlines if needed
      const prefix = lastLineText.trim() === '' ? '\n' : '\n\n';
      edit.insert(document.uri, position, `${prefix}${newComment}\n`);
    }

    await vscode.workspace.applyEdit(edit);
    await document.save();
  } catch (error) {
    console.warn(`Failed to update lint timestamp:`, error);
  }
}
