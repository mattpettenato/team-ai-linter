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

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execFileSync } from 'child_process';
import { LintIssue, Severity } from '../../types';
import { findChecksumAIBlocksWithDescription, isLineInChecksumAIBlock, findSkipAutoRecoveryCatchLines, findNestedChecksumAIBlocks } from './checksumAIAnalyzer';
import {
  findUnusedImports,
  findUnusedParameters,
  validateBugAnnotations,
  findConstDeclarationsInTests,
  findExpectsInsideChecksumAI,
  findMissingEnvVarGuards,
  findEnvVarsNotInDotenv,
  findMultipleActionsInChecksumAI,
  findExpectsWithoutMessages
} from './astDetector';
import { spellCheckFile } from './spellChecker';
import { shouldIgnoreNthSelectors, getEnvFilePath, findChecksumConfigPath } from '../../config/configLoader';
import { loadEnvFile } from '../../config/envLoader';

/**
 * Tracks which checksum.config.ts paths have already been checked this session.
 * Issues are only reported once (for the first file linted), then skipped.
 * Call resetChecksumConfigCache() at the start of each lint session.
 */
const _checksumConfigChecked = new Set<string>();

/**
 * Tracks which workspace roots have already been scanned for colon-in-filename
 * issues this session. The scan runs once per session regardless of how many
 * files are linted.
 */
const _colonFilenameChecked = new Set<string>();

/**
 * Resets per-session caches (checksum.config.ts check, colon-in-filename scan).
 * Call at the start of each lint session.
 */
export function resetChecksumConfigCache(): void {
  _checksumConfigChecked.clear();
  _colonFilenameChecked.clear();
}

/**
 * Pattern definition for deterministic detection
 */
export interface DeterministicPattern {
  pattern: RegExp;
  rule: string;
  message: string;
  severity: Severity;
}

/**
 * Deterministic pattern detection configuration
 */
export const DETERMINISTIC_PATTERNS: DeterministicPattern[] = [
  {
    pattern: /\.waitForTimeout\s*\(/g,
    rule: 'avoid_waitForTimeout',
    message: 'Consider using web-first assertions instead of waitForTimeout for better reliability',
    severity: 'warning',
  },
  {
    pattern: /\.waitFor\s*\(\s*(?:\)|\{(?:(?!state\s*:)[^}])*\}\s*\))/g,
    rule: 'prefer_web_first_assertion',
    message: 'Use web-first assertions instead of .waitFor(). Replace with expect(locator).toBeVisible() or expect(locator).toBeHidden().',
    severity: 'warning',
  },
  {
    pattern: /\.waitFor\s*\(\s*\{[^}]*state\s*:\s*["'](?:visible|hidden)["'][^}]*\}/g,
    rule: 'prefer_web_first_assertion',
    message: 'Use web-first assertions instead of .waitFor(). Replace with expect(locator).toBeVisible() or expect(locator).toBeHidden().',
    severity: 'warning',
  },
  {
    pattern: /expect\s*\(.*\.to(?:Be|Have|Contain)\w*\s*\([^)]*\btimeout\s*:/g,
    rule: 'unnecessary_assertion_timeout',
    message: 'Remove explicit timeout from assertion. Rely on the global assertion timeout configured in playwright.config.ts.',
    severity: 'warning',
  },
  {
    pattern: /waitUntil:\s*["']networkidle["']/g,
    rule: 'avoid_networkidle',
    message: 'Avoid using networkidle - use domcontentloaded instead',
    severity: 'warning',
  },
  {
    pattern: /waitForLoadState\s*\(\s*["']networkidle["']\s*\)/g,
    rule: 'avoid_networkidle',
    message: 'Avoid using networkidle - use domcontentloaded instead',
    severity: 'warning',
  },
  {
    pattern: /\.nth\s*\(\s*\d+\s*\)/g,
    rule: 'avoid_nth_selector',
    message: 'Avoid using .nth() selector unless the index is part of the test logic. Consider using more specific locators.',
    severity: 'warning',
  },
  {
    pattern: /import\s*{[^}]*(?:Page|expect)[^}]*}\s*from\s*["']@playwright\/test["']/g,
    rule: 'wrong_playwright_import',
    message: 'Do not import Page or expect from @playwright/test. Use imports from @checksum-ai/runtime instead.',
    severity: 'error',
  },
  {
    pattern: /as\s+string\b/g,
    rule: 'unsafe_type_assertion',
    message: "Avoid using 'as string' type assertion - failures become difficult to diagnose",
    severity: 'warning',
  },
  {
    pattern: /\|\|\s*["']["']/g,
    rule: 'unsafe_type_assertion',
    message: 'Avoid using || "" fallback pattern - failures become difficult to diagnose',
    severity: 'warning',
  },
  {
    pattern: /\.goto\s*\(\s*["']https?:\/\/[^"']+["']/g,
    rule: 'hardcoded_url',
    message: 'Avoid hardcoded URLs - use baseURL from environment configuration instead',
    severity: 'warning',
  },
  {
    pattern: /environment\.users\s*!\s*\[\d+\]/g,
    rule: 'direct_environment_access',
    message: 'Avoid direct environment access. Store value in vs first: vs.varName = environment.users![0].property',
    severity: 'warning',
  },
  {
    pattern: /^\s+(?!.*\bawait\b)(?!.*\breturn\b).*\b(?:page|incognitoPage)\b.*\.(?:click|dblclick|fill|type|press|hover|focus|blur|check|uncheck|selectOption|setInputFiles|tap|scrollIntoViewIfNeeded)\s*\(/g,
    rule: 'missing_await_on_action',
    message: 'Missing await on Playwright action. All Playwright actions return Promises and must be awaited for proper execution and checksumAI tracking.',
    severity: 'error',
  },
  {
    pattern: /\/\/\s*await\s+checksumAI\s*\(/g,
    rule: 'commented_checksumai_block',
    message: 'Remove commented-out checksumAI blocks. Use version control to preserve old code.',
    severity: 'warning',
  },
  {
    pattern: /^\s*await\s+(?:page|incognitoPage)\s*\.\s*waitForURL\s*\(/gm,
    rule: 'unwrapped_waitForURL',
    message: 'Wrap waitForURL in checksumAI for better debugging and AI agent recovery.',
    severity: 'warning',
  },
  {
    pattern: /^\s*await\s+(?:page|incognitoPage)\s*\.\s*waitForSelector\s*\(/gm,
    rule: 'unwrapped_waitForSelector',
    message: 'Wrap waitForSelector in checksumAI for better debugging and AI agent recovery.',
    severity: 'warning',
  },
  {
    pattern: /^\s*await\s+(?:page|incognitoPage)\s*\.\s*waitForLoadState\s*\(/gm,
    rule: 'unwrapped_waitForLoadState',
    message: 'Consider wrapping waitForLoadState in checksumAI for better debugging.',
    severity: 'info',
  },
  {
    pattern: /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g,
    rule: 'silent_fallback',
    message: 'Empty .catch() swallows errors silently. Tests should fail when something goes wrong.',
    severity: 'warning',
  },
  {
    pattern: /\.catch\s*\(\s*\(\s*\)\s*=>\s*(?:null|undefined)\s*\)/g,
    rule: 'silent_fallback',
    message: '.catch(() => null) swallows errors. Let failures propagate to fail the test.',
    severity: 'warning',
  },
  {
    pattern: /\|\|\s*\[\s*\]/g,
    rule: 'silent_fallback',
    message: 'Using || [] hides missing data. If data is expected, let the test fail when missing.',
    severity: 'warning',
  },
  {
    pattern: /\?\?\s*\[\s*\]/g,
    rule: 'silent_fallback',
    message: 'Using ?? [] hides missing data. If data is expected, let the test fail when missing.',
    severity: 'warning',
  },
  {
    pattern: /\?\?\s*0\b/g,
    rule: 'silent_fallback',
    message: 'Using ?? 0 can mask missing data. Consider if the test should fail when value is missing.',
    severity: 'info',
  },
  {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    rule: 'silent_fallback',
    message: 'Empty catch block swallows errors. Tests should fail when exceptions occur.',
    severity: 'warning',
  },
  {
    pattern: /catch\s*\([^)]*\)\s*\{\s*console\.(?:log|warn|error)\s*\([^)]*\)\s*;?\s*\}/g,
    rule: 'silent_fallback',
    message: 'Catch block only logs error but does not fail the test. Consider re-throwing.',
    severity: 'warning',
  },
  {
    pattern: /import\s*\{[^}]*\brepl\b[^}]*\}\s*from\s/g,
    rule: 'repl_import',
    message: 'REPL import detected. The repl tool is for local debugging only and must not be committed to test files.',
    severity: 'error',
  },
  {
    pattern: /\{\s*repl\s*\}\s*=\s*require\s*\(/g,
    rule: 'repl_import',
    message: 'REPL import detected. The repl tool is for local debugging only and must not be committed to test files.',
    severity: 'error',
  },
];

/**
 * Rules that should be skipped if they're inside a checksumAI block
 */
const SKIP_IN_CHECKSUMAI_RULES = new Set([
  'avoid_waitForTimeout',
  'unwrapped_waitForLoadState',
  'unwrapped_waitForSelector',
  'unwrapped_waitForURL',
]);

/**
 * Check if a line is a comment (starts with // after whitespace)
 */
export function isCommentLine(line: string): boolean {
  return /^\s*\/\//.test(line);
}

/**
 * Detect simple patterns deterministically using regex.
 * This supplements AI detection for patterns it might miss.
 */
export async function detectDeterministicPatterns(fileContent: string, filePath: string = ''): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  const lines = fileContent.split('\n');

  // Determine if this is a utility file (not a test file)
  const isUtilityFile = !filePath.includes('.spec.') && !filePath.includes('.test.');

  // Find checksumAI blocks with descriptions for waitForTimeout exception
  const checksumAIBlocksWithDescription = findChecksumAIBlocksWithDescription(lines);

  // Find catch lines that belong to skipAutoRecovery try blocks
  // Empty catches are intentional in these contexts - they check for optional state
  const skipAutoRecoveryCatchLines = findSkipAutoRecoveryCatchLines(lines);

  // Get configuration options
  const ignoreNthSelectors = shouldIgnoreNthSelectors();

  // Check regex patterns
  for (const { pattern, rule, message, severity } of DETERMINISTIC_PATTERNS) {
    // Skip nth selector check if user has disabled it
    if (rule === 'avoid_nth_selector' && ignoreNthSelectors)
      continue;

    for (let i = 0; i < lines.length; i++) {
      // Skip commented-out lines
      if (isCommentLine(lines[i]))
        continue;


      // Reset regex lastIndex
      pattern.lastIndex = 0;
      if (pattern.test(lines[i])) {
        const lineNumber = i + 1; // 1-indexed

        // Skip certain rules if inside a checksumAI block with a description
        if (SKIP_IN_CHECKSUMAI_RULES.has(rule) &&
            isLineInChecksumAIBlock(lineNumber, checksumAIBlocksWithDescription))
          continue;

        // Skip silent_fallback for empty catch blocks in skipAutoRecovery contexts
        // These are intentional - skipAutoRecovery checks for optional state
        if (rule === 'silent_fallback' && skipAutoRecoveryCatchLines.has(lineNumber))
          continue;


        issues.push({
          line: lineNumber,
          message,
          severity,
          rule,
        });
      }
    }
  }

  // Utility-file-only patterns: Wrong Page type
  if (isUtilityFile) {
    const pageTypePattern = /:\s*Page\b(?!\s*\|)/;
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i]))
        continue;


      if (pageTypePattern.test(lines[i])) {
        issues.push({
          line: i + 1,
          message: 'Use IChecksumPage instead of Page type in utility functions. Import from @checksum-ai/runtime.',
          severity: 'error',
          rule: 'wrong_page_type',
        });
      }
    }
  }

  // AST-based detections
  await detectASTPatterns(issues, fileContent, filePath, isUtilityFile);

  return issues;
}

/**
 * Run AST-based pattern detection
 */
async function detectASTPatterns(
  issues: LintIssue[],
  fileContent: string,
  filePath: string,
  isUtilityFile: boolean
): Promise<void> {
  // Detect expect statements inside checksumAI blocks (always an error)
  try {
    const expectInsideChecksumAIResults = findExpectsInsideChecksumAI(fileContent, filePath);
    console.log(`[DeterministicDetector] findExpectsInsideChecksumAI found ${expectInsideChecksumAIResults.length} issues`);
    for (const result of expectInsideChecksumAIResults) {
      issues.push({
        line: result.line,
        message: 'Never put expect/assertions inside checksumAI wrappers. Assertions should be outside checksumAI blocks.',
        severity: 'error',
        rule: 'expect_inside_checksumai',
      });
    }
  } catch (error) {
    console.warn('[DeterministicDetector] Failed to check expects inside checksumAI:', error);
  }

  // Detect nested checksumAI blocks (checksumAI wrapping other checksumAI calls)
  try {
    const nestedBlocks = findNestedChecksumAIBlocks(fileContent.split('\n'));
    for (const line of nestedBlocks) {
      issues.push({
        line,
        message: 'Avoid nesting checksumAI blocks. Each checksumAI should contain direct actions, not other checksumAI wrappers. Flatten the structure so the AI agent can recover individual steps.',
        severity: 'warning',
        rule: 'nested_checksumai',
      });
    }
  } catch (error) {
    console.warn('[DeterministicDetector] Failed to check nested checksumAI:', error);
  }

  // AST-based: Unused imports
  try {
    const unusedImports = findUnusedImports(fileContent, filePath);
    for (const unused of unusedImports) {
      issues.push({
        line: unused.line,
        message: `Unused import '${unused.importName}' from '${unused.moduleSpecifier}'`,
        severity: 'warning',
        rule: 'unused_import',
      });
    }
  } catch (error) {
    console.warn('[DeterministicDetector] Failed to check unused imports:', error);
  }

  // AST-based: Unused parameters (only for utility files to reduce noise)
  if (isUtilityFile) {
    try {
      const unusedParams = findUnusedParameters(fileContent, filePath);
      for (const unused of unusedParams) {
        issues.push({
          line: unused.line,
          message: `Unused parameter '${unused.parameterName}' in function '${unused.functionName}'`,
          severity: 'warning',
          rule: 'unused_parameter',
        });
      }
    } catch (error) {
      console.warn('[DeterministicDetector] Failed to check unused parameters:', error);
    }
  }

  // AST-based: Bug annotation validation (only for test files)
  if (!isUtilityFile) {
    try {
      const bugIssues = validateBugAnnotations(fileContent, filePath);
      for (const issue of bugIssues) {
        const missingList = issue.missingComponents.join(', ');
        const expectedFormat = `Expected format: test("Test name", { tag: ["@bug"], annotation: { type: "bug", description: "Bug description" } }, async () => { ... })`;
        issues.push({
          line: issue.line,
          message: `Incomplete bug annotation for test "${issue.testName}". Missing: ${missingList}. ${expectedFormat}`,
          severity: 'error',
          rule: 'incomplete_bug_annotation',
        });
      }
    } catch (error) {
      console.warn('[DeterministicDetector] Failed to validate bug annotations:', error);
    }

    // AST-based: Const declarations in tests (prefer variableStore)
    try {
      const constIssues = findConstDeclarationsInTests(fileContent, filePath);
      for (const issue of constIssues) {
        issues.push({
          line: issue.line,
          message: `Use variableStore instead of const: vs.${issue.variableName} = value (in test "${issue.testName}")`,
          severity: 'warning',
          rule: 'prefer_variablestore',
        });
      }
    } catch (error) {
      console.warn('[DeterministicDetector] Failed to check const declarations:', error);
    }
  }

  // AST-based: Multiple actions in checksumAI blocks
  try {
    const multiActionIssues = findMultipleActionsInChecksumAI(fileContent, filePath);
    for (const result of multiActionIssues) {
      issues.push({
        line: result.line,
        message: `checksumAI block "${result.checksumAIDescription}" contains ${result.actionCount} user actions. Each checksumAI wrapper should contain exactly one action so the AI agent can recover individual steps independently.`,
        severity: 'warning',
        rule: 'multiple_actions_in_checksumai',
      });
    }
  } catch (error) {
    console.warn('[DeterministicDetector] Failed to check multiple actions in checksumAI:', error);
  }

  // AST-based: Expects without messages (only for test files)
  if (!isUtilityFile) {
    try {
      const noMessageIssues = findExpectsWithoutMessages(fileContent, filePath);
      for (const result of noMessageIssues) {
        issues.push({
          line: result.line,
          message: 'Add a descriptive message to this assertion so failures are self-explanatory: expect(locator, "message").toBeVisible()',
          severity: 'warning',
          rule: 'missing_assertion_message',
        });
      }
    } catch (error) {
      console.warn('[DeterministicDetector] Failed to check expects without messages:', error);
    }
  }

  // Always check checksum.config.ts env vars, regardless of which file is being linted.
  // Only reports once per lint session — subsequent files skip entirely.
  try {
    const configPath = findChecksumConfigPath(filePath);
    if (configPath && !_checksumConfigChecked.has(configPath)) {
      _checksumConfigChecked.add(configPath);
      const configContent = fs.readFileSync(configPath, 'utf-8');

      // Check 1: Guard completeness
      const envGuardIssues = findMissingEnvVarGuards(configContent, configPath);
      for (const issue of envGuardIssues) {
        issues.push({
          line: issue.line,
          message: issue.guardExists
            ? `[checksum.config.ts] Incomplete env var guard. Missing: ${issue.missingVars.map(v => 'process.env.' + v).join(', ')}`
            : `[checksum.config.ts] Missing env var guard. Add if-statement checking: ${issue.missingVars.map(v => 'process.env.' + v).join(', ')}`,
          severity: 'error',
          rule: 'missing_env_var_guard',
        });
      }

      // Check 2: Env vars exist in .env file (consolidated into one issue)
      // Prefer .env next to checksum.config.ts (matches dotenv.config({ path: __dirname/.env }))
      // Fall back to the global envFilePath setting
      const configDir = path.dirname(configPath);
      const localEnvPath = path.join(configDir, '.env');
      const envFilePath = fs.existsSync(localEnvPath) ? localEnvPath : getEnvFilePath();
      if (envFilePath) {
        const dotenvVars = new Set(Object.keys(loadEnvFile(envFilePath)));
        const notInDotenv = findEnvVarsNotInDotenv(configContent, configPath, dotenvVars);
        if (notInDotenv.length > 0) {
          const varNames = notInDotenv.map(i => i.varName);
          issues.push({
            line: notInDotenv[0].line,
            message: `[checksum.config.ts] Env vars not defined in .env file: ${varNames.join(', ')}`,
            severity: 'warning',
            rule: 'env_var_not_in_dotenv',
          });
        }
      }
    }
  } catch (error) {
    console.warn('[DeterministicDetector] Failed to check checksum.config.ts env vars:', error);
  }

  // Repo-wide check: filenames containing ':' break git clone/checkout on Windows.
  // Runs once per lint session per workspace root. Uses `git ls-files` so we only
  // flag tracked files (the ones that would actually break a teammate's clone).
  try {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot && !_colonFilenameChecked.has(workspaceRoot)) {
      _colonFilenameChecked.add(workspaceRoot);

      const output = execFileSync('git', ['ls-files', '-z'], {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB — handles very large repos
      });

      // -z uses NUL as separator so filenames with spaces/special chars are safe
      const trackedFiles = output.split('\0').filter(Boolean);

      for (const relPath of trackedFiles) {
        const baseName = path.basename(relPath);
        if (baseName.includes(':')) {
          const suggestedName = baseName.replace(/:/g, '-');
          issues.push({
            line: 1,
            message: `[${relPath}] Filename contains ':' which breaks git clone/checkout on Windows. Rename to: ${suggestedName}`,
            severity: 'error',
            rule: 'invalid_filename_colon',
          });
        }
      }
    }
  } catch (error) {
    // Silently skip if not a git repo, git not installed, or scan fails.
    console.warn('[DeterministicDetector] Failed to scan for invalid filenames:', error);
  }

  // Spell checking for test descriptions, checksumAI descriptions, and comments
  try {
    const spellIssues = await spellCheckFile(fileContent);
    for (const issue of spellIssues) {
      const suggestionText = issue.suggestions.length > 0
        ? `. Did you mean: ${issue.suggestions.join(', ')}?`
        : '';
      issues.push({
        line: issue.line,
        message: `Possible spelling error "${issue.word}" in ${issue.context}${suggestionText}`,
        severity: 'info',
        rule: 'spelling',
      });
    }
  } catch (error) {
    console.warn('[DeterministicDetector] Failed to spell check:', error);
  }
}

/**
 * Merge AI-detected issues with deterministic issues, deduplicating by line
 *
 * Note: ESLint-sourced issues (rules prefixed with `checksum/*` or `@typescript-eslint/*`)
 * do not flow through this function — they are added directly to the diagnostic provider.
 * Their unique rule prefixes also guarantee they cannot collide with AI/deterministic rule keys.
 */
export function mergeAndDeduplicateIssues(aiIssues: LintIssue[], deterministicIssues: LintIssue[]): LintIssue[] {
  const seen = new Set<string>();
  const merged: LintIssue[] = [];

  // Add deterministic issues first (they have accurate line numbers).
  // Dedup key includes the message so rules that emit multiple distinct
  // issues on the same line (e.g. invalid_filename_colon listing several
  // offenders at line 1) are preserved rather than collapsed.
  for (const issue of deterministicIssues) {
    const key = `${issue.line}:${issue.rule}:${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(issue);
    }
  }

  // Add AI issues that aren't duplicates
  for (const issue of aiIssues) {
    // For patterns that have deterministic detection, skip AI-detected ones
    // (deterministic is more reliable)
    const isDeterministicPattern = DETERMINISTIC_PATTERNS.some(
        p => p.rule.toLowerCase() === issue.rule.toLowerCase() ||
           issue.message.toLowerCase().includes('waitfortimeout') ||
           issue.message.toLowerCase().includes('networkidle') ||
           issue.message.toLowerCase().includes('.nth(') ||
           issue.message.toLowerCase().includes('as string') ||
           issue.message.toLowerCase().includes('|| ""') ||
           issue.message.toLowerCase().includes('hardcoded url') ||
           issue.message.toLowerCase().includes('@playwright/test') ||
           issue.rule.toLowerCase().includes('expect_inside_checksumai') ||
           (issue.message.toLowerCase().includes('expect') && issue.message.toLowerCase().includes('checksumai')) ||
           issue.message.toLowerCase().includes('missing await') ||
           issue.rule.toLowerCase().includes('missing_await') ||
           issue.rule.toLowerCase().includes('nested_checksumai') ||
           (issue.message.toLowerCase().includes('nested') && issue.message.toLowerCase().includes('checksumai')) ||
           issue.rule.toLowerCase().includes('missing_assertion_message') ||
           (issue.message.toLowerCase().includes('assertion') && issue.message.toLowerCase().includes('message')) ||
           issue.rule.toLowerCase().includes('missing_env_var_guard') ||
           issue.rule.toLowerCase().includes('env_var_not_in_dotenv') ||
           issue.rule.toLowerCase().includes('missing_import') ||
           issue.rule.toLowerCase().includes('wrong_import_pattern') ||
           issue.message.toLowerCase().includes('cannot resolve import') ||
           issue.message.toLowerCase().includes('file not found') ||
           issue.message.toLowerCase().includes('file does not exist') ||
           (issue.message.toLowerCase().includes('import') && issue.message.toLowerCase().includes('init()')) ||
           issue.rule.toLowerCase().includes('repl_import') ||
           (issue.message.toLowerCase().includes('repl') && issue.message.toLowerCase().includes('import')) ||
           issue.rule.toLowerCase().includes('multiple_actions_in_checksumai') ||
           (issue.message.toLowerCase().includes('multiple') && issue.message.toLowerCase().includes('checksumai')) ||
           issue.rule.toLowerCase().includes('prefer_web_first_assertion') ||
           (issue.message.toLowerCase().includes('waitfor') && issue.message.toLowerCase().includes('assertion')) ||
           issue.rule.toLowerCase().includes('unnecessary_assertion_timeout') ||
           (issue.message.toLowerCase().includes('timeout') && issue.message.toLowerCase().includes('assertion'))
    );

    if (isDeterministicPattern) {
      // Skip - we already have accurate deterministic detection
      continue;
    }

    const key = `${issue.line}:${issue.rule}:${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(issue);
    }
  }

  // Sort by line number
  return merged.sort((a, b) => a.line - b.line);
}
