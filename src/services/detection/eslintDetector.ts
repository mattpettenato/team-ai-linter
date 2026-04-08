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

import type { ESLint } from 'eslint';
import { LintIssue } from '../../types';

let cachedEslint: ESLint | null = null;
let cachedFor: string | null = null;

async function getEslint(workspaceRoot: string, typeAware: boolean): Promise<ESLint> {
  const cacheKey = `${workspaceRoot}::${typeAware}`;
  if (cachedEslint && cachedFor === cacheKey) {
    return cachedEslint;
  }

  const { ESLint: ESLintCtor } = await import('eslint');
  const cfg = await import('checksumai-eslint-config');
  // CommonJS interop: dynamic import of CJS may put exports under .default or top-level
  const tests = (cfg as any).tests ?? (cfg as any).default?.tests;
  if (!Array.isArray(tests)) {
    throw new Error('checksumai-eslint-config did not export a tests array');
  }

  const overrideConfig = typeAware
    ? tests
    : [
        ...tests,
        { rules: { '@typescript-eslint/no-floating-promises': 'off' } },
      ];

  cachedEslint = new ESLintCtor({
    cwd: workspaceRoot,
    overrideConfigFile: true,
    overrideConfig: overrideConfig as any,
    errorOnUnmatchedPattern: false,
  });
  cachedFor = cacheKey;
  return cachedEslint;
}

/**
 * Reset the cached ESLint instance. Call when settings change so the next
 * lint picks up fresh config.
 */
export function resetEslintCache(): void {
  cachedEslint = null;
  cachedFor = null;
}

/**
 * Run the bundled checksumai-eslint-config rules against a single file's
 * source text. Returns LintIssue[] suitable for merging into the existing
 * diagnostic pipeline. Errors are caught and logged; the detector degrades
 * gracefully to "no issues" rather than crashing the lint run.
 */
export async function lintWithEslint(
  filePath: string,
  source: string,
  workspaceRoot: string,
  typeAware: boolean = true,
): Promise<LintIssue[]> {
  try {
    const eslint = await getEslint(workspaceRoot, typeAware);
    const results = await eslint.lintText(source, { filePath, warnIgnored: false });
    const issues: LintIssue[] = [];
    for (const result of results) {
      for (const m of result.messages) {
        // Skip parser fatals; the AST detector handles real syntax errors
        if (m.fatal) {
          continue;
        }
        issues.push({
          line: m.line ?? 1,
          column: m.column,
          endLine: m.endLine,
          endColumn: m.endColumn,
          message: m.message,
          severity: m.severity === 2 ? 'error' : 'warning',
          rule: m.ruleId ?? 'eslint',
        });
      }
    }
    return issues;
  } catch (err) {
    console.warn('[EslintDetector] lint failed:', err);
    return [];
  }
}
