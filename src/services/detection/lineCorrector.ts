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

import { LintIssue } from '../../types';
import { findChecksumAIBlocksWithAssertions } from './checksumAIAnalyzer';

/**
 * Known patterns that can be searched in the file to correct line numbers
 */
const PATTERN_MAP: Record<string, RegExp> = {
  'waitfortimeout': /\.waitForTimeout\s*\(/gi,
  'networkidle': /waitUntil:\s*["']networkidle["']/gi,
  'waitforselector': /\.waitForSelector\s*\(/gi,
  // Date patterns: month names with years, or YYYY-MM-DD formats
  'hardcoded_date': /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4}[-\/]\d{2}[-\/]\d{2}/gi,
};

/**
 * Detect which pattern type an issue is about based on message/rule
 */
function detectPatternType(issue: LintIssue): string | null {
  const message = issue.message.toLowerCase();
  const rule = issue.rule.toLowerCase();

  if (message.includes('waitfortimeout') || rule.includes('waitfortimeout'))
    return 'waitfortimeout';


  if (message.includes('networkidle') || rule.includes('networkidle'))
    return 'networkidle';


  if (message.includes('waitforselector') || rule.includes('waitforselector'))
    return 'waitforselector';

  if (rule.includes('hardcoded_date') || message.includes('hardcoded date'))
    return 'hardcoded_date';

  if (rule.includes('description') || message.includes('description'))
    return 'description';


  // Detect assertions inside checksumAI issues
  if (rule.includes('assertion') && (rule.includes('checksumai') || message.includes('checksumai')))
    return 'assertions_in_checksumai';


  return null;
}

/**
 * Extract quoted description text from an issue message
 */
function extractDescriptionFromMessage(message: string): string | null {
  // Match text in single or double quotes
  const match = message.match(/['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * Find line number where a checksumAI description appears
 */
function findDescriptionLine(lines: string[], description: string): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(description))
      return i + 1; // 1-indexed

  }
  return null;
}

/**
 * Find all line numbers where a pattern occurs
 */
function findPatternLines(lines: string[], pattern: RegExp): number[] {
  const matchingLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(lines[i]))
      matchingLines.push(i + 1); // 1-indexed

  }

  return matchingLines;
}

/**
 * Find the closest actual line to the reported line
 */
function findClosestLine(reportedLine: number, actualLines: number[]): number {
  let closest = actualLines[0];
  let minDistance = Math.abs(reportedLine - closest);

  for (const line of actualLines) {
    const distance = Math.abs(reportedLine - line);
    if (distance < minDistance) {
      minDistance = distance;
      closest = line;
    }
  }

  return closest;
}

/**
 * Validate that a line actually contains checksumAI for description-related issues.
 * Returns false if the issue is about checksumAI but the line doesn't contain it.
 */
function isValidChecksumAILine(issue: LintIssue, lines: string[]): boolean {
  const rule = issue.rule.toLowerCase();
  const message = issue.message.toLowerCase();

  // Only validate for checksumAI-related rules
  if (!rule.includes('checksumai') && !rule.includes('description') && !message.includes('checksumai'))
    return true; // Not a checksumAI issue, skip validation


  // Check if the line actually contains checksumAI
  const lineIndex = issue.line - 1; // Convert to 0-indexed
  if (lineIndex < 0 || lineIndex >= lines.length)
    return false; // Invalid line number


  const lineContent = lines[lineIndex];

  // For checksumAI description issues, the line should contain 'checksumAI'
  // or be within a few lines of a checksumAI call (allowing for multi-line calls)
  const hasChecksumAI = lineContent.includes('checksumAI');

  // Also check nearby lines (for multi-line checksumAI calls)
  const nearbyHasChecksumAI =
    (lineIndex > 0 && lines[lineIndex - 1].includes('checksumAI')) ||
    (lineIndex > 1 && lines[lineIndex - 2].includes('checksumAI')) ||
    (lineIndex < lines.length - 1 && lines[lineIndex + 1].includes('checksumAI'));

  if (!hasChecksumAI && !nearbyHasChecksumAI) {
    console.log(`Filtering out issue at line ${issue.line} - no checksumAI found: "${lineContent.trim().substring(0, 50)}..."`);
    return false;
  }

  return true;
}

/**
 * Remove duplicate issues (same line and rule)
 */
function deduplicateIssues(issues: LintIssue[]): LintIssue[] {
  const seen = new Set<string>();
  const unique: LintIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.line}:${issue.rule}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(issue);
    }
  }

  return unique;
}

/**
 * Correct line numbers by searching for actual pattern occurrences in the file.
 * Also validates and deduplicates issues.
 */
export function correctLineNumbers(issues: LintIssue[], fileContent: string): LintIssue[] {
  const lines = fileContent.split('\n');
  const correctedIssues: LintIssue[] = [];

  for (const issue of issues) {
    const patternKey = detectPatternType(issue);

    if (patternKey === 'description') {
      // For description issues, search for the quoted description text
      const description = extractDescriptionFromMessage(issue.message);
      if (description) {
        const actualLine = findDescriptionLine(lines, description);
        if (actualLine) {
          correctedIssues.push({
            ...issue,
            line: actualLine,
          });
          continue;
        }
      }
      // Couldn't find description, keep original line
      correctedIssues.push(issue);
    } else if (patternKey === 'assertions_in_checksumai') {
      // For assertions inside checksumAI issues, find the checksumAI block containing assertions
      const checksumAILines = findChecksumAIBlocksWithAssertions(lines);

      if (checksumAILines.length > 0) {
        // Find the closest checksumAI block to the reported line
        const closestLine = findClosestLine(issue.line, checksumAILines);
        correctedIssues.push({
          ...issue,
          line: closestLine,
        });
      } else {
        // No checksumAI blocks with assertions found - might be false positive
        console.log(`Filtering out assertion issue at line ${issue.line} - no checksumAI blocks with assertions found`);
      }
    } else if (patternKey && PATTERN_MAP[patternKey]) {
      // Find all actual occurrences in the file
      const actualLines = findPatternLines(lines, PATTERN_MAP[patternKey]);

      if (actualLines.length > 0) {
        // Find the closest actual line to the reported line
        const closestLine = findClosestLine(issue.line, actualLines);
        correctedIssues.push({
          ...issue,
          line: closestLine,
        });
      } else {
        // Pattern not found - might be a false positive, but keep the issue
        correctedIssues.push(issue);
      }
    } else {
      // No pattern to correct, keep as-is
      correctedIssues.push(issue);
    }
  }

  // Validate that checksumAI-related issues actually point to checksumAI lines
  const validatedIssues = correctedIssues.filter(issue => isValidChecksumAILine(issue, lines));

  // Deduplicate issues on the same line with the same rule
  return deduplicateIssues(validatedIssues);
}
