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
import { LintIssue, GitIssue } from '../types';

// Re-export types for backward compatibility with existing imports
export type { LintIssue, GitIssue } from '../types';

const SRC_LINT = 'Team AI Linter';
const SRC_GIT = 'Team AI Linter (Git)';
const SRC_ESLINT = 'Team AI Linter (ESLint)';

export class DiagnosticProvider implements vscode.Disposable {
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('team-ai-linter');
  }

  /**
   * Set AI lint diagnostics for a document
   */
  setLintDiagnostics(uri: vscode.Uri, issues: LintIssue[]): void {
    const diagnostics = issues.map(issue => this.lintIssueToDiagnostic(issue));
    const git = this.getGitDiagnostics(uri);
    const eslint = this.getEslintDiagnostics(uri);
    this.collection.set(uri, [...diagnostics, ...git, ...eslint]);
  }

  /**
   * Set git safety diagnostics for a document
   */
  setGitDiagnostics(uri: vscode.Uri, issues: GitIssue[]): void {
    const diagnostics = issues.map(issue => this.gitIssueToDiagnostic(issue));
    const lint = this.getLintDiagnostics(uri);
    const eslint = this.getEslintDiagnostics(uri);
    this.collection.set(uri, [...lint, ...diagnostics, ...eslint]);
  }

  /**
   * Set ESLint diagnostics for a document
   */
  setEslintDiagnostics(uri: vscode.Uri, issues: LintIssue[]): void {
    const diagnostics = issues.map(issue => this.eslintIssueToDiagnostic(issue));
    const lint = this.getLintDiagnostics(uri);
    const git = this.getGitDiagnostics(uri);
    this.collection.set(uri, [...lint, ...git, ...diagnostics]);
  }

  /**
   * Set AI lint, git, and ESLint diagnostics at once
   */
  setAllDiagnostics(
    uri: vscode.Uri,
    lintIssues: LintIssue[],
    gitIssues: GitIssue[],
    eslintIssues: LintIssue[] = [],
  ): void {
    const lintD = lintIssues.map(issue => this.lintIssueToDiagnostic(issue));
    const gitD = gitIssues.map(issue => this.gitIssueToDiagnostic(issue));
    const eslintD = eslintIssues.map(issue => this.eslintIssueToDiagnostic(issue));
    this.collection.set(uri, [...lintD, ...gitD, ...eslintD]);
  }

  /**
   * Clear all diagnostics for a document
   */
  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  /**
   * Clear all diagnostics
   */
  clearAll(): void {
    this.collection.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }

  private lintIssueToDiagnostic(issue: LintIssue): vscode.Diagnostic {
    const startLine = Math.max(0, issue.line - 1);
    const startCol = issue.column ? Math.max(0, issue.column - 1) : 0;
    const endLine = issue.endLine ? Math.max(0, issue.endLine - 1) : startLine;
    const endCol = issue.endColumn ? issue.endColumn : 1000;

    const range = new vscode.Range(startLine, startCol, endLine, endCol);

    // Include confidence percentage if available
    const confidenceStr = issue.confidence !== undefined
      ? ` (${Math.round(issue.confidence * 100)}% confidence)`
      : '';

    const diagnostic = new vscode.Diagnostic(
        range,
        `[${issue.rule}] ${issue.message}${confidenceStr}`,
        this.mapSeverity(issue.severity)
    );

    diagnostic.source = SRC_LINT;
    diagnostic.code = issue.rule;

    return diagnostic;
  }

  private eslintIssueToDiagnostic(issue: LintIssue): vscode.Diagnostic {
    const startLine = Math.max(0, issue.line - 1);
    const startCol = issue.column ? Math.max(0, issue.column - 1) : 0;
    const endLine = issue.endLine ? Math.max(0, issue.endLine - 1) : startLine;
    const endCol = issue.endColumn ? issue.endColumn : 1000;

    const range = new vscode.Range(startLine, startCol, endLine, endCol);

    const diagnostic = new vscode.Diagnostic(
        range,
        `[${issue.rule}] ${issue.message}`,
        this.mapSeverity(issue.severity)
    );

    diagnostic.source = SRC_ESLINT;
    diagnostic.code = issue.rule;

    return diagnostic;
  }

  private gitIssueToDiagnostic(issue: GitIssue): vscode.Diagnostic {
    const line = Math.max(0, issue.importLine - 1);
    const range = new vscode.Range(line, 0, line, 1000);

    const diagnostic = new vscode.Diagnostic(
        range,
        issue.message,
        issue.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning
    );

    diagnostic.source = SRC_GIT;
    diagnostic.code = 'git-safety';

    return diagnostic;
  }

  private mapSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'error':
        return vscode.DiagnosticSeverity.Error;
      case 'warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'info':
      default:
        return vscode.DiagnosticSeverity.Information;
    }
  }

  private getLintDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
    const all = this.collection.get(uri) || [];
    return all.filter(d => d.source === SRC_LINT);
  }

  private getGitDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
    const all = this.collection.get(uri) || [];
    return all.filter(d => d.source === SRC_GIT);
  }

  private getEslintDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
    const all = this.collection.get(uri) || [];
    return all.filter(d => d.source === SRC_ESLINT);
  }
}
