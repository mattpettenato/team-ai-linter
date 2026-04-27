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

import * as path from 'path';
import { execFileSync } from 'child_process';
import { WorkspaceIssue } from '../../types';

/**
 * Detect workspace-scoped issues. These apply to the repo as a whole, not to
 * any single file being linted, so they surface in a dedicated "Workspace
 * Issues" panel section and do NOT create editor diagnostics on the currently
 * open file.
 *
 * Currently checks:
 * - Filenames containing ':' (break `git clone`/`git checkout` on Windows).
 */
export async function detectWorkspaceIssues(workspaceRoot: string): Promise<WorkspaceIssue[]> {
  const issues: WorkspaceIssue[] = [];

  // Filenames containing ':' break git clone/checkout on Windows.
  // Use `git ls-files` so we only flag tracked files.
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });

    // -z uses NUL as separator so filenames with spaces/special chars are safe
    const trackedFiles = output.split('\0').filter(Boolean);

    for (const relPath of trackedFiles) {
      const baseName = path.basename(relPath);
      if (baseName.includes(':')) {
        const suggestedName = baseName.replace(/:/g, '-');
        issues.push({
          rule: 'invalid_filename_colon',
          severity: 'error',
          message: `Filename contains ':' which breaks git clone/checkout on Windows. Rename to: ${suggestedName}`,
          offenderPath: path.join(workspaceRoot, relPath),
          suggestedFix: suggestedName,
        });
      }
    }
  } catch (error) {
    // Silently skip if not a git repo, git not installed, or scan fails.
    console.warn('[WorkspaceIssues] Failed to scan for invalid filenames:', error);
  }

  return issues;
}
