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
 * Represents a range of lines for a checksumAI block
 */
export interface ChecksumAIBlockRange {
  start: number;  // 1-indexed line number
  end: number;    // 1-indexed line number
}

/**
 * Pattern to identify a checksumAI call (with or without description on same line)
 */
const CHECKSUMAI_CALL_PATTERN = /checksumAI\s*\(/;

/**
 * Pattern to check if a block has a description (single-line)
 */
const HAS_DESCRIPTION_PATTERN = /checksumAI\s*\(\s*["'][^"']+["']/;

/**
 * Pattern to check if a block has an assertion
 */
const HAS_ASSERTION_PATTERN = /\bexpect\s*\(/;

/**
 * Pattern to check if an assertion is actually asserting (not just selecting)
 */
const ASSERTION_METHOD_PATTERN = /\.\s*(toBe|toEqual|toHaveText|toBeVisible|toBeHidden|toBeEnabled|toBeDisabled|toHaveAttribute|toHaveCount|toContain|toBeTruthy|toBeFalsy|toHaveValue|toHaveClass|toMatch|toThrow)\s*\(/;

/**
 * Options for finding checksumAI blocks
 */
interface FindBlocksOptions {
  /** If true, only return blocks that contain assertions */
  withAssertions?: boolean;
  /** If true, only return blocks that have descriptions */
  withDescription?: boolean;
}

/**
 * Parse a checksumAI block starting from a given line.
 * Returns the block content and end line number.
 */
function parseChecksumAIBlock(lines: string[], startIndex: number): { content: string; endIndex: number } {
  let depth = 0;
  let foundOpenBrace = false;
  let content = '';
  let j = startIndex;

  while (j < lines.length) {
    const currentLine = lines[j];
    content += currentLine + '\n';

    for (const char of currentLine) {
      if (char === '(' || char === '{') {
        depth++;
        if (char === '{')
          foundOpenBrace = true;

      } else if (char === ')' || char === '}') {
        depth--;
      }
    }

    // Block is complete when we've found the opening brace and depth returns to 0
    if (foundOpenBrace && depth === 0)
      break;

    j++;
  }

  return { content, endIndex: j };
}

/**
 * Check if a checksumAI block has a description string argument.
 * Handles both single-line and multi-line formats:
 *   checksumAI("description", async () => { ... })
 *   checksumAI(
 *     "description",
 *     async () => { ... }
 *   )
 */
function hasDescription(content: string): boolean {
  // First check if it matches the simple single-line pattern
  if (HAS_DESCRIPTION_PATTERN.test(content)) {
    return true;
  }

  // For multi-line, look for a string literal after the opening paren
  // Remove the checksumAI call itself to get just the arguments
  const argsMatch = content.match(/checksumAI\s*\(([\s\S]*)/);
  if (!argsMatch) return false;

  const args = argsMatch[1];

  // Look for a string literal (single, double, or backtick quotes) as the first argument
  // Skip leading whitespace and newlines
  const stringPattern = /^\s*["'`]([^"'`]+)["'`]/;
  return stringPattern.test(args);
}

/**
 * Find all checksumAI blocks matching the given options.
 * Returns an array of block ranges (1-indexed line numbers).
 */
export function findChecksumAIBlocks(lines: string[], options: FindBlocksOptions = {}): ChecksumAIBlockRange[] {
  const results: ChecksumAIBlockRange[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Look for checksumAI call start
    if (CHECKSUMAI_CALL_PATTERN.test(line)) {
      const startLine = i + 1; // 1-indexed
      const { content, endIndex } = parseChecksumAIBlock(lines, i);

      // Check if block matches requested criteria
      let matches = true;

      if (options.withDescription)
        matches = matches && hasDescription(content);


      if (options.withAssertions) {
        const hasExpect = HAS_ASSERTION_PATTERN.test(content);
        const hasAssertionMethod = ASSERTION_METHOD_PATTERN.test(content);
        matches = matches && hasExpect && hasAssertionMethod;
      }

      if (matches)
        results.push({ start: startLine, end: endIndex + 1 }); // 1-indexed


      // Move past this block
      i = endIndex + 1;
    } else {
      i++;
    }
  }

  return results;
}

/**
 * Find all checksumAI blocks that contain assertions (expect calls).
 * Returns the line numbers where these checksumAI calls start.
 */
export function findChecksumAIBlocksWithAssertions(lines: string[]): number[] {
  const blocks = findChecksumAIBlocks(lines, { withAssertions: true });
  return blocks.map(block => block.start);
}

/**
 * Find all checksumAI blocks that have a description (first string argument).
 * Returns an array of { start, end } line number ranges (1-indexed).
 */
export function findChecksumAIBlocksWithDescription(lines: string[]): ChecksumAIBlockRange[] {
  return findChecksumAIBlocks(lines, { withDescription: true });
}

/**
 * Check if a line number is inside any of the given checksumAI block ranges
 */
export function isLineInChecksumAIBlock(lineNumber: number, blocks: ChecksumAIBlockRange[]): boolean {
  for (const block of blocks) {
    if (lineNumber >= block.start && lineNumber <= block.end)
      return true;

  }
  return false;
}

/**
 * Find checksumAI blocks that contain other checksumAI blocks (nesting).
 * Returns the line numbers of the OUTER blocks that wrap inner checksumAI calls.
 * Nested checksumAI is improper usage - each checksumAI block should contain
 * actions, not other checksumAI blocks.
 */
export function findNestedChecksumAIBlocks(lines: string[]): number[] {
  // Find ALL checksumAI calls, including nested ones (don't skip past blocks)
  const allBlocks: ChecksumAIBlockRange[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (CHECKSUMAI_CALL_PATTERN.test(lines[i])) {
      const startLine = i + 1; // 1-indexed
      const { endIndex } = parseChecksumAIBlock(lines, i);
      allBlocks.push({ start: startLine, end: endIndex + 1 });
      // Continue scanning - don't skip to endIndex, so we find nested blocks too
    }
  }

  // Find outer blocks that contain at least one inner checksumAI block
  const outerLines: Set<number> = new Set();
  for (const outer of allBlocks) {
    for (const inner of allBlocks) {
      if (outer === inner) continue;
      if (inner.start > outer.start && inner.end <= outer.end) {
        outerLines.add(outer.start);
        break;
      }
    }
  }

  return Array.from(outerLines);
}

/**
 * Pattern to detect .skipAutoRecovery() calls
 */
const SKIP_AUTO_RECOVERY_PATTERN = /\.skipAutoRecovery\s*\(/;

/**
 * Find catch blocks that belong to try blocks containing .skipAutoRecovery().
 * Returns the line numbers of catch statements in these blocks.
 *
 * Empty catches in skipAutoRecovery contexts are intentional - the pattern
 * is used to check if something exists/is in a certain state, and if not,
 * continue without failing.
 */
export function findSkipAutoRecoveryCatchLines(lines: string[]): Set<number> {
  const catchLines = new Set<number>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Look for 'try' keyword
    if (/\btry\s*\{/.test(line) || (line.includes('try') && i + 1 < lines.length && lines[i + 1].trim() === '{')) {
      const tryStartIndex = i;
      let depth = 0;
      let foundTryBrace = false;
      let tryEndIndex = i;
      let hasSkipAutoRecovery = false;

      // Parse the try block
      for (let j = tryStartIndex; j < lines.length; j++) {
        const currentLine = lines[j];

        // Check for skipAutoRecovery in try block
        if (SKIP_AUTO_RECOVERY_PATTERN.test(currentLine))
          hasSkipAutoRecovery = true;


        for (const char of currentLine) {
          if (char === '{') {
            depth++;
            foundTryBrace = true;
          } else if (char === '}') {
            depth--;
          }
        }

        // Try block complete
        if (foundTryBrace && depth === 0) {
          tryEndIndex = j;
          break;
        }
      }

      // If try block had skipAutoRecovery, find the corresponding catch
      if (hasSkipAutoRecovery) {
        // Look for catch after the try block
        for (let k = tryEndIndex; k < Math.min(tryEndIndex + 3, lines.length); k++) {
          if (/\bcatch\s*\(/.test(lines[k])) {
            catchLines.add(k + 1); // 1-indexed
            break;
          }
        }
      }

      i = tryEndIndex + 1;
    } else {
      i++;
    }
  }

  return catchLines;
}
