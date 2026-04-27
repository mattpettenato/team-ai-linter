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
import { DiagnosticProvider, LintIssue } from '../diagnostics/diagnosticProvider';
import { GitIssue, WorkspaceIssue } from '../types';
import { getAnthropicApiKey } from '../config/envLoader';
import { loadRules, getClaudeModel, getMinConfidence, isEslintLayerEnabled, isEslintTypeAwareEnabled } from '../config/configLoader';
import { createLintServices } from '../services/serviceFactory';
import { ImportedFileIssue } from '../services/importedFileLinter';
import { getOutputChannel, getLintResultsPanel, refreshShowResultsStatusBar } from '../extension';
import { updateLastLintedTimestamp } from '../services/timestampService';
import { LintResultStore } from '../services/lintResultStore';
import { OutputFormatter, setImportedFileDiagnostics } from '../output';
import { resetChecksumConfigCache } from '../services/detection/deterministicDetector';
import { detectWorkspaceIssues } from '../services/detection/workspaceIssues';

const TEST_FILE_PATTERN = /(test|spec)\.(ts|tsx|js|jsx)$|checksum\.config\.ts$/;

interface FolderLintResult {
  filePath: string;
  lintIssues: LintIssue[];
  importedIssues: ImportedFileIssue[];
  gitIssues: GitIssue[];
}

interface FolderLintSummary {
  results: FolderLintResult[];
  workspaceIssues: WorkspaceIssue[];
  totalFiles: number;
  cancelled: boolean;
}

/**
 * Lint a specific list of files
 */
export async function lintSelectedFiles(
  fileUris: vscode.Uri[],
  diagnosticProvider: DiagnosticProvider,
  envPath: string
): Promise<void> {
  if (fileUris.length === 0) {
    vscode.window.showInformationMessage('No files to lint');
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUris[0]);
  const workspaceRoot = workspaceFolder?.uri.fsPath;

  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }

  // Clear existing diagnostics for selected files
  for (const fileUri of fileUris)
    diagnosticProvider.clear(fileUri);

  // Reset cache so checksum.config.ts env checks run fresh for this session
  resetChecksumConfigCache();

  const output = getOutputChannel();
  const formatter = new OutputFormatter(output);

  // Always fetch the live panel — if the user closes it mid-run,
  // getLintResultsPanel() will recreate it on the next call.
  const panel = () => getLintResultsPanel();
  panel().showLoading('Selected Files');
  panel().pushStatus({ id: 'init', text: `Selected ${fileUris.length} file${fileUris.length !== 1 ? 's' : ''} to lint`, icon: 'info' });

  // Run linting with progress
  const summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Team AI Linter: Linting Selected Files',
        cancellable: true,
      },
      async (progress, token): Promise<FolderLintSummary> => {
        const apiKey = getAnthropicApiKey(envPath);
        if (!apiKey) {
          vscode.window.showErrorMessage('ANTHROPIC_API_KEY not found');
          panel().pushStatus({ id: 'error', text: 'API key not found', icon: 'error' });
          return { results: [], workspaceIssues: [], totalFiles: fileUris.length, cancelled: true };
        }

        const rules = loadRules(workspaceRoot);
        const model = getClaudeModel();
        const minConfidence = getMinConfidence();

        const { importedFileLinter, gitSafetyChecker, eslintDetector } = createLintServices({
          apiKey,
          workspaceRoot,
          model,
          enableEslint: isEslintLayerEnabled(),
          eslintTypeAware: isEslintTypeAwareEnabled(),
        });

        // Workspace-scoped scan: runs once for the whole folder lint, in
        // parallel with the per-file work.
        const workspaceIssuesPromise = detectWorkspaceIssues(workspaceRoot);

        const results: FolderLintResult[] = [];

        formatter.logFolderHeader('Selected Files', fileUris.length);

        for (let i = 0; i < fileUris.length; i++) {
          if (token.isCancellationRequested) {
            formatter.logCancelled();
            panel().pushStatus({ id: 'cancelled', text: 'Linting cancelled by user', icon: 'error' });
            return { results, workspaceIssues: [], totalFiles: fileUris.length, cancelled: true };
          }

          const filePath = fileUris[i].fsPath;
          const fileName = path.basename(filePath);

          progress.report({
            message: `${fileName} (${i + 1}/${fileUris.length})`,
            increment: (1 / fileUris.length) * 100,
          });

          panel().pushStatus({ id: `file-${i}`, text: `Processing ${fileName} (${i + 1}/${fileUris.length})...`, icon: 'spinner' });

          try {
            const content = fs.readFileSync(filePath, 'utf-8');

            // Kick off ESLint in parallel with the AI/git work
            const eslintPromise: Promise<LintIssue[]> = eslintDetector
              ? eslintDetector.lintFile(filePath, content)
              : Promise.resolve([]);

            // Git safety check
            let gitIssues: GitIssue[] = [];
            try {
              gitIssues = await gitSafetyChecker.checkImports(content, filePath);
            } catch {
              // Git check failure shouldn't block linting
            }

            const result = await importedFileLinter.lintWithImports(
                filePath,
                content,
                rules,
                2,
                minConfidence
            );

            const { mainIssues, importedIssues } = result;

            const eslintIssues = await eslintPromise;
            const combinedMainIssues = [...mainIssues, ...eslintIssues];

            // Set diagnostics for this file (includes git + eslint issues)
            diagnosticProvider.setAllDiagnostics(fileUris[i], mainIssues, gitIssues, eslintIssues);

            // Set diagnostics for imported files
            setImportedFileDiagnostics(diagnosticProvider, importedIssues);

            results.push({
              filePath,
              lintIssues: combinedMainIssues,
              importedIssues,
              gitIssues,
            });

            const issueCount = combinedMainIssues.length + importedIssues.length + gitIssues.length;
            panel().pushStatus({ id: `file-${i}`, text: `${fileName}: ${issueCount} issue${issueCount !== 1 ? 's' : ''}`, icon: issueCount > 0 ? 'info' : 'check', replace: true });

            // Log issues for this file
            formatter.logFileIssuesCompact(filePath, combinedMainIssues, importedIssues, gitIssues);

            // Update last linted timestamp
            await updateLastLintedTimestamp(filePath);

            // Rate limiting
            if (i < fileUris.length - 1)
              await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error) {
            panel().pushStatus({ id: `file-${i}`, text: `${fileName}: error`, icon: 'error', replace: true });
            formatter.logFileError(fileName, error);
          }
        }

        let workspaceIssues: WorkspaceIssue[] = [];
        try {
          workspaceIssues = await workspaceIssuesPromise;
        } catch (error) {
          console.error('Workspace issue scan failed:', error);
        }

        return { results, workspaceIssues, totalFiles: fileUris.length, cancelled: false };
      }
  );

  if (summary.cancelled)
    return;

  const { results, workspaceIssues, totalFiles } = summary;
  const totalLint = results.reduce((sum, r) => sum + r.lintIssues.length, 0);
  const totalImported = results.reduce((sum, r) => sum + r.importedIssues.length, 0);
  const totalGit = results.reduce((sum, r) => sum + r.gitIssues.length, 0);
  const totalAll = totalLint + totalImported + totalGit;
  const filesWithIssues = results.filter(r => r.lintIssues.length > 0 || r.importedIssues.length > 0 || r.gitIssues.length > 0).length;

  panel().pushStatus({ id: 'done', text: `Analysis complete: ${totalAll} issue${totalAll !== 1 ? 's' : ''} in ${filesWithIssues}/${totalFiles} file${totalFiles !== 1 ? 's' : ''}`, icon: 'check' });

  formatter.logFolderSummary(totalFiles, filesWithIssues, totalLint, totalImported, totalGit);
  formatter.logWorkspaceIssues(workspaceIssues);

  // Store results for later prompt generation
  LintResultStore.storeFolderResult(results, workspaceIssues);
  refreshShowResultsStatusBar();

  // Update the webview panel with results (workspace issues surface in their
  // own top-level section — they are not attached to any individual file).
  panel().updateResultsFromFolder(results, workspaceIssues);
}

/**
 * Recursively find all test files in a folder
 */
function findTestFiles(folderPath: string): string[] {
  const testFiles: string[] = [];

  function scanDir(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
          scanDir(fullPath);
        else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name))
          testFiles.push(fullPath);
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`Cannot read directory: ${dir}`, error);
    }
  }

  scanDir(folderPath);
  return testFiles;
}

/**
 * Lint all test files in a folder with progress and cancellation support
 */
export async function lintFolder(
  folderUri: vscode.Uri,
  diagnosticProvider: DiagnosticProvider,
  envPath: string
): Promise<void> {
  const folderPath = folderUri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  const workspaceRoot = workspaceFolder?.uri.fsPath;

  if (!workspaceRoot) {
    vscode.window.showErrorMessage('No workspace folder found');
    return;
  }

  // Find all test files
  const testFiles = findTestFiles(folderPath);

  if (testFiles.length === 0) {
    vscode.window.showInformationMessage('No test files found in folder');
    return;
  }

  // Clear existing diagnostics for files in this folder
  for (const filePath of testFiles)
    diagnosticProvider.clear(vscode.Uri.file(filePath));

  // Reset cache so checksum.config.ts env checks run fresh for this session
  resetChecksumConfigCache();

  const output = getOutputChannel();
  const formatter = new OutputFormatter(output);

  // Always fetch the live panel — if the user closes it mid-run,
  // getLintResultsPanel() will recreate it on the next call.
  const panel = () => getLintResultsPanel();
  const folderName = path.basename(folderPath);
  panel().showLoading(folderName);
  panel().pushStatus({ id: 'init', text: `Found ${testFiles.length} test file${testFiles.length !== 1 ? 's' : ''} in ${folderName}`, icon: 'info' });

  // Run linting with progress - returns summary when done
  const summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Team AI Linter: Linting Folder',
        cancellable: true,
      },
      async (progress, token): Promise<FolderLintSummary> => {
        const apiKey = getAnthropicApiKey(envPath);
        if (!apiKey) {
          vscode.window.showErrorMessage('ANTHROPIC_API_KEY not found');
          panel().pushStatus({ id: 'error', text: 'API key not found', icon: 'error' });
          return { results: [], workspaceIssues: [], totalFiles: testFiles.length, cancelled: true };
        }

        const rules = loadRules(workspaceRoot);
        const model = getClaudeModel();
        const minConfidence = getMinConfidence();

        // Create services using factory
        const { importedFileLinter, gitSafetyChecker, eslintDetector } = createLintServices({
          apiKey,
          workspaceRoot,
          model,
          enableEslint: isEslintLayerEnabled(),
          eslintTypeAware: isEslintTypeAwareEnabled(),
        });

        // Workspace-scoped scan: runs once for the whole folder lint, in
        // parallel with the per-file work.
        const workspaceIssuesPromise = detectWorkspaceIssues(workspaceRoot);

        const results: FolderLintResult[] = [];

        formatter.logFolderHeader(folderPath, testFiles.length);

        for (let i = 0; i < testFiles.length; i++) {
          if (token.isCancellationRequested) {
            formatter.logCancelled();
            panel().pushStatus({ id: 'cancelled', text: 'Linting cancelled by user', icon: 'error' });
            return { results, workspaceIssues: [], totalFiles: testFiles.length, cancelled: true };
          }

          const filePath = testFiles[i];
          const fileName = path.basename(filePath);

          progress.report({
            message: `${fileName} (${i + 1}/${testFiles.length})`,
            increment: (1 / testFiles.length) * 100,
          });

          panel().pushStatus({ id: `file-${i}`, text: `Processing ${fileName} (${i + 1}/${testFiles.length})...`, icon: 'spinner' });

          try {
            const content = fs.readFileSync(filePath, 'utf-8');

            // Kick off ESLint in parallel with the AI/git work
            const eslintPromise: Promise<LintIssue[]> = eslintDetector
              ? eslintDetector.lintFile(filePath, content)
              : Promise.resolve([]);

            // Git safety check
            let gitIssues: GitIssue[] = [];
            try {
              gitIssues = await gitSafetyChecker.checkImports(content, filePath);
            } catch {
              // Git check failure shouldn't block linting
            }

            const result = await importedFileLinter.lintWithImports(
                filePath,
                content,
                rules,
                2,
                minConfidence
            );

            const { mainIssues, importedIssues } = result;

            const eslintIssues = await eslintPromise;
            const combinedMainIssues = [...mainIssues, ...eslintIssues];

            // Set diagnostics for this file (includes git + eslint issues)
            const fileUri = vscode.Uri.file(filePath);
            diagnosticProvider.setAllDiagnostics(fileUri, mainIssues, gitIssues, eslintIssues);

            // Set diagnostics for imported files
            setImportedFileDiagnostics(diagnosticProvider, importedIssues);

            results.push({
              filePath,
              lintIssues: combinedMainIssues,
              importedIssues,
              gitIssues,
            });

            const issueCount = combinedMainIssues.length + importedIssues.length + gitIssues.length;
            panel().pushStatus({ id: `file-${i}`, text: `${fileName}: ${issueCount} issue${issueCount !== 1 ? 's' : ''}`, icon: issueCount > 0 ? 'info' : 'check', replace: true });

            // Log issues for this file (compact format)
            formatter.logFileIssuesCompact(filePath, combinedMainIssues, importedIssues, gitIssues);

            // Update last linted timestamp in the file
            await updateLastLintedTimestamp(filePath);

            // Rate limiting: small delay between API calls
            if (i < testFiles.length - 1)
              await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error) {
            panel().pushStatus({ id: `file-${i}`, text: `${fileName}: error`, icon: 'error', replace: true });
            formatter.logFileError(fileName, error);
          }
        }

        let workspaceIssues: WorkspaceIssue[] = [];
        try {
          workspaceIssues = await workspaceIssuesPromise;
        } catch (error) {
          console.error('Workspace issue scan failed:', error);
        }

        return { results, workspaceIssues, totalFiles: testFiles.length, cancelled: false };
      }
  );

  // Now show summary AFTER progress completes (not inside the callback)
  if (summary.cancelled)
    return;

  const { results, workspaceIssues, totalFiles } = summary;
  const totalLint = results.reduce((sum, r) => sum + r.lintIssues.length, 0);
  const totalImported = results.reduce((sum, r) => sum + r.importedIssues.length, 0);
  const totalGit = results.reduce((sum, r) => sum + r.gitIssues.length, 0);
  const totalAll = totalLint + totalImported + totalGit;
  const filesWithIssues = results.filter(r => r.lintIssues.length > 0 || r.importedIssues.length > 0 || r.gitIssues.length > 0).length;

  panel().pushStatus({ id: 'done', text: `Folder analysis complete: ${totalAll} issue${totalAll !== 1 ? 's' : ''} in ${filesWithIssues}/${totalFiles} file${totalFiles !== 1 ? 's' : ''}`, icon: 'check' });

  formatter.logFolderSummary(totalFiles, filesWithIssues, totalLint, totalImported, totalGit);
  formatter.logWorkspaceIssues(workspaceIssues);

  // Store results for later prompt generation
  LintResultStore.storeFolderResult(results, workspaceIssues);
  refreshShowResultsStatusBar();

  // Update the webview panel with results (workspace issues surface in their
  // own top-level section — they are not attached to any individual file).
  panel().updateResultsFromFolder(results, workspaceIssues);
}
