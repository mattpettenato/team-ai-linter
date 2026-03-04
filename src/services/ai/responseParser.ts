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

import Anthropic from '@anthropic-ai/sdk';
import { LintIssue, normalizeSeverity } from '../../types';

/**
 * Parse the API response into LintIssue objects
 */
export function parseResponse(response: Anthropic.Message): LintIssue[] {
  // Extract text content from the response
  const textContent = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
  );

  if (!textContent) {
    console.warn('No text content in Claude response');
    return [];
  }

  const text = textContent.text.trim();

  try {
    // Try to parse the response as JSON
    // Strategy 1: Try to extract JSON from markdown code blocks if present
    let jsonText = text;

    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
      console.log('[ResponseParser] Extracted JSON from markdown code block');
    } else {
      // Strategy 2: Look for a JSON array pattern [...]
      // Claude sometimes returns explanatory text followed by the JSON array
      const arrayMatch = text.match(/(\[[\s\S]*\])\s*$/);
      if (arrayMatch) {
        jsonText = arrayMatch[1].trim();
        console.log('[ResponseParser] Extracted JSON array from end of response');
      } else {
        // Strategy 3: Try to find any JSON array in the text
        const anyArrayMatch = text.match(/\[[\s\S]*\]/);
        if (anyArrayMatch) {
          jsonText = anyArrayMatch[0].trim();
          console.log('[ResponseParser] Extracted JSON array from response body');
        }
      }
    }

    console.log('[ResponseParser] Attempting to parse JSON:', jsonText.substring(0, 100) + '...');
    const issues = JSON.parse(jsonText);

    if (!Array.isArray(issues)) {
      console.warn('Claude response is not an array');
      return [];
    }

    console.log(`[ResponseParser] Successfully parsed ${issues.length} issues from Claude response`);

    // Validate and transform each issue
    return issues
        .filter(isValidIssue)
        .filter(isNotFalsePositive)
        .map((issue: any) => ({
          line: Number(issue.line),
          message: String(issue.message),
          severity: normalizeSeverity(issue.severity),
          rule: String(issue.rule || 'unknown'),
          confidence: typeof issue.confidence === 'number' ? issue.confidence : undefined,
          column: issue.column ? Number(issue.column) : undefined,
          endLine: issue.endLine ? Number(issue.endLine) : undefined,
          endColumn: issue.endColumn ? Number(issue.endColumn) : undefined,
        }));
  } catch (error) {
    console.error('[ResponseParser] Failed to parse Claude response as JSON:', error);
    console.error('[ResponseParser] Raw response:', text);
    return [];
  }
}

/**
 * Validate that an issue object has required fields
 */
export function isValidIssue(issue: any): boolean {
  return (
    typeof issue === 'object' &&
    issue !== null &&
    typeof issue.line === 'number' &&
    typeof issue.message === 'string' &&
    issue.line > 0
  );
}

/**
 * Filter out known false positive patterns that the AI incorrectly flags
 */
export function isNotFalsePositive(issue: any): boolean {
  const message = String(issue.message || '').toLowerCase();
  const originalMessage = String(issue.message || '');
  const rule = String(issue.rule || '').toLowerCase();

  // Filter out unused parameter warnings where parameter already starts with underscore
  // Parameters prefixed with _ are intentionally unused by convention
  if (rule.includes('unused_parameter') || rule.includes('unused-parameter')) {
    // Extract parameter name from message - usually in quotes like '_expect' or `_expect`
    const paramMatch = originalMessage.match(/['"`](_\w+)['"`]/);
    if (paramMatch && paramMatch[1].startsWith('_'))
      return false;

  }

  // Filter out variable assignment warnings - these are not actually problems
  if (
    message.includes('variable assignment') ||
    message.includes('variable assignments') ||
    (rule.includes('checksumai') && message.includes('assignment')) ||
    (rule.includes('checksum') && rule.includes('wrapper'))
  )
    return false;


  // Filter out "action not wrapped in checksumAI" - AI often gets this wrong
  // Utility functions that receive checksumAI as parameter handle wrapping internally
  if (
    message.includes('not wrapped') ||
    message.includes('must be wrapped') ||
    message.includes('should be wrapped') ||
    rule.includes('actions_must_be_wrapped') ||
    rule.includes('unwrapped')
  )
    return false;


  // Filter out login() false positives - login() SHOULD be wrapped in checksumAI
  // This is a common AI hallucination that login shouldn't be wrapped
  if (
    (message.includes('login') && message.includes('should not')) ||
    (message.includes('login') && message.includes('shouldn\'t')) ||
    (message.includes('login') && rule.includes('incorrect')) ||
    (rule.includes('incorrect_checksumai_usage') && message.includes('login'))
  )
    return false;


  // Filter out commented code block detection from AI - handled by deterministic patterns
  // AI is unreliable at detecting line numbers for commented code
  if (
    rule.includes('commented_code') ||
    (message.includes('commented') && message.includes('code'))
  )
    return false;


  // Filter out "let vs const" for init() destructuring - using "let" is the correct pattern
  // AI sometimes suggests changing to const despite explicit instructions not to
  if (
    rule.includes('prefer_const') ||
    (message.includes('const') && message.includes('destructuring') && message.includes('init'))
  )
    return false;


  return true;
}
