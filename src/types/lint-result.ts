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

import { LintIssue, GitIssue, ImportedFileIssue, UnresolvedImport, WorkspaceIssue } from './issues';

/**
 * Result of linting a file with its imports
 */
export interface LintWithImportsResult {
  /** Issues found in the main file */
  mainIssues: LintIssue[];
  /** Issues found in imported files */
  importedIssues: ImportedFileIssue[];
  /** Import paths that couldn't be resolved (for debugging) */
  unresolvedImports: UnresolvedImport[];
  /** Files that were successfully linted */
  lintedFiles: string[];
}

/**
 * Result of linting a single file (for result store)
 */
export interface SingleFileLintResult {
  /** Path to the file that was linted */
  filePath: string;
  /** Content of the file at time of linting */
  fileContent: string;
  /** AI lint issues found */
  lintIssues: LintIssue[];
  /** Issues from imported files */
  importedIssues: ImportedFileIssue[];
  /** Git safety issues found */
  gitIssues: GitIssue[];
  /** Workspace-scoped issues (e.g. repo-wide filename checks) */
  workspaceIssues: WorkspaceIssue[];
}

/**
 * Result of linting a folder
 */
export interface FolderLintResult {
  /** Individual file results */
  fileResults: SingleFileLintResult[];
  /** Total count of issues across all files */
  totalIssues: number;
  /** Count of files linted */
  filesLinted: number;
}

/**
 * Statistics about lint results
 */
export interface LintResultStats {
  /** Number of error-severity issues */
  errorCount: number;
  /** Number of warning-severity issues */
  warningCount: number;
  /** Number of info-severity issues */
  infoCount: number;
  /** Total number of issues */
  totalCount: number;
}

/**
 * Calculate statistics from a list of lint issues
 */
export function calculateLintStats(issues: LintIssue[]): LintResultStats {
  const stats: LintResultStats = {
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    totalCount: issues.length,
  };

  for (const issue of issues) {
    switch (issue.severity) {
      case 'error':
        stats.errorCount++;
        break;
      case 'warning':
        stats.warningCount++;
        break;
      case 'info':
        stats.infoCount++;
        break;
    }
  }

  return stats;
}
