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
import { getBundledGuidelinesPath } from '../extension';

/**
 * Default rules to use when no rules file is found
 */
const DEFAULT_RULES = `# Test Best Practices

## Anti-Patterns (ERROR)
- Using \`(obj as any)\` to access private properties - breaks encapsulation and type safety
- Using \`.skip\` or \`xit\` without a comment explaining why the test is skipped
- Hardcoded timeout magic numbers (e.g., \`5000\`, \`10000\`) - use named constants instead
- Empty catch blocks that swallow errors silently

## Required Patterns (WARNING)
- Tests should have proper cleanup in \`afterEach\` or \`afterAll\`
- Mock functions should be reset between tests (\`jest.clearAllMocks()\` or similar)
- Async operations should have proper error handling
- Error assertions should check error type, not just that an error was thrown

## Style Guidelines (INFO)
- Test names should follow "should <action> when <condition>" pattern
- Use specific matchers (\`.toEqual()\`, \`.toStrictEqual()\`) over generic ones (\`.toBeTruthy()\`)
- Group related tests with nested describe blocks
- Keep test setup code in \`beforeEach\` blocks, not duplicated in each test
`;

/**
 * Load rules from the configured rules file
 * Priority: globalRulesPath (override) > bundled guidelines.md > workspace rulesPath > DEFAULT_RULES
 */
export function loadRules(workspaceRoot: string): string {
  const config = vscode.workspace.getConfiguration('teamAiLinter');

  // First check for global rules path (allows override if needed)
  const globalRulesPath = config.get<string>('globalRulesPath');
  if (globalRulesPath && globalRulesPath.trim() !== '') {
    const expandedPath = globalRulesPath.replace(/^~/, process.env.HOME || '');
    if (fs.existsSync(expandedPath)) {
      try {
        console.log(`Loading rules from global path: ${expandedPath}`);
        return fs.readFileSync(expandedPath, 'utf-8');
      } catch (error) {
        console.warn(`Failed to read global rules file at ${expandedPath}:`, error);
      }
    } else {
      console.warn(`Global rules file not found: ${expandedPath}`);
    }
  }

  // Use bundled guidelines.md (shipped with extension)
  const bundledPath = getBundledGuidelinesPath();
  if (bundledPath) {
    try {
      console.log(`Loading bundled guidelines from: ${bundledPath}`);
      return fs.readFileSync(bundledPath, 'utf-8');
    } catch (error) {
      console.warn(`Failed to read bundled guidelines:`, error);
    }
  }

  // Fall back to workspace rules path
  const rulesPath = config.get<string>('rulesPath') || '.ai-linter/rules.md';
  const absolutePath = path.isAbsolute(rulesPath)
    ? rulesPath
    : path.join(workspaceRoot, rulesPath);

  if (fs.existsSync(absolutePath)) {
    try {
      console.log(`Loading rules from workspace path: ${absolutePath}`);
      return fs.readFileSync(absolutePath, 'utf-8');
    } catch (error) {
      console.warn(`Failed to read rules file at ${absolutePath}:`, error);
      return DEFAULT_RULES;
    }
  }

  // Return default rules if no custom rules file exists
  console.log('Using default rules');
  return DEFAULT_RULES;
}

/**
 * Get the workspace root for a document
 */
export function getWorkspaceRoot(document: vscode.TextDocument): string | null {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return workspaceFolder?.uri.fsPath || null;
}

/**
 * Check if a rules file exists in the workspace
 */
export function rulesFileExists(workspaceRoot: string): boolean {
  const config = vscode.workspace.getConfiguration('teamAiLinter');
  const rulesPath = config.get<string>('rulesPath') || '.ai-linter/rules.md';

  const absolutePath = path.isAbsolute(rulesPath)
    ? rulesPath
    : path.join(workspaceRoot, rulesPath);

  return fs.existsSync(absolutePath);
}

/**
 * Get the Claude model to use
 */
export function getClaudeModel(): string {
  const config = vscode.workspace.getConfiguration('teamAiLinter');
  return config.get<string>('model') || 'claude-sonnet-4-20250514';
}

/**
 * Get the minimum confidence threshold for AI-detected issues
 */
export function getMinConfidence(): number {
  const config = vscode.workspace.getConfiguration('teamAiLinter');
  return config.get<number>('minConfidence') ?? 0.5;
}

/**
 * Check if nth selector warnings should be ignored
 */
export function shouldIgnoreNthSelectors(): boolean {
  const config = vscode.workspace.getConfiguration('teamAiLinter');
  return config.get<boolean>('ignoreNthSelectors') ?? false;
}

/**
 * Get the configured .env file path (if any)
 */
export function getEnvFilePath(): string | undefined {
  const config = vscode.workspace.getConfiguration('teamAiLinter');
  return config.get<string>('envFilePath') || undefined;
}

/**
 * Find checksum.config.ts by walking up from the given file path
 */
export function findChecksumConfigPath(fromFilePath: string): string | undefined {
  let dir = path.dirname(fromFilePath);
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  while (dir && dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'checksum.config.ts');
    if (fs.existsSync(candidate)) return candidate;
    if (root && dir === root) break;
    dir = path.dirname(dir);
  }
  return undefined;
}
