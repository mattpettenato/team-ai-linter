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

import { Severity, GitSeverity } from './severity';

/**
 * Base interface for all issues with common fields
 */
interface BaseIssue {
  /** Line number where the issue occurs (1-indexed) */
  line: number;
  /** Human-readable description of the issue */
  message: string;
}

/**
 * Issue found by AI or deterministic linting
 */
export interface LintIssue extends BaseIssue {
  /** Column number (1-indexed, optional) */
  column?: number;
  /** End line number for multi-line issues */
  endLine?: number;
  /** End column number */
  endColumn?: number;
  /** Issue severity */
  severity: Severity;
  /** Rule identifier that was violated */
  rule: string;
  /** AI confidence score (0.0 to 1.0) */
  confidence?: number;
}

/**
 * Issue related to git safety of imports
 */
export interface GitIssue {
  /** Line number where the import statement is */
  importLine: number;
  /** The module specifier from the import statement */
  moduleSpecifier: string;
  /** Human-readable description of the issue */
  message: string;
  /** Issue severity (errors for missing files, warnings for uncommitted) */
  severity: GitSeverity;
  /** Absolute path of the resolved imported file (for git add commands) */
  resolvedFilePath?: string;
  /** Whether this issue is about an unstaged file that won't be included in a commit */
  isUnstaged?: boolean;
  /** Whether this issue is about a file that doesn't exist at all */
  isMissing?: boolean;
  /** Whether this issue is a case mismatch (works on macOS, fails on Linux) */
  isCaseMismatch?: boolean;
}

/**
 * LintIssue extended with information about the imported file it came from.
 * Used when recursively linting imported utility files.
 */
export interface ImportedFileIssue extends LintIssue {
  /** The original test file that was being linted */
  sourceFile: string;
  /** The utility file where this issue was found */
  importedFile: string;
  /** Line number in the source file where the import statement is */
  importLine: number;
}

/**
 * Unresolved import that couldn't be linted
 */
export interface UnresolvedImport {
  /** The module specifier that couldn't be resolved */
  moduleSpecifier: string;
  /** Line number where the import occurs */
  line: number;
  /** File containing the unresolved import */
  fromFile: string;
}

/**
 * Type guard for LintIssue
 */
export function isLintIssue(issue: unknown): issue is LintIssue {
  return (
    typeof issue === 'object' &&
    issue !== null &&
    typeof (issue as LintIssue).line === 'number' &&
    typeof (issue as LintIssue).message === 'string' &&
    typeof (issue as LintIssue).rule === 'string' &&
    typeof (issue as LintIssue).severity === 'string'
  );
}

/**
 * Type guard for GitIssue
 */
export function isGitIssue(issue: unknown): issue is GitIssue {
  return (
    typeof issue === 'object' &&
    issue !== null &&
    typeof (issue as GitIssue).importLine === 'number' &&
    typeof (issue as GitIssue).moduleSpecifier === 'string' &&
    typeof (issue as GitIssue).message === 'string' &&
    typeof (issue as GitIssue).severity === 'string'
  );
}

/**
 * Type guard for ImportedFileIssue
 */
export function isImportedFileIssue(issue: unknown): issue is ImportedFileIssue {
  return (
    isLintIssue(issue) &&
    typeof (issue as ImportedFileIssue).sourceFile === 'string' &&
    typeof (issue as ImportedFileIssue).importedFile === 'string' &&
    typeof (issue as ImportedFileIssue).importLine === 'number'
  );
}
