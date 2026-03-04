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

/**
 * Issue severity levels.
 * Uses string values for backward compatibility with existing code.
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * Git issue severity (subset of Severity - no 'info' level)
 */
export type GitSeverity = 'error' | 'warning';

/**
 * Type guard to check if a value is a valid Severity
 */
export function isSeverity(value: unknown): value is Severity {
  return value === 'error' || value === 'warning' || value === 'info';
}

/**
 * Type guard to check if a value is a valid GitSeverity
 */
export function isGitSeverity(value: unknown): value is GitSeverity {
  return value === 'error' || value === 'warning';
}

/**
 * Normalize any string to a valid Severity
 * Returns 'info' for unrecognized values
 */
export function normalizeSeverity(value: unknown): Severity {
  const normalized = String(value).toLowerCase();
  if (normalized === 'error')
    return 'error';
  if (normalized === 'warning' || normalized === 'warn')
    return 'warning';
  return 'info';
}
