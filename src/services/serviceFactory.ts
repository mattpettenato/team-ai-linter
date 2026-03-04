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
import { AnthropicService } from './anthropicService';
import { ImportedFileLinter } from './importedFileLinter';
import { GitSafetyChecker } from './git/gitSafetyChecker';
import { OutputFormatter } from '../output';

/**
 * Configuration options for creating services
 */
export interface ServiceConfig {
  apiKey: string;
  workspaceRoot: string;
  model?: string;
}

/**
 * Container for all lint-related services
 */
export interface LintServices {
  anthropicService: AnthropicService;
  importedFileLinter: ImportedFileLinter;
  gitSafetyChecker: GitSafetyChecker;
}

/**
 * Create all lint-related services with proper dependency injection
 */
export function createLintServices(config: ServiceConfig): LintServices {
  const { apiKey, workspaceRoot, model } = config;

  // Create AnthropicService (core AI client)
  const anthropicService = new AnthropicService(apiKey, model);

  // Create ImportedFileLinter (depends on AnthropicService)
  const importedFileLinter = new ImportedFileLinter(workspaceRoot, anthropicService);

  // Create GitSafetyChecker (self-contained, uses workspaceRoot)
  const gitSafetyChecker = new GitSafetyChecker(workspaceRoot);

  return {
    anthropicService,
    importedFileLinter,
    gitSafetyChecker,
  };
}

/**
 * Create an OutputFormatter for a given output channel
 */
export function createOutputFormatter(channel: vscode.OutputChannel): OutputFormatter {
  return new OutputFormatter(channel);
}

/**
 * Create services for single file linting
 */
export function createSingleFileLintServices(
  apiKey: string,
  workspaceRoot: string,
  model?: string,
  outputChannel?: vscode.OutputChannel
): LintServices & { formatter?: OutputFormatter } {
  const services = createLintServices({ apiKey, workspaceRoot, model });

  return {
    ...services,
    formatter: outputChannel ? createOutputFormatter(outputChannel) : undefined,
  };
}

/**
 * Create services for folder linting (same as single file, but explicit name for clarity)
 */
export function createFolderLintServices(
  apiKey: string,
  workspaceRoot: string,
  model?: string,
  outputChannel?: vscode.OutputChannel
): LintServices & { formatter?: OutputFormatter } {
  return createSingleFileLintServices(apiKey, workspaceRoot, model, outputChannel);
}
