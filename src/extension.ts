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
import * as path from 'path';
import { DiagnosticProvider } from './diagnostics/diagnosticProvider';
import { runAllChecks } from './commands/runAllChecks';
import { lintFolder, lintSelectedFiles } from './commands/lintFolder';
import { LintResultStore } from './services/lintResultStore';
import { generateFixPrompt, generateFolderFixPrompt } from './services/promptGeneratorService';
import { LintResultsPanel } from './webview/lintResultsPanel';
import { createAutoUpdater } from './services/autoUpdater';
import { isEslintLayerEnabled } from './config/configLoader';
import { resetEslintCache } from './services/detection/eslintDetector';

let diagnosticProvider: DiagnosticProvider;
let extensionPath: string;
let extensionUri: vscode.Uri;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let showResultsStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log('Team AI Linter extension is now active');

  // Store extension path and URI for accessing bundled files
  extensionPath = context.extensionPath;
  extensionUri = context.extensionUri;

  // Create output channel for detailed logs
  outputChannel = vscode.window.createOutputChannel('Team AI Linter');
  context.subscriptions.push(outputChannel);

  // Initialize auto-updater
  const autoUpdater = createAutoUpdater(context, outputChannel);
  autoUpdater.start();
  context.subscriptions.push(autoUpdater);

  // Initialize diagnostic provider
  diagnosticProvider = new DiagnosticProvider();
  context.subscriptions.push(diagnosticProvider);

  if (isEslintLayerEnabled()) {
    // Warm up ESLint in the background — first lint will be much faster
    void Promise.all([
      import('eslint'),
      import('checksumai-eslint-config'),
    ]).catch(err => console.warn('[team-ai-linter] ESLint warm-up failed:', err));
  }

  context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (
          e.affectsConfiguration('teamAiLinter.enableEslintLayer') ||
          e.affectsConfiguration('teamAiLinter.eslintTypeAwareRules')
        )
          resetEslintCache();

      })
  );

  // Create status bar button
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'teamAiLinter.runAll';
  statusBarItem.text = '$(beaker) AI Lint';
  statusBarItem.tooltip = 'Run AI Lint + Git Check (Cmd+Shift+L)';
  context.subscriptions.push(statusBarItem);

  // "Show last results" status bar item — visible only when there are stored results,
  // so users can re-open the panel without re-running the linter.
  showResultsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  showResultsStatusBarItem.command = 'teamAiLinter.showResults';
  showResultsStatusBarItem.text = '$(list-unordered) Lint Results';
  showResultsStatusBarItem.tooltip = 'Show last AI Lint results';
  context.subscriptions.push(showResultsStatusBarItem);

  // Show/hide status bar based on active editor
  context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateStatusBarVisibility)
  );
  updateStatusBarVisibility(); // Initial check

  // Setup command - configure .env file path
  const setup = vscode.commands.registerCommand('teamAiLinter.setup', async () => {
    const config = vscode.workspace.getConfiguration('teamAiLinter');
    const currentPath = config.get<string>('envFilePath') || '';

    const result = await vscode.window.showInputBox({
      prompt: 'Enter the full path to your .env file containing ANTHROPIC_API_KEY',
      placeHolder: '/Users/username/path/to/playwright-mcp/code-agent/.env',
      value: currentPath,
      validateInput: value => {
        if (!value || value.trim() === '')
          return 'Path cannot be empty';

        // Expand ~ to home directory for validation display
        const expandedPath = value.replace(/^~/, process.env.HOME || '');
        if (!fs.existsSync(expandedPath))
          return `File not found: ${expandedPath}`;

        return null;
      }
    });

    if (result) {
      // Expand ~ to home directory before saving
      const expandedPath = result.replace(/^~/, process.env.HOME || '');
      await config.update('envFilePath', expandedPath, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Team AI Linter configured with: ${expandedPath}`);
    }
  });
  context.subscriptions.push(setup);

  // Setup rules command - configure global guidelines path
  const setupRules = vscode.commands.registerCommand('teamAiLinter.setupRules', async () => {
    const config = vscode.workspace.getConfiguration('teamAiLinter');
    const currentPath = config.get<string>('globalRulesPath') || '';

    const result = await vscode.window.showInputBox({
      prompt: 'Enter the full path to your guidelines/rules file',
      placeHolder: '/Users/username/path/to/playwright-mcp/team-ai-linter/guidelines.md',
      value: currentPath,
      validateInput: value => {
        if (!value || value.trim() === '')
          return null; // Allow empty to use workspace rules

        const expandedPath = value.replace(/^~/, process.env.HOME || '');
        if (!fs.existsSync(expandedPath))
          return `File not found: ${expandedPath}`;

        return null;
      }
    });

    if (result !== undefined) {
      const expandedPath = result ? result.replace(/^~/, process.env.HOME || '') : '';
      await config.update('globalRulesPath', expandedPath, vscode.ConfigurationTarget.Global);
      if (expandedPath)
        vscode.window.showInformationMessage(`Team AI Linter rules configured: ${expandedPath}`);
      else
        vscode.window.showInformationMessage('Team AI Linter will use workspace rules (.ai-linter/rules.md)');

    }
  });
  context.subscriptions.push(setupRules);

  // Check for updates command - manual trigger
  const checkForUpdates = vscode.commands.registerCommand('teamAiLinter.checkForUpdates', async () => {
    await autoUpdater.checkForUpdateManual();
  });
  context.subscriptions.push(checkForUpdates);

  // Main command - run all checks (AI lint + git safety)
  const runAll = vscode.commands.registerCommand('teamAiLinter.runAll', async () => {
    let document: vscode.TextDocument | undefined = vscode.window.activeTextEditor?.document;

    // When triggered from the webview panel (Re-run Lint), there may be no active text editor.
    // Fall back to the last linted file from the result store.
    if (!document) {
      const lastResult = LintResultStore.getLastSingleFileResult();
      if (lastResult) {
        try {
          document = await vscode.workspace.openTextDocument(vscode.Uri.file(lastResult.filePath));
        } catch {
          vscode.window.showErrorMessage(`Could not open last linted file: ${lastResult.filePath}`);
          return;
        }
      } else {
        vscode.window.showErrorMessage('No active editor found. Open a test file and run the linter first.');
        return;
      }
    }

    // Check if .env path is configured
    const envPath = await ensureEnvConfigured();
    if (!envPath)
      return;

    await runAllChecks(document, diagnosticProvider, envPath);
  });
  context.subscriptions.push(runAll);

  // Lint folder command (from explorer context menu - supports multiple folders)
  const lintFolderCmd = vscode.commands.registerCommand(
      'teamAiLinter.lintFolder',
      async (clickedUri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // When right-clicking with multi-select, selectedUris contains all selected items
        // When right-clicking a single item, selectedUris might be undefined
        const uris = selectedUris && selectedUris.length > 0 ? selectedUris : (clickedUri ? [clickedUri] : []);

        if (uris.length === 0) {
          vscode.window.showErrorMessage('No folder selected');
          return;
        }

        // Filter to only folders
        const folderUris: vscode.Uri[] = [];
        for (const uri of uris) {
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type === vscode.FileType.Directory)
              folderUris.push(uri);
          } catch {
            // Skip items we can't stat
          }
        }

        if (folderUris.length === 0) {
          vscode.window.showErrorMessage('No folders selected');
          return;
        }

        const envPath = await ensureEnvConfigured();
        if (!envPath)
          return;

        // Lint all selected folders
        for (const folderUri of folderUris)
          await lintFolder(folderUri, diagnosticProvider, envPath);
      }
  );
  context.subscriptions.push(lintFolderCmd);

  // Lint selected files command (from explorer context menu with multi-select)
  const lintSelectedFilesCmd = vscode.commands.registerCommand(
      'teamAiLinter.lintSelectedFiles',
      async (clickedUri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // When right-clicking with multi-select, selectedUris contains all selected items
        // When right-clicking a single item, selectedUris might be undefined
        const uris = selectedUris && selectedUris.length > 0 ? selectedUris : (clickedUri ? [clickedUri] : []);

        if (uris.length === 0) {
          vscode.window.showErrorMessage('No files selected');
          return;
        }

        // Filter to only test files and checksum.config.ts
        const testFilePattern = /(test|spec)\.(ts|tsx|js|jsx)$/;
        const testFileUris = uris.filter(uri => testFilePattern.test(uri.fsPath) || uri.fsPath.endsWith('checksum.config.ts'));

        if (testFileUris.length === 0) {
          vscode.window.showErrorMessage('No lintable files selected. Select test files (.test.ts, .spec.ts) or checksum.config.ts.');
          return;
        }

        const envPath = await ensureEnvConfigured();
        if (!envPath)
          return;

        await lintSelectedFiles(testFileUris, diagnosticProvider, envPath);
      }
  );
  context.subscriptions.push(lintSelectedFilesCmd);

  // Lint files from SCM Changes context menu (right-click files or group header)
  const lintScmFilesCmd = vscode.commands.registerCommand(
      'teamAiLinter.lintScmFiles',
      async (...args: unknown[]) => {
        const testFilePattern = /(test|spec)\.(ts|tsx|js|jsx)$/;
        let uris: vscode.Uri[] = [];

        const first = args[0] as Record<string, unknown> | undefined;

        if (first && Array.isArray(first.resourceStates)) {
          // Invoked from group header — first arg is SourceControlResourceGroup
          uris = first.resourceStates
            .filter((r: unknown): r is { resourceUri: vscode.Uri } =>
              typeof r === 'object' && r !== null && 'resourceUri' in r)
            .map(r => r.resourceUri);
        } else {
          // Invoked from individual file(s) — Cursor passes each selected
          // resource as a separate positional arg (not as an array)
          for (const arg of args) {
            const resource = arg as Record<string, unknown> | undefined;
            if (resource && 'resourceUri' in resource && resource.resourceUri instanceof vscode.Uri)
              uris.push(resource.resourceUri);
          }
        }

        if (uris.length === 0) {
          vscode.window.showErrorMessage('No files found in selection');
          return;
        }

        // Filter to test files
        const testFileUris = uris.filter(uri => testFilePattern.test(uri.fsPath) || uri.fsPath.endsWith('checksum.config.ts'));
        const skippedCount = uris.length - testFileUris.length;

        if (testFileUris.length === 0) {
          vscode.window.showInformationMessage(`No lintable test files in selection (${skippedCount} file${skippedCount !== 1 ? 's' : ''} skipped)`);
          return;
        }

        if (skippedCount > 0)
          vscode.window.showInformationMessage(`Linting ${testFileUris.length} of ${uris.length} files (${skippedCount} non-test file${skippedCount !== 1 ? 's' : ''} skipped)`);

        const envPath = await ensureEnvConfigured();
        if (!envPath)
          return;

        await lintSelectedFiles(testFileUris, diagnosticProvider, envPath);
      }
  );
  context.subscriptions.push(lintScmFilesCmd);

  // Show last results command — reopens the webview panel from stored results
  // without re-running the linter. Useful when the user accidentally closes
  // the panel.
  const showResults = vscode.commands.registerCommand('teamAiLinter.showResults', async () => {
    if (!LintResultStore.hasResults()) {
      vscode.window.showInformationMessage(
          'No lint results to show yet. Run the linter first (Cmd+Shift+L).'
      );
      return;
    }

    const panel = LintResultsPanel.createOrShow(extensionUri);
    const resultType = LintResultStore.getLastResultType();

    if (resultType === 'single') {
      const r = LintResultStore.getLastSingleFileResult();
      if (r) {
        // ESLint issues are already merged into stored lintIssues (see runAllChecks.ts).
        // Pass [] for eslintIssues to avoid double-counting.
        panel.updateResultsFromLint(
            r.filePath,
            r.fileContent,
            r.lintIssues,
            r.importedIssues ?? [],
            r.gitIssues ?? [],
            []
        );
      }
    } else if (resultType === 'folder') {
      const r = LintResultStore.getLastFolderResult();
      if (r) panel.updateResultsFromFolder(r.results);
    }
  });
  context.subscriptions.push(showResults);

  // Copy fix prompt command - copies last lint results as a fix prompt
  // Accepts optional ignoredIssues parameter (array of "file:line:rule" strings)
  const copyFixPrompt = vscode.commands.registerCommand(
      'teamAiLinter.copyFixPrompt',
      async (ignoredIssues?: string[]) => {
        if (!LintResultStore.hasResults()) {
          vscode.window.showWarningMessage('No lint results available. Run the linter first.');
          return;
        }

        const resultType = LintResultStore.getLastResultType();
        let prompt: string;

        if (resultType === 'single') {
          const result = LintResultStore.getLastSingleFileResult();
          if (!result) {
            vscode.window.showWarningMessage('No lint results available.');
            return;
          }
          prompt = generateFixPrompt({
            filePath: result.filePath,
            fileContent: result.fileContent,
            lintIssues: result.lintIssues,
            importedIssues: result.importedIssues,
            gitIssues: result.gitIssues,
            ignoredIssues: ignoredIssues
          });
        } else {
          const result = LintResultStore.getLastFolderResult();
          if (!result) {
            vscode.window.showWarningMessage('No lint results available.');
            return;
          }
          prompt = generateFolderFixPrompt(result.results, ignoredIssues);
        }

        await vscode.env.clipboard.writeText(prompt);
        const ignoredCount = ignoredIssues?.length || 0;
        const message = ignoredCount > 0
          ? `Fix prompt copied to clipboard! (${ignoredCount} issue${ignoredCount !== 1 ? 's' : ''} excluded)`
          : 'Fix prompt copied to clipboard!';
        vscode.window.showInformationMessage(message);
      }
  );
  context.subscriptions.push(copyFixPrompt);
}

/**
 * Ensures the .env file path is configured
 * Returns the path if configured, or prompts user to configure
 */
async function ensureEnvConfigured(): Promise<string | null> {
  const config = vscode.workspace.getConfiguration('teamAiLinter');
  const envPath = config.get<string>('envFilePath');

  if (!envPath) {
    const choice = await vscode.window.showErrorMessage(
        'Team AI Linter: .env file not configured. Would you like to set it up now?',
        'Configure Now',
        'Cancel'
    );
    if (choice === 'Configure Now') {
      await vscode.commands.executeCommand('teamAiLinter.setup');
      // Re-check after setup
      const newEnvPath = config.get<string>('envFilePath');
      return newEnvPath || null;
    }
    return null;
  }

  if (!fs.existsSync(envPath)) {
    const choice = await vscode.window.showErrorMessage(
        `Team AI Linter: .env file not found at ${envPath}. Would you like to reconfigure?`,
        'Reconfigure',
        'Cancel'
    );
    if (choice === 'Reconfigure') {
      await vscode.commands.executeCommand('teamAiLinter.setup');
      const newEnvPath = config.get<string>('envFilePath');
      return newEnvPath || null;
    }
    return null;
  }

  return envPath;
}

/**
 * Update status bar visibility based on active editor
 */
function updateStatusBarVisibility(): void {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const fileName = editor.document.fileName;
    // Show for test/spec files and checksum.config.ts
    if (/(test|spec)\.(ts|tsx|js|jsx)$/.test(fileName) || fileName.endsWith('checksum.config.ts'))
      statusBarItem.show();
    else
      statusBarItem.hide();

  } else {
    statusBarItem.hide();
  }

  refreshShowResultsStatusBar();
}

/**
 * Show or hide the "Lint Results" status bar item based on whether any
 * results are currently stored. Called after each run and on editor change.
 */
export function refreshShowResultsStatusBar(): void {
  if (!showResultsStatusBarItem) return;
  if (LintResultStore.hasResults())
    showResultsStatusBarItem.show();
  else
    showResultsStatusBarItem.hide();
}

export function deactivate() {
  console.log('Team AI Linter extension is now deactivated');
}

/**
 * Get the path to the bundled guidelines.md file
 */
export function getBundledGuidelinesPath(): string | null {
  if (!extensionPath)
    return null;

  const guidelinesPath = path.join(extensionPath, 'guidelines.md');
  if (fs.existsSync(guidelinesPath))
    return guidelinesPath;

  return null;
}

/**
 * Get the output channel for logging
 */
export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}

/**
 * Get or create the lint results panel
 */
export function getLintResultsPanel(): LintResultsPanel {
  return LintResultsPanel.createOrShow(extensionUri);
}

