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
import { DiagnosticProvider } from '../diagnostics/diagnosticProvider';
import { LintIssue, GitIssue, ImportedFileIssue } from '../types';
import { getAnthropicApiKey } from '../config/envLoader';
import { loadRules, getWorkspaceRoot, getClaudeModel, getMinConfidence } from '../config/configLoader';
import { isEslintLayerEnabled, isEslintTypeAwareEnabled } from '../config/configLoader';
import { createLintServices } from '../services/serviceFactory';
import { getOutputChannel, getLintResultsPanel } from '../extension';
import { updateLastLintedTimestampForDocument } from '../services/timestampService';
import { LintResultStore } from '../services/lintResultStore';
import { OutputFormatter, setImportedFileDiagnostics } from '../output';
import { resetChecksumConfigCache } from '../services/detection/deterministicDetector';

/**
 * Run all checks (AI lint + git safety) on a document.
 */
export async function runAllChecks(
  document: vscode.TextDocument,
  diagnosticProvider: DiagnosticProvider,
  envPath: string
): Promise<void> {
  const filePath = document.uri.fsPath;
  const workspaceRoot = getWorkspaceRoot(document);

  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }

  // Clear existing diagnostics
  diagnosticProvider.clear(document.uri);

  // Reset cache so checksum.config.ts env checks run fresh
  resetChecksumConfigCache();

  const output = getOutputChannel();
  const formatter = new OutputFormatter(output);

  // Always fetch the live panel — if the user closes it mid-run,
  // getLintResultsPanel() will recreate it on the next call.
  const panel = () => getLintResultsPanel();
  const fileName = path.basename(filePath);
  panel().showLoading(fileName);
  panel().pushStatus({ id: 'init', text: 'Initializing linter...', icon: 'spinner' });

  await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Team AI Linter',
        cancellable: false,
      },
      async progress => {
        const lintIssues: LintIssue[] = [];
        const gitIssues: GitIssue[] = [];

        // Step 1: Git Safety Check
        progress.report({ message: 'Checking imports for git safety...', increment: 0 });
        panel().pushStatus({ id: 'init', text: 'Configuration loaded', icon: 'check', replace: true });
        panel().pushStatus({ id: 'git', text: 'Checking imports for git safety...', icon: 'spinner' });

        // Get configuration
        const apiKey = getAnthropicApiKey(envPath);
        if (!apiKey) {
          vscode.window.showErrorMessage('ANTHROPIC_API_KEY not found in .env file');
          // Clear loading state before returning
          panel().updateResultsFromLint(filePath, document.getText(), [], [], []);
          return;
        }

        const rules = loadRules(workspaceRoot);
        const model = getClaudeModel();
        const minConfidence = getMinConfidence();

        // Create services using factory
        const { gitSafetyChecker, importedFileLinter, eslintDetector } = createLintServices({
          apiKey,
          workspaceRoot,
          model,
          enableEslint: isEslintLayerEnabled(),
          eslintTypeAware: isEslintTypeAwareEnabled(),
        });

        try {
          const importIssues = await gitSafetyChecker.checkImports(document.getText(), filePath);
          gitIssues.push(...importIssues);
          panel().pushStatus({ id: 'git', text: `Git safety check complete${gitIssues.length > 0 ? ` (${gitIssues.length} issue${gitIssues.length !== 1 ? 's' : ''})` : ''}`, icon: 'check', replace: true });
        } catch (error) {
          formatter.logGitSafetyError(error);
          panel().pushStatus({ id: 'git', text: 'Git safety check failed', icon: 'error', replace: true });
          vscode.window.showWarningMessage(
              `Git safety check failed: ${error instanceof Error ? error.message : String(error)}. Continuing with AI lint...`
          );
        }

        // Kick off ESLint detector in parallel with AI lint
        panel().pushStatus({ id: 'eslint', text: 'Running ESLint rules…', icon: 'spinner' });
        const eslintPromise: Promise<LintIssue[]> = eslintDetector
          ? eslintDetector.lintFile(filePath, document.getText())
          : Promise.resolve([]);

        progress.report({ message: 'Running AI lint...', increment: 50 });
        panel().pushStatus({ id: 'ai-lint', text: `Running AI lint on ${fileName}...`, icon: 'spinner' });

        // Step 2: AI Lint (with imported file analysis)
        let importedFileIssues: ImportedFileIssue[] = [];
        let unresolvedImports: Array<{ moduleSpecifier: string; line: number; fromFile: string }> = [];
        let lintedFiles: string[] = [];

        try {
          const fileContent = document.getText();

          // Lint the main file and its imports (2 levels deep)
          const result = await importedFileLinter.lintWithImports(
              filePath,
              fileContent,
              rules,
              2, // Max depth of 2 levels
              minConfidence
          );

          lintIssues.push(...result.mainIssues);
          importedFileIssues = result.importedIssues;
          unresolvedImports = result.unresolvedImports;
          lintedFiles = result.lintedFiles;

          const totalIssues = lintIssues.length + importedFileIssues.length;
          panel().pushStatus({ id: 'ai-lint', text: `AI lint complete (${totalIssues} issue${totalIssues !== 1 ? 's' : ''} in ${lintedFiles.length} file${lintedFiles.length !== 1 ? 's' : ''})`, icon: 'check', replace: true });
        } catch (error) {
          console.error('AI lint failed:', error);
          panel().pushStatus({ id: 'ai-lint', text: 'AI lint failed', icon: 'error', replace: true });
          vscode.window.showErrorMessage(`AI lint failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Await ESLint results
        let eslintIssues: LintIssue[] = [];
        try {
          eslintIssues = await eslintPromise;
          panel().pushStatus({ id: 'eslint', text: `ESLint: ${eslintIssues.length} issue(s)`, icon: 'check', replace: true });
        } catch (error) {
          console.error('ESLint detector failed:', error);
          panel().pushStatus({ id: 'eslint', text: 'ESLint failed', icon: 'error', replace: true });
        }

        progress.report({ message: 'Done!', increment: 50 });
        panel().pushStatus({ id: 'done', text: 'Analysis complete', icon: 'check' });

        // Set all diagnostics for main file. lintIssues stays AI-only;
        // eslintIssues is passed separately so the diagnostic provider can
        // label them with their own source ('Team AI Linter (ESLint)').
        diagnosticProvider.setAllDiagnostics(document.uri, lintIssues, gitIssues, eslintIssues);

        // Set diagnostics for imported files
        setImportedFileDiagnostics(diagnosticProvider, importedFileIssues);

        // Log detailed results to output channel
        logResults(formatter, filePath, lintIssues, importedFileIssues, gitIssues, eslintIssues, unresolvedImports, lintedFiles);

        // Store results for later prompt generation. ESLint issues are
        // merged into the stored lintIssues so prompt generation and
        // result inspection see all issues together.
        const storedLintIssues = eslintIssues.length > 0 ? [...lintIssues, ...eslintIssues] : lintIssues;
        LintResultStore.storeSingleFileResult({
          filePath,
          fileContent: document.getText(),
          lintIssues: storedLintIssues,
          importedIssues: importedFileIssues,
          gitIssues
        });

        // Update last linted timestamp in the file
        await updateLastLintedTimestampForDocument(document);

        // Update the webview panel with results
        panel().updateResultsFromLint(filePath, document.getText(), lintIssues, importedFileIssues, gitIssues, eslintIssues);
      }
  );
}

/**
 * Log detailed results to output channel using the OutputFormatter.
 */
function logResults(
  formatter: OutputFormatter,
  filePath: string,
  lintIssues: LintIssue[],
  importedFileIssues: ImportedFileIssue[],
  gitIssues: GitIssue[],
  eslintIssues: LintIssue[],
  unresolvedImports: Array<{ moduleSpecifier: string; line: number; fromFile: string }>,
  lintedFiles: string[]
): void {
  formatter.logFileHeader(filePath);
  formatter.logLintIssues(filePath, lintIssues);
  formatter.logEslintIssues(filePath, eslintIssues);
  formatter.logImportedFileIssues(importedFileIssues);
  formatter.logGitIssues(filePath, gitIssues);
  formatter.logUnresolvedImports(unresolvedImports);
  formatter.logLintedFiles(lintedFiles);

  if (
    lintIssues.length === 0 &&
    eslintIssues.length === 0 &&
    importedFileIssues.length === 0 &&
    gitIssues.length === 0
  )
    formatter.logNoIssuesFound();


  formatter.logFooter();
}
