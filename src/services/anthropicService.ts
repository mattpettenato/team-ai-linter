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
import { LintIssue } from '../types';
import { SYSTEM_PROMPT } from './ai/prompts';
import { parseResponse } from './ai/responseParser';
import { correctLineNumbers } from './detection/lineCorrector';
import { detectDeterministicPatterns, mergeAndDeduplicateIssues } from './detection/deterministicDetector';

/**
 * Service for interacting with Claude API for AI linting
 */
export class AnthropicService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Analyze a test file against the provided rules
   */
  async lintTestFile(
    fileContent: string,
    filePath: string,
    rules: string,
    minConfidence: number = 0.5
  ): Promise<LintIssue[]> {
    console.log(`[AnthropicService] lintTestFile called for: ${filePath}`);
    console.log(`[AnthropicService] File content length: ${fileContent.length} bytes`);

    try {
      // Use structured content blocks with cache_control for optimal caching
      // System prompt and rules are cached (5 min TTL), file content is dynamic
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          } as Anthropic.TextBlockParam,
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `## Rules to Check Against\n\n${rules}`,
                cache_control: { type: 'ephemeral' },
              } as Anthropic.TextBlockParam,
              {
                type: 'text',
                text: `## Test File: ${filePath}\n\n\`\`\`typescript\n${fileContent}\n\`\`\`\n\nAnalyze this test file against the rules above. Return a JSON array of issues found. If no issues are found, return an empty array [].`,
              },
            ],
          },
        ],
      });

      // Log cache performance for monitoring
      this.logCacheStats(response);

      const issues = parseResponse(response);
      console.log(`[AnthropicService] AI returned ${issues.length} issues`);

      // Filter by confidence threshold
      const confidentIssues = issues.filter(
          issue => issue.confidence === undefined || issue.confidence >= minConfidence
      );
      console.log(`[AnthropicService] After confidence filter: ${confidentIssues.length} issues`);

      // Post-process to correct line numbers for known patterns
      const correctedIssues = correctLineNumbers(confidentIssues, fileContent);
      console.log(`[AnthropicService] After line number correction: ${correctedIssues.length} issues`);

      // Add deterministic pattern detection for simple patterns the AI might miss
      const deterministicIssues = await detectDeterministicPatterns(fileContent, filePath);
      console.log(`[AnthropicService] Deterministic detection found ${deterministicIssues.length} issues`);
      if (deterministicIssues.length > 0)
        console.log(`[AnthropicService] Deterministic issues:`, deterministicIssues.map(i => `Line ${i.line}: [${i.rule}] ${i.message}`));


      // Merge and deduplicate
      const finalIssues = mergeAndDeduplicateIssues(correctedIssues, deterministicIssues);
      console.log(`[AnthropicService] Final merged result: ${finalIssues.length} issues`);

      return finalIssues;
    } catch (error) {
      console.error('[AnthropicService] Failed to lint with Claude:', error);
      throw error;
    }
  }

  /**
   * Update the model being used
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Log cache performance statistics
   */
  private logCacheStats(response: Anthropic.Message): void {
    if (response.usage) {
      const usage = response.usage as {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
        console.log(
            `Cache stats: ${usage.cache_read_input_tokens || 0} tokens read from cache, ` +
          `${usage.cache_creation_input_tokens || 0} tokens cached`
        );
      }
    }
  }
}
