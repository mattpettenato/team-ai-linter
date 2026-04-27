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
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { LintIssue, GitIssue } from '../diagnostics/diagnosticProvider';
import { ImportedFileIssue } from '../services/importedFileLinter';
import { WorkspaceIssue } from '../types';
import { generatePanelHtml, generateLoadingHtml } from './panelHtml';
import { getExtensionVersion } from '../services/versionService';

function getCurrentUsername(): string {
  return os.userInfo().username;
}

function toDisplayWorkspaceIssues(issues: WorkspaceIssue[]): DisplayWorkspaceIssue[] {
  return issues.map(issue => ({
    rule: issue.rule,
    severity: issue.severity,
    message: issue.message,
    offenderPath: issue.offenderPath,
    offenderName: path.basename(issue.offenderPath),
    suggestedFix: issue.suggestedFix,
  }));
}

export interface DisplayIssue {
  line: number;
  message: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  confidence?: number;
  source: 'lint' | 'imported' | 'git';
  filePath: string;
  lineContent?: string; // Preview of the actual code on this line
  isUnstaged?: boolean;
  isMissing?: boolean;
  isCaseMismatch?: boolean;
  resolvedFilePath?: string;
}

export interface FileResult {
  filePath: string;
  fileName: string;
  issues: DisplayIssue[];
}

export interface UnstagedFile {
  filePath: string;
  moduleSpecifier: string;
}

export interface MissingFile {
  moduleSpecifier: string;
}

export interface DisplayWorkspaceIssue {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  offenderPath: string;
  offenderName: string;
  suggestedFix?: string;
}

export interface PanelData {
  timestamp: Date;
  files: FileResult[];
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  currentUser?: string;
  unstagedFiles?: UnstagedFile[];
  missingFiles?: MissingFile[];
  workspaceIssues?: DisplayWorkspaceIssue[];
}

export interface StatusMessage {
  type: 'status';
  id: string;
  text: string;
  icon?: 'spinner' | 'check' | 'error' | 'info';
  timestamp?: string;
  replace?: boolean;
}

interface WebviewMessage {
  type: 'navigateToLine' | 'copyFixPrompt' | 'rerunLint' | 'ignoreIssue' | 'fixAllIssues' | 'fixSingleIssue' | 'updateIgnoredIssues' | 'copyGitAddCommands' | 'openFile';
  file?: string;
  line?: number;
  rule?: string;
  message?: string;
  ignoredIssues?: string[];
  gitAddCommands?: string;
}

export class LintResultsPanel {
  public static currentPanel: LintResultsPanel | undefined;
  private static readonly viewType = 'teamAiLinter.resultsPanel';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _currentData: PanelData | undefined;
  private _ignoredIssues: Set<string> = new Set();
  private _statusMessages: StatusMessage[] = [];
  private _disposed = false;

  public static createOrShow(extensionUri: vscode.Uri): LintResultsPanel {
    const column = vscode.ViewColumn.Beside;

    // If we already have a panel and it's still alive, show it
    if (LintResultsPanel.currentPanel && !LintResultsPanel.currentPanel._disposed) {
      console.log('[team-ai-linter] Reusing existing panel');
      LintResultsPanel.currentPanel._panel.reveal(column);
      return LintResultsPanel.currentPanel;
    }

    // Clean up stale reference if disposed
    if (LintResultsPanel.currentPanel) {
      console.log('[team-ai-linter] Previous panel was disposed, creating new one');
    }
    LintResultsPanel.currentPanel = undefined;

    // Create a new panel
    console.log('[team-ai-linter] Creating new webview panel');
    const panel = vscode.window.createWebviewPanel(
        LintResultsPanel.viewType,
        'AI Lint Results',
        column,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [extensionUri]
        }
    );

    LintResultsPanel.currentPanel = new LintResultsPanel(panel, extensionUri);
    return LintResultsPanel.currentPanel;
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
    LintResultsPanel.currentPanel = new LintResultsPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set initial content
    this._updateWebview();

    // Handle panel disposal
    this._panel.onDidDispose(() => {
      console.log('[team-ai-linter] Webview panel disposed');
      this.dispose();
    }, null, this._disposables);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
        (message: WebviewMessage) => this._handleMessage(message),
        null,
        this._disposables
    );
  }

  public showLoading(filename: string): void {
    if (this._disposed) return;
    this._statusMessages = [];
    this._panel.webview.html = generateLoadingHtml(filename, getExtensionVersion());
    this._panel.title = 'AI Lint Results';
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  /**
   * Push a status message to the terminal activity log
   */
  public pushStatus(opts: { id: string; text: string; icon?: 'spinner' | 'check' | 'error' | 'info'; replace?: boolean }): void {
    if (this._disposed) return;
    const message: StatusMessage = {
      type: 'status',
      id: opts.id,
      text: opts.text,
      icon: opts.icon,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      replace: opts.replace
    };

    // Store for potential re-rendering
    if (opts.replace) {
      const idx = this._statusMessages.findIndex(m => m.id === opts.id);
      if (idx >= 0) {
        this._statusMessages[idx] = message;
      } else {
        this._statusMessages.push(message);
      }
    } else {
      this._statusMessages.push(message);
    }

    this._panel.webview.postMessage(message);
  }

  /**
   * Clear all status messages from the terminal
   */
  public clearStatus(): void {
    if (this._disposed) return;
    this._statusMessages = [];
    this._panel.webview.postMessage({ type: 'statusClear' });
  }

  public updateResults(data: PanelData): void {
    if (this._disposed) return;
    this._currentData = data;
    this._ignoredIssues.clear(); // Reset ignored issues when new results come in
    this._updateWebview();

    // Re-send all status messages to repopulate the terminal after HTML regeneration
    for (const message of this._statusMessages) {
      this._panel.webview.postMessage(message);
    }

    // Update panel title with issue count
    this._panel.title = data.totalIssues > 0
      ? `AI Lint Results (${data.totalIssues})`
      : 'AI Lint Results';
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  public getIgnoredIssues(): Set<string> {
    return this._ignoredIssues;
  }

  public updateResultsFromLint(
    filePath: string,
    fileContent: string | undefined,
    lintIssues: LintIssue[],
    importedIssues: ImportedFileIssue[],
    gitIssues: GitIssue[],
    eslintIssues: LintIssue[] = [],
    workspaceIssues: WorkspaceIssue[] = []
  ): void {
    // Merge ESLint issues into the main lint issues array so they flow through
    // the existing display logic. The rule prefix (e.g. `checksum/`,
    // `@typescript-eslint/`) makes them visually distinguishable in the panel.
    lintIssues = [...lintIssues, ...eslintIssues];
    const files: FileResult[] = [];
    const mainFileName = path.basename(filePath);

    // Helper to get line content from file
    const getLineContent = (content: string | undefined, lineNum: number): string | undefined => {
      if (!content) return undefined;
      const lines = content.split('\n');
      if (lineNum > 0 && lineNum <= lines.length)
        return lines[lineNum - 1].trim();

      return undefined;
    };

    // Main file issues
    const mainFileIssues: DisplayIssue[] = [
      ...lintIssues.map(issue => ({
        line: issue.line,
        message: issue.message,
        rule: issue.rule,
        severity: issue.severity,
        confidence: issue.confidence,
        source: 'lint' as const,
        filePath: filePath,
        lineContent: getLineContent(fileContent, issue.line)
      })),
      ...gitIssues.map(issue => ({
        line: issue.importLine,
        message: issue.message,
        rule: issue.moduleSpecifier,
        severity: issue.severity,
        source: 'git' as const,
        filePath: filePath,
        lineContent: getLineContent(fileContent, issue.importLine),
        isUnstaged: issue.isUnstaged,
        isMissing: issue.isMissing,
        isCaseMismatch: issue.isCaseMismatch,
        resolvedFilePath: issue.resolvedFilePath,
      }))
    ];

    if (mainFileIssues.length > 0 || importedIssues.length === 0) {
      files.push({
        filePath: filePath,
        fileName: mainFileName,
        issues: mainFileIssues
      });
    }

    // Group imported issues by file
    const importedByFile = new Map<string, DisplayIssue[]>();
    for (const issue of importedIssues) {
      // Try to read the imported file content for line preview
      let importedFileContent: string | undefined;
      try {
        importedFileContent = fs.readFileSync(issue.importedFile, 'utf-8');
      } catch {
        // File might not be accessible
      }

      const existing = importedByFile.get(issue.importedFile) || [];
      existing.push({
        line: issue.line,
        message: issue.message,
        rule: issue.rule,
        severity: issue.severity,
        confidence: issue.confidence,
        source: 'imported' as const,
        filePath: issue.importedFile,
        lineContent: getLineContent(importedFileContent, issue.line)
      });
      importedByFile.set(issue.importedFile, existing);
    }

    for (const [importedFilePath, issues] of importedByFile) {
      files.push({
        filePath: importedFilePath,
        fileName: path.basename(importedFilePath),
        issues: issues
      });
    }

    // Calculate counts
    const allIssues = files.flatMap(f => f.issues);
    const errorCount = allIssues.filter(i => i.severity === 'error').length;
    const warningCount = allIssues.filter(i => i.severity === 'warning').length;
    const infoCount = allIssues.filter(i => i.severity === 'info').length;

    // Collect unstaged files for the alert banner
    const unstagedFiles: UnstagedFile[] = gitIssues
      .filter(issue => issue.isUnstaged && issue.resolvedFilePath)
      .map(issue => ({
        filePath: issue.resolvedFilePath!,
        moduleSpecifier: issue.moduleSpecifier,
      }));

    // Collect missing files for the alert banner
    const missingFiles: MissingFile[] = gitIssues
      .filter(issue => issue.isMissing)
      .map(issue => ({
        moduleSpecifier: issue.moduleSpecifier,
      }));

    const displayWorkspaceIssues = toDisplayWorkspaceIssues(workspaceIssues);

    this.updateResults({
      timestamp: new Date(),
      files: files,
      totalIssues: allIssues.length + displayWorkspaceIssues.length,
      errorCount: errorCount + displayWorkspaceIssues.filter(w => w.severity === 'error').length,
      warningCount: warningCount + displayWorkspaceIssues.filter(w => w.severity === 'warning').length,
      infoCount: infoCount + displayWorkspaceIssues.filter(w => w.severity === 'info').length,
      currentUser: getCurrentUsername(),
      unstagedFiles: unstagedFiles.length > 0 ? unstagedFiles : undefined,
      missingFiles: missingFiles.length > 0 ? missingFiles : undefined,
      workspaceIssues: displayWorkspaceIssues.length > 0 ? displayWorkspaceIssues : undefined,
    });
  }

  public updateResultsFromFolder(
    results: Array<{
      filePath: string;
      lintIssues: LintIssue[];
      importedIssues: ImportedFileIssue[];
      gitIssues?: GitIssue[];
    }>,
    workspaceIssues: WorkspaceIssue[] = []
  ): void {
    const files: FileResult[] = [];
    const importedByFile = new Map<string, DisplayIssue[]>();
    const allUnstagedFiles: UnstagedFile[] = [];
    const allMissingFiles: MissingFile[] = [];

    // Helper to get line content from file
    const getLineContent = (filePath: string, lineNum: number): string | undefined => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        if (lineNum > 0 && lineNum <= lines.length)
          return lines[lineNum - 1].trim();
      } catch {
        // File might not be accessible
      }
      return undefined;
    };

    for (const result of results) {
      const fileName = path.basename(result.filePath);

      // Main file lint issues + git issues
      const mainFileIssues: DisplayIssue[] = [
        ...result.lintIssues.map(issue => ({
          line: issue.line,
          message: issue.message,
          rule: issue.rule,
          severity: issue.severity,
          confidence: issue.confidence,
          source: 'lint' as const,
          filePath: result.filePath
        })),
        ...(result.gitIssues || []).map(issue => ({
          line: issue.importLine,
          message: issue.message,
          rule: issue.moduleSpecifier,
          severity: issue.severity,
          source: 'git' as const,
          filePath: result.filePath,
          lineContent: getLineContent(result.filePath, issue.importLine),
          isUnstaged: issue.isUnstaged,
          isMissing: issue.isMissing,
          isCaseMismatch: issue.isCaseMismatch,
          resolvedFilePath: issue.resolvedFilePath,
        }))
      ];

      // Always include the file, even if it has no issues
      files.push({
        filePath: result.filePath,
        fileName: fileName,
        issues: mainFileIssues
      });

      // Collect unstaged and missing files for alert banners
      if (result.gitIssues) {
        for (const issue of result.gitIssues) {
          if (issue.isUnstaged && issue.resolvedFilePath) {
            // Avoid duplicates (same file from multiple test files)
            if (!allUnstagedFiles.some(f => f.filePath === issue.resolvedFilePath)) {
              allUnstagedFiles.push({
                filePath: issue.resolvedFilePath,
                moduleSpecifier: issue.moduleSpecifier,
              });
            }
          }
          if (issue.isMissing) {
            if (!allMissingFiles.some(f => f.moduleSpecifier === issue.moduleSpecifier)) {
              allMissingFiles.push({
                moduleSpecifier: issue.moduleSpecifier,
              });
            }
          }
        }
      }

      // Group imported issues by their actual file path (with deduplication)
      for (const imported of result.importedIssues) {
        const existing = importedByFile.get(imported.importedFile) || [];
        // Check for duplicates (same line and rule)
        const isDuplicate = existing.some(
          e => e.line === imported.line && e.rule === imported.rule
        );
        if (!isDuplicate) {
          existing.push({
            line: imported.line,
            message: imported.message,
            rule: imported.rule,
            severity: imported.severity,
            confidence: imported.confidence,
            source: 'imported' as const,
            filePath: imported.importedFile
          });
          importedByFile.set(imported.importedFile, existing);
        }
      }
    }

    // Add imported file sections
    for (const [importedFilePath, issues] of importedByFile) {
      files.push({
        filePath: importedFilePath,
        fileName: path.basename(importedFilePath),
        issues: issues
      });
    }

    const allIssues = files.flatMap(f => f.issues);
    const errorCount = allIssues.filter(i => i.severity === 'error').length;
    const warningCount = allIssues.filter(i => i.severity === 'warning').length;
    const infoCount = allIssues.filter(i => i.severity === 'info').length;

    const displayWorkspaceIssues = toDisplayWorkspaceIssues(workspaceIssues);

    this.updateResults({
      timestamp: new Date(),
      files: files,
      totalIssues: allIssues.length + displayWorkspaceIssues.length,
      errorCount: errorCount + displayWorkspaceIssues.filter(w => w.severity === 'error').length,
      warningCount: warningCount + displayWorkspaceIssues.filter(w => w.severity === 'warning').length,
      infoCount: infoCount + displayWorkspaceIssues.filter(w => w.severity === 'info').length,
      currentUser: getCurrentUsername(),
      unstagedFiles: allUnstagedFiles.length > 0 ? allUnstagedFiles : undefined,
      missingFiles: allMissingFiles.length > 0 ? allMissingFiles : undefined,
      workspaceIssues: displayWorkspaceIssues.length > 0 ? displayWorkspaceIssues : undefined,
    });
  }

  private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'navigateToLine':
        if (message.file && message.line !== undefined) {
          const uri = vscode.Uri.file(message.file);
          const document = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
          const line = Math.max(0, message.line - 1);
          const range = new vscode.Range(line, 0, line, 0);
          editor.selection = new vscode.Selection(range.start, range.start);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
        break;

      case 'openFile':
        if (message.file) {
          const uri = vscode.Uri.file(message.file);
          const document = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        }
        break;

      case 'copyFixPrompt':
        // Update ignored issues from message before calling command
        if (message.ignoredIssues)
          this._ignoredIssues = new Set(message.ignoredIssues);

        await vscode.commands.executeCommand('teamAiLinter.copyFixPrompt', Array.from(this._ignoredIssues));
        break;

      case 'rerunLint':
        await vscode.commands.executeCommand('teamAiLinter.runAll');
        break;

      case 'updateIgnoredIssues':
        if (message.ignoredIssues)
          this._ignoredIssues = new Set(message.ignoredIssues);

        break;

      case 'fixAllIssues':
        // Update ignored issues from message before fixing
        if (message.ignoredIssues)
          this._ignoredIssues = new Set(message.ignoredIssues);

        await this._fixAllIssues();
        break;

      case 'fixSingleIssue':
        if (message.file && message.line !== undefined && message.rule && message.message)
          await this._fixSingleIssue(message.file, message.line, message.rule, message.message);

        break;

      case 'copyGitAddCommands':
        if (message.gitAddCommands) {
          await vscode.env.clipboard.writeText(message.gitAddCommands);
          vscode.window.showInformationMessage('git add commands copied to clipboard!');
        }
        break;
    }
  }

  private async _fixAllIssues(): Promise<void> {
    // Copy the fix prompt to clipboard (with ignored issues filtered out)
    await vscode.commands.executeCommand('teamAiLinter.copyFixPrompt', Array.from(this._ignoredIssues));

    // Open Cursor's chat
    await this._openCursorChat();
  }

  private async _fixSingleIssue(filePath: string, line: number, rule: string, message: string): Promise<void> {
    // Read the file content
    let fileContent = '';
    try {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    } catch {
      vscode.window.showErrorMessage(`Could not read file: ${filePath}`);
      return;
    }

    // Generate a prompt for just this single issue
    const prompt = `Fix the following linting issue in my Playwright test file:

File: ${filePath}

Issue at Line ${line}:
- Rule: ${rule}
- Message: ${message}

---
File Content:
\`\`\`typescript
${fileContent}
\`\`\`

Please fix this specific issue while maintaining the existing test logic.`;

    // Copy to clipboard
    await vscode.env.clipboard.writeText(prompt);

    // Open the file and navigate to the line
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

    // Open Cursor's chat
    await this._openCursorChat();
  }

  private async _openCursorChat(): Promise<void> {
    // Try various commands that might open Cursor's chat
    const chatCommands = [
      'aichat.newchataction',
      'workbench.action.chat.open',
    ];

    let opened = false;
    for (const cmd of chatCommands) {
      try {
        await vscode.commands.executeCommand(cmd);
        opened = true;
        break;
      } catch {
        // Command doesn't exist, try next
      }
    }

    if (opened)
      vscode.window.showInformationMessage('Fix prompt copied! Paste (Cmd+V) in the chat to apply fixes.');
    else
      vscode.window.showInformationMessage('Fix prompt copied to clipboard! Open Cursor chat (Cmd+L) and paste.');

  }

  private _updateWebview(): void {
    this._panel.webview.html = generatePanelHtml(this._currentData, getExtensionVersion());
  }

  public dispose(): void {
    this._disposed = true;
    LintResultsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d)
        d.dispose();

    }
  }
}
