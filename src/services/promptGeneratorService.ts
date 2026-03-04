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
import { LintIssue, GitIssue } from '../diagnostics/diagnosticProvider';
import { ImportedFileIssue } from './importedFileLinter';

export interface PromptData {
  filePath: string;
  fileContent?: string;
  lintIssues: LintIssue[];
  importedIssues?: ImportedFileIssue[];
  gitIssues?: GitIssue[];
  ignoredIssues?: string[];
}

export interface FolderPromptData {
  filePath: string;
  lintIssues: LintIssue[];
  importedIssues: ImportedFileIssue[];
  gitIssues?: GitIssue[];
}

// Rules to exclude from fix prompts (hard to fix automatically)
const EXCLUDED_RULES = ['waitForTimeout'];

function shouldIncludeIssue(rule: string): boolean {
  return !EXCLUDED_RULES.some(excluded => rule.toLowerCase().includes(excluded.toLowerCase()));
}

/**
 * Check if an issue is in the ignored set
 * Issue ID format: "filePath:line:rule"
 */
function isIssueIgnored(filePath: string, line: number, rule: string, ignoredIssues?: string[]): boolean {
  if (!ignoredIssues || ignoredIssues.length === 0)
    return false;

  const issueId = `${filePath}:${line}:${rule}`;
  return ignoredIssues.includes(issueId);
}

/**
 * Generate a fix prompt for a single file's linting issues
 */
export function generateFixPrompt(data: PromptData): string {
  const { filePath, fileContent, lintIssues, importedIssues, gitIssues, ignoredIssues } = data;

  // Filter out excluded rules and ignored issues
  const filteredLintIssues = lintIssues.filter(issue =>
    shouldIncludeIssue(issue.rule) && !isIssueIgnored(filePath, issue.line, issue.rule, ignoredIssues)
  );
  const filteredImportedIssues = importedIssues?.filter(issue =>
    shouldIncludeIssue(issue.rule) && !isIssueIgnored(issue.importedFile, issue.line, issue.rule, ignoredIssues)
  );
  const filteredGitIssues = gitIssues?.filter(issue =>
    !isIssueIgnored(filePath, issue.importLine, issue.moduleSpecifier, ignoredIssues)
  );

  const lines: string[] = [];

  // Separate critical git issues for prominent sections
  const unstagedGitIssues = filteredGitIssues?.filter(issue => issue.isUnstaged) || [];
  const missingGitIssues = filteredGitIssues?.filter(issue => issue.isMissing) || [];
  const otherGitIssues = filteredGitIssues?.filter(issue => !issue.isUnstaged && !issue.isMissing) || [];

  // CRITICAL: Missing files section at the very top
  if (missingGitIssues.length > 0) {
    lines.push('⚠️ CRITICAL — Missing Imported Files:');
    lines.push('');
    lines.push('The following imported files DO NOT EXIST. Your tests will fail.');
    lines.push('Create the files or fix the import paths.');
    lines.push('');
    missingGitIssues.forEach((issue, index) => {
      lines.push(`${index + 1}. "${issue.moduleSpecifier}" (Line ${issue.importLine})`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // CRITICAL: Unstaged files section
  if (unstagedGitIssues.length > 0) {
    lines.push('⚠️ CRITICAL — Stage These Files Before Committing:');
    lines.push('');
    lines.push('The following imported files have changes that are NOT staged for commit.');
    lines.push('If you commit without staging them, your tests will break on a clean checkout.');
    lines.push('');
    unstagedGitIssues.forEach((issue, index) => {
      const fileTip = issue.resolvedFilePath || issue.moduleSpecifier;
      lines.push(`${index + 1}. ${issue.moduleSpecifier} (Line ${issue.importLine})`);
      lines.push(`   Run: git add ${fileTip}`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('Fix the following linting issues in my Playwright test file:');
  lines.push('');
  lines.push(`File: ${filePath}`);
  lines.push('');

  // Main lint issues
  if (filteredLintIssues.length > 0) {
    lines.push(`Lint Issues (${filteredLintIssues.length}):`);
    filteredLintIssues.forEach((issue, index) => {
      const severity = issue.severity.toUpperCase();
      lines.push(`${index + 1}. Line ${issue.line} [${issue.rule}] (${severity}): ${issue.message}`);
    });
    lines.push('');
  }

  // Imported file issues
  if (filteredImportedIssues && filteredImportedIssues.length > 0) {
    lines.push(`Imported File Issues (${filteredImportedIssues.length}):`);
    filteredImportedIssues.forEach((issue, index) => {
      const importedFileName = path.basename(issue.importedFile);
      const severity = issue.severity.toUpperCase();
      lines.push(`${index + 1}. ${importedFileName}:${issue.line} [${issue.rule}] (${severity}): ${issue.message}`);
    });
    lines.push('');
  }

  // Other git safety issues (non-unstaged)
  if (otherGitIssues.length > 0) {
    lines.push(`Git Safety Issues (${otherGitIssues.length}):`);
    otherGitIssues.forEach((issue, index) => {
      const severity = issue.severity.toUpperCase();
      lines.push(`${index + 1}. Line ${issue.importLine} [${issue.moduleSpecifier}] (${severity}): ${issue.message}`);
    });
    lines.push('');
  }

  // Include file content for context
  if (fileContent) {
    lines.push('---');
    lines.push('File Content:');
    lines.push('```typescript');
    lines.push(fileContent);
    lines.push('```');
    lines.push('');
  }

  lines.push('Please fix these issues while maintaining the existing test logic.');

  return lines.join('\n');
}

/**
 * Generate a fix prompt for multiple files (folder lint)
 */
export function generateFolderFixPrompt(results: FolderPromptData[], ignoredIssues?: string[]): string {
  // Filter issues and only include files that have remaining issues after filtering
  const filesWithIssues = results
      .map(r => ({
        ...r,
        lintIssues: r.lintIssues.filter(issue =>
          shouldIncludeIssue(issue.rule) && !isIssueIgnored(r.filePath, issue.line, issue.rule, ignoredIssues)
        ),
        importedIssues: r.importedIssues.filter(issue =>
          shouldIncludeIssue(issue.rule) && !isIssueIgnored(issue.importedFile, issue.line, issue.rule, ignoredIssues)
        ),
        gitIssues: (r.gitIssues || []).filter(issue =>
          !isIssueIgnored(r.filePath, issue.importLine, issue.moduleSpecifier, ignoredIssues)
        )
      }))
      .filter(r => r.lintIssues.length > 0 || r.importedIssues.length > 0 || r.gitIssues.length > 0);

  if (filesWithIssues.length === 0)
    return 'No issues found in any files.';


  const lines: string[] = [];

  // Collect all critical git issues across files for a top-level section
  const allMissingGitIssues: GitIssue[] = [];
  const allUnstagedGitIssues: GitIssue[] = [];
  for (const r of filesWithIssues) {
    for (const issue of r.gitIssues) {
      if (issue.isMissing) allMissingGitIssues.push(issue);
      else if (issue.isUnstaged) allUnstagedGitIssues.push(issue);
    }
  }

  // CRITICAL: Missing files section at the very top
  if (allMissingGitIssues.length > 0) {
    lines.push('⚠️ CRITICAL — Missing Imported Files:');
    lines.push('');
    lines.push('The following imported files DO NOT EXIST. Your tests will fail.');
    lines.push('Create the files or fix the import paths.');
    lines.push('');
    allMissingGitIssues.forEach((issue, index) => {
      lines.push(`${index + 1}. "${issue.moduleSpecifier}" (Line ${issue.importLine})`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // CRITICAL: Unstaged files section
  if (allUnstagedGitIssues.length > 0) {
    lines.push('⚠️ CRITICAL — Stage These Files Before Committing:');
    lines.push('');
    lines.push('The following imported files have changes that are NOT staged for commit.');
    lines.push('If you commit without staging them, your tests will break on a clean checkout.');
    lines.push('');
    allUnstagedGitIssues.forEach((issue, index) => {
      const fileTip = issue.resolvedFilePath || issue.moduleSpecifier;
      lines.push(`${index + 1}. ${issue.moduleSpecifier} (Line ${issue.importLine})`);
      lines.push(`   Run: git add ${fileTip}`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('Fix the following linting issues in my Playwright test files:');
  lines.push('');

  filesWithIssues.forEach((result, fileIndex) => {
    lines.push(`## File ${fileIndex + 1}: ${result.filePath}`);
    lines.push('');

    // Lint issues for this file
    if (result.lintIssues.length > 0) {
      lines.push(`Lint Issues (${result.lintIssues.length}):`);
      result.lintIssues.forEach((issue, index) => {
        const severity = issue.severity.toUpperCase();
        lines.push(`${index + 1}. Line ${issue.line} [${issue.rule}] (${severity}): ${issue.message}`);
      });
      lines.push('');
    }

    // Imported file issues for this file
    if (result.importedIssues.length > 0) {
      lines.push(`Imported File Issues (${result.importedIssues.length}):`);
      result.importedIssues.forEach((issue, index) => {
        const importedFileName = path.basename(issue.importedFile);
        const severity = issue.severity.toUpperCase();
        lines.push(`${index + 1}. ${importedFileName}:${issue.line} [${issue.rule}] (${severity}): ${issue.message}`);
      });
      lines.push('');
    }

    // Other git safety issues (non-critical ones not covered by the top sections)
    const otherGitIssues = result.gitIssues.filter(issue => !issue.isUnstaged && !issue.isMissing);
    if (otherGitIssues.length > 0) {
      lines.push(`Git Safety Issues (${otherGitIssues.length}):`);
      otherGitIssues.forEach((issue, index) => {
        const severity = issue.severity.toUpperCase();
        lines.push(`${index + 1}. Line ${issue.importLine} [${issue.moduleSpecifier}] (${severity}): ${issue.message}`);
      });
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  lines.push('Please fix these issues while maintaining the existing test logic.');

  return lines.join('\n');
}
