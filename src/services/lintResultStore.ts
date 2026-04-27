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
import { LintIssue, GitIssue } from '../diagnostics/diagnosticProvider';
import { ImportedFileIssue } from './importedFileLinter';
import { WorkspaceIssue } from '../types';

export interface StoredLintResult {
  filePath: string;
  fileContent?: string;
  lintIssues: LintIssue[];
  importedIssues?: ImportedFileIssue[];
  gitIssues?: GitIssue[];
  workspaceIssues?: WorkspaceIssue[];
  timestamp: Date;
}

export interface StoredFolderResult {
  results: Array<{
    filePath: string;
    lintIssues: LintIssue[];
    importedIssues: ImportedFileIssue[];
    gitIssues?: GitIssue[];
  }>;
  workspaceIssues?: WorkspaceIssue[];
  timestamp: Date;
}

/**
 * In-memory store for the most recent lint results
 * Allows copying the fix prompt after the notification has been dismissed
 */
class LintResultStoreClass {
  private lastSingleFileResult: StoredLintResult | null = null;
  private lastFolderResult: StoredFolderResult | null = null;
  private lastResultType: 'single' | 'folder' | null = null;

  /**
   * Store results from single file linting (lint only or all checks)
   */
  storeSingleFileResult(result: Omit<StoredLintResult, 'timestamp'>): void {
    this.lastSingleFileResult = {
      ...result,
      timestamp: new Date()
    };
    this.lastFolderResult = null;
    this.lastResultType = 'single';
  }

  /**
   * Store results from folder linting
   */
  storeFolderResult(results: StoredFolderResult['results'], workspaceIssues: WorkspaceIssue[] = []): void {
    this.lastFolderResult = {
      results,
      workspaceIssues,
      timestamp: new Date()
    };
    this.lastSingleFileResult = null;
    this.lastResultType = 'folder';
  }

  /**
   * Get the last single file result
   */
  getLastSingleFileResult(): StoredLintResult | null {
    return this.lastSingleFileResult;
  }

  /**
   * Get the last folder result
   */
  getLastFolderResult(): StoredFolderResult | null {
    return this.lastFolderResult;
  }

  /**
   * Get the type of the last result
   */
  getLastResultType(): 'single' | 'folder' | null {
    return this.lastResultType;
  }

  /**
   * Check if there are any stored results with issues
   */
  hasResults(): boolean {
    if (this.lastResultType === 'single' && this.lastSingleFileResult) {
      const result = this.lastSingleFileResult;
      return (
        result.lintIssues.length > 0 ||
        (result.importedIssues?.length ?? 0) > 0 ||
        (result.gitIssues?.length ?? 0) > 0 ||
        (result.workspaceIssues?.length ?? 0) > 0
      );
    }
    if (this.lastResultType === 'folder' && this.lastFolderResult) {
      const folder = this.lastFolderResult;
      return folder.results.some(
          r => r.lintIssues.length > 0 || r.importedIssues.length > 0 || (r.gitIssues?.length ?? 0) > 0
      ) || (folder.workspaceIssues?.length ?? 0) > 0;
    }
    return false;
  }

  /**
   * Clear stored results
   */
  clear(): void {
    this.lastSingleFileResult = null;
    this.lastFolderResult = null;
    this.lastResultType = null;
  }
}

// Export singleton instance
export const LintResultStore = new LintResultStoreClass();
