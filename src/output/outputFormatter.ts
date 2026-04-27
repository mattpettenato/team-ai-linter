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
import * as vscode from 'vscode';
import { LintIssue, GitIssue, ImportedFileIssue, Severity, WorkspaceIssue } from '../types';

/**
 * Get the icon for a severity level
 */
export function getSeverityIcon(severity: Severity): string {
  switch (severity) {
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '•';
  }
}

/**
 * Format a file path for display in VS Code output channel.
 * Shows filename:line for readability - use Problems panel for navigation.
 */
export function formatFileReference(filePath: string, line: number): string {
  const fileName = path.basename(filePath);
  return `${fileName}:${line}`;
}

/**
 * Output channel writer for lint results
 */
export class OutputFormatter {
  private channel: vscode.OutputChannel;

  constructor(channel: vscode.OutputChannel) {
    this.channel = channel;
  }

  /**
   * Log a horizontal separator
   */
  separator(char: string = '─', length: number = 40): void {
    this.channel.appendLine(char.repeat(length));
  }

  /**
   * Log a double separator (for headers/footers)
   */
  doubleSeparator(length: number = 60): void {
    this.channel.appendLine('═'.repeat(length));
  }

  /**
   * Log an empty line
   */
  newLine(): void {
    this.channel.appendLine('');
  }

  /**
   * Log a header for single file lint results
   */
  logFileHeader(filePath: string): void {
    const fileName = path.basename(filePath);
    this.newLine();
    this.doubleSeparator();
    this.channel.appendLine(`Team AI Linter Results: ${fileName}`);
    this.channel.appendLine(`File: ${filePath}`);
    this.channel.appendLine(`Time: ${new Date().toLocaleTimeString()}`);
    this.doubleSeparator();
  }

  /**
   * Log a header for folder lint results
   */
  logFolderHeader(folderPath: string, fileCount: number): void {
    this.newLine();
    this.doubleSeparator();
    this.channel.appendLine(`Linting folder: ${folderPath}`);
    this.channel.appendLine(`Found ${fileCount} test file(s)`);
    this.doubleSeparator();
  }

  /**
   * Log lint issues for the main file
   */
  logLintIssues(filePath: string, issues: LintIssue[]): void {
    if (issues.length === 0)
      return;

    this.newLine();
    this.channel.appendLine(`📋 AI LINT ISSUES (${issues.length})`);
    this.separator();

    for (const issue of issues) {
      const icon = getSeverityIcon(issue.severity);
      this.channel.appendLine(`${icon} ${formatFileReference(filePath, issue.line)}`);
      this.channel.appendLine(`   [${issue.rule}] ${issue.message}`);
      this.newLine();
    }
  }

  /**
   * Log ESLint issues for the main file
   */
  logEslintIssues(filePath: string, issues: LintIssue[]): void {
    if (issues.length === 0)
      return;

    this.newLine();
    this.channel.appendLine(`🧹 ESLINT ISSUES (${issues.length})`);
    this.separator();

    for (const issue of issues) {
      const icon = getSeverityIcon(issue.severity);
      this.channel.appendLine(`${icon} ${formatFileReference(filePath, issue.line)}`);
      this.channel.appendLine(`   [${issue.rule}] ${issue.message}`);
      this.newLine();
    }
  }

  /**
   * Log imported file issues
   */
  logImportedFileIssues(issues: ImportedFileIssue[]): void {
    if (issues.length === 0)
      return;

    this.newLine();
    this.channel.appendLine(`📦 IMPORTED FILE ISSUES (${issues.length})`);
    this.separator();

    for (const issue of issues) {
      const icon = getSeverityIcon(issue.severity);
      this.channel.appendLine(`${icon} ${formatFileReference(issue.importedFile, issue.line)}`);
      this.channel.appendLine(`   [${issue.rule}] ${issue.message}`);
      this.newLine();
    }
  }

  /**
   * Log git safety issues
   */
  logGitIssues(filePath: string, issues: GitIssue[]): void {
    if (issues.length === 0)
      return;

    this.newLine();
    this.channel.appendLine(`🔒 GIT SAFETY ISSUES (${issues.length})`);
    this.separator();

    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      this.channel.appendLine(`${icon} ${formatFileReference(filePath, issue.importLine)}`);
      this.channel.appendLine(`   [${issue.moduleSpecifier}] ${issue.message}`);
      this.newLine();
    }
  }

  /**
   * Log workspace-scoped issues (repo-wide, not attached to any single file).
   */
  logWorkspaceIssues(issues: WorkspaceIssue[]): void {
    if (issues.length === 0)
      return;

    this.newLine();
    this.channel.appendLine(`🌐 WORKSPACE ISSUES (${issues.length})`);
    this.separator();

    for (const issue of issues) {
      const icon = getSeverityIcon(issue.severity);
      this.channel.appendLine(`${icon} ${issue.offenderPath}`);
      this.channel.appendLine(`   [${issue.rule}] ${issue.message}`);
      this.newLine();
    }
  }

  /**
   * Log unresolved imports warning
   */
  logUnresolvedImports(
    unresolvedImports: Array<{ moduleSpecifier: string; line: number; fromFile: string }>
  ): void {
    if (unresolvedImports.length === 0)
      return;

    this.newLine();
    this.channel.appendLine(`⚠️ UNRESOLVED IMPORTS (${unresolvedImports.length}) - These files were NOT linted`);
    this.separator();

    for (const unresolved of unresolvedImports) {
      this.channel.appendLine(`   ⚠️ "${unresolved.moduleSpecifier}" at line ${unresolved.line}`);
      this.channel.appendLine(`      from: ${path.basename(unresolved.fromFile)}`);
    }
    this.newLine();
  }

  /**
   * Log list of linted files
   */
  logLintedFiles(files: string[]): void {
    if (files.length <= 1)
      return;

    this.newLine();
    this.channel.appendLine(`📁 FILES LINTED (${files.length})`);
    this.separator();

    for (const file of files)
      this.channel.appendLine(`   ✓ ${path.basename(file)}`);

  }

  /**
   * Log success message when no issues found
   */
  logNoIssuesFound(): void {
    this.newLine();
    this.channel.appendLine('✅ No issues found!');
  }

  /**
   * Log a footer separator
   */
  logFooter(): void {
    this.doubleSeparator();
  }

  /**
   * Log git safety check error
   */
  logGitSafetyError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Git safety check failed:', error);

    this.newLine();
    this.channel.appendLine('⚠️ GIT SAFETY CHECK FAILED');
    this.separator();
    this.channel.appendLine(`Error: ${errorMessage}`);
    if (errorStack)
      this.channel.appendLine(`Stack: ${errorStack}`);

    this.newLine();
  }

  /**
   * Log folder lint summary
   */
  logFolderSummary(
    totalFiles: number,
    filesWithIssues: number,
    lintIssueCount: number,
    importedIssueCount: number,
    gitIssueCount?: number
  ): void {
    this.newLine();
    this.doubleSeparator();
    this.channel.appendLine('Summary:');
    this.channel.appendLine(`  Files scanned: ${totalFiles}`);
    this.channel.appendLine(`  Files with issues: ${filesWithIssues}`);
    this.channel.appendLine(`  Lint issues: ${lintIssueCount}`);
    this.channel.appendLine(`  Imported file issues: ${importedIssueCount}`);
    if (gitIssueCount && gitIssueCount > 0)
      this.channel.appendLine(`  Git safety issues: ${gitIssueCount}`);
    this.doubleSeparator();
  }

  /**
   * Log a single file's issues during folder scan (compact format)
   */
  logFileIssuesCompact(
    filePath: string,
    lintIssues: LintIssue[],
    importedIssues: ImportedFileIssue[],
    gitIssues?: GitIssue[]
  ): void {
    if (lintIssues.length === 0 && importedIssues.length === 0 && (!gitIssues || gitIssues.length === 0))
      return;

    const fileName = path.basename(filePath);
    this.newLine();
    this.channel.appendLine(`📄 ${fileName}`);
    this.separator();

    if (gitIssues && gitIssues.length > 0) {
      for (const issue of gitIssues) {
        const icon = getSeverityIcon(issue.severity);
        this.channel.appendLine(`  ${icon} ${formatFileReference(filePath, issue.importLine)}`);
        this.channel.appendLine(`     [${issue.moduleSpecifier}] ${issue.message}`);
      }
    }

    for (const issue of lintIssues) {
      const icon = getSeverityIcon(issue.severity);
      this.channel.appendLine(`  ${icon} ${formatFileReference(filePath, issue.line)}`);
      this.channel.appendLine(`     [${issue.rule}] ${issue.message}`);
    }

    for (const issue of importedIssues) {
      const icon = getSeverityIcon(issue.severity);
      this.channel.appendLine(`  ${icon} ${formatFileReference(issue.importedFile, issue.line)}`);
      this.channel.appendLine(`     [${issue.rule}] ${issue.message}`);
    }
  }

  /**
   * Log cancellation message
   */
  logCancelled(): void {
    this.channel.appendLine('\nLinting cancelled by user');
  }

  /**
   * Log an error for a specific file
   */
  logFileError(fileName: string, error: unknown): void {
    this.channel.appendLine(`Error linting ${fileName}: ${error}`);
  }
}
