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
import * as cspell from 'cspell-lib';

// Domain-specific words that should not be flagged as misspelled
const CUSTOM_DICTIONARY = [
  // Checksum/Playwright terms
  'checksum', 'checksumAI', 'checksumapi', 'playwright', 'locator', 'locators',
  'webkit', 'chromium', 'firefox', 'browsercontext', 'webview',
  // Test terms
  'beforeall', 'afterall', 'beforeeach', 'aftereach', 'testinfo',
  'tobevisible', 'tobehidden', 'tobeenabled', 'tobedisabled', 'tobechecked',
  'tohavetext', 'tohavevalue', 'tohavecount', 'tocontaintext', 'tohaveattribute',
  'tohaveclass', 'tohavetitle', 'tohaveurl', 'tobefocused', 'tobeattached',
  'tobeempty', 'tobetruthy', 'tobefalsy', 'tobedefined', 'tobeundefined',
  'tobenull', 'tobenan', 'tobegreaterthan', 'tobelessthan', 'toequal',
  'tomatchobject', 'tohaveproperty', 'tohavebeencalled', 'tohavebeencalledwith',
  // Common tech terms
  'api', 'apis', 'url', 'urls', 'uri', 'uris', 'http', 'https', 'json', 'xml',
  'html', 'css', 'dom', 'iframe', 'iframes', 'dropdown', 'dropdowns', 'checkbox',
  'checkboxes', 'popup', 'popups', 'tooltip', 'tooltips', 'navbar', 'sidebar',
  'async', 'await', 'params', 'args', 'config', 'configs', 'util', 'utils',
  'init', 'auth', 'oauth', 'signin', 'signup', 'login', 'logout', 'autofill',
  'timestamp', 'timestamps', 'datetime', 'timezone', 'timezones',
  'frontend', 'backend', 'fullstack', 'devops', 'localhost', 'env', 'envs',
  'repo', 'repos', 'pr', 'prs', 'ci', 'cd', 'npm', 'npx', 'cli',
  'refetch', 'prefetch', 'debounce', 'debounced', 'throttle', 'throttled',
  'stringify', 'serializable', 'deserialize', 'middleware', 'webhooks',
  // UI terms
  'btn', 'btns', 'cta', 'nav', 'subnav', 'ui', 'ux', 'svg', 'png', 'jpg', 'gif',
  'rgba', 'rgb', 'hsl', 'hex', 'px', 'em', 'rem', 'vw', 'vh',
  // Variable naming conventions
  'idx', 'cnt', 'len', 'num', 'str', 'arr', 'obj', 'fn', 'cb', 'ctx', 'req', 'res',
  'src', 'dst', 'tmp', 'prev', 'curr', 'noop',
  // Common abbreviations in tests
  'e2e', 'qa', 'uat', 'prod', 'dev', 'stg', 'preprod',
  // Other common terms
  'todo', 'todos', 'fixme', 'xxx', 'hacky', 'workaround', 'workarounds',
  'uncheck', 'unchecked', 'recheck', 'unhover', 'unfocus', 'unselect',
  'multiselect', 'readonly', 'editable', 'clickable', 'draggable', 'scrollable',
  'resizable', 'toggleable', 'expandable', 'collapsible', 'dismissable',
  'focusable', 'hoverable', 'selectable', 'sortable', 'filterable', 'searchable',
  'paginated', 'paginate', 'pagination',
  // Common product/company terms (add your own)
  'jira', 'asana', 'trello', 'slack', 'github', 'gitlab', 'bitbucket',
  'vercel', 'netlify', 'heroku', 'aws', 'gcp', 'azure',
  'mongodb', 'postgres', 'postgresql', 'mysql', 'redis', 'elasticsearch',
  'graphql', 'restful', 'grpc', 'websocket', 'websockets',
  'kubernetes', 'docker', 'dockerfile', 'nginx', 'apache',
  // Additional Checksum-specific terms
  'variablestore', 'variablesstore', 'testdata', 'pageobject', 'pageobjects',
  'datafactory', 'testfixture', 'testfixtures', 'specfile', 'specfiles',
];

// Convert custom dictionary to a Set for O(1) lookup
const CUSTOM_DICTIONARY_SET = new Set(CUSTOM_DICTIONARY.map(w => w.toLowerCase()));

export interface SpellCheckIssue {
  line: number;
  word: string;
  suggestions: string[];
  context: string;
}

let cspellSettings: cspell.CSpellSettings | null = null;
let isInitialized = false;
let dictionariesWorking = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the spell checker settings and verify dictionaries are loaded
 */
async function initializeSpellChecker(): Promise<void> {
  if (isInitialized) return;

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    try {
      // Get default settings which includes dictionaries config
      const defaultSettings = await cspell.getDefaultSettings();

      // Merge settings to include English dictionary and custom words
      cspellSettings = cspell.mergeSettings(defaultSettings, {
        words: CUSTOM_DICTIONARY,
        language: 'en',
      });

      // Verify that English dictionaries are actually loaded by checking common words
      // If these common words are flagged as misspelled, dictionaries aren't working
      const testWords = ['hello', 'world', 'test', 'click', 'verify', 'user'];
      let passedTests = 0;

      for (const testWord of testWords) {
        try {
          const result = await cspell.spellCheckDocument(
            { uri: 'test.txt', text: testWord, languageId: 'plaintext' },
            { generateSuggestions: false, noConfigSearch: true },
            cspellSettings
          );
          if (result.issues.length === 0) {
            passedTests++;
          }
        } catch {
          // Ignore individual test failures
        }
      }

      // If less than half the common words pass, dictionaries aren't working
      dictionariesWorking = passedTests >= testWords.length / 2;

      if (!dictionariesWorking) {
        console.warn('[SpellChecker] English dictionaries not loaded properly. Spell checking disabled.');
      }

      isInitialized = true;
    } catch (error) {
      console.warn('[SpellChecker] Failed to initialize:', error);
      dictionariesWorking = false;
      isInitialized = true; // Mark as initialized to prevent repeated attempts
    }
  })();

  await initializationPromise;
}

/**
 * Check if a word is in the custom dictionary
 */
function isInCustomDictionary(word: string): boolean {
  return CUSTOM_DICTIONARY_SET.has(word.toLowerCase());
}

/**
 * Check if a word should be skipped (numbers, short words, constants)
 */
function shouldSkipWord(word: string): boolean {
  if (word.length < 3) return true;
  if (/^\d+$/.test(word)) return true;
  if (/^[A-Z_]+$/.test(word)) return true; // All caps constants
  return false;
}

/**
 * Extract words from text for spell checking
 */
function extractWords(text: string): string[] {
  const words: string[] = [];

  // First, split camelCase into separate words
  const camelCaseSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Then split on non-word characters and underscores
  const rawWords = camelCaseSplit.split(/[^a-zA-Z]+/);

  for (const word of rawWords) {
    if (word.length >= 3) {
      words.push(word.toLowerCase());
    }
  }

  return words;
}

interface TextToCheck {
  text: string;
  lineNum: number;
  context: string;
}

/**
 * Spell check test names and descriptions in a file
 */
export async function spellCheckFile(content: string): Promise<SpellCheckIssue[]> {
  await initializeSpellChecker();

  // Skip spell checking if dictionaries aren't loaded properly
  if (!cspellSettings || !dictionariesWorking) return [];

  const issues: SpellCheckIssue[] = [];
  const lines = content.split('\n');
  const textsToCheck: TextToCheck[] = [];
  const checkedWords = new Set<string>();

  // Collect all texts that need spell checking
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check test descriptions: test('description', ...)
    const testMatch = line.match(/test\s*\(\s*(['"`])(.+?)\1/);
    if (testMatch) {
      textsToCheck.push({ text: testMatch[2], lineNum, context: 'test description' });
    }

    // Check test.describe: test.describe('description', ...)
    const describeMatch = line.match(/test\.describe\s*\(\s*(['"`])(.+?)\1/);
    if (describeMatch) {
      textsToCheck.push({ text: describeMatch[2], lineNum, context: 'describe block' });
    }

    // Check checksumAI descriptions: checksumAI('description', ...)
    const checksumMatch = line.match(/checksumAI\s*\(\s*(['"`])(.+?)\1/);
    if (checksumMatch) {
      textsToCheck.push({ text: checksumMatch[2], lineNum, context: 'checksumAI description' });
    }

    // Check test.step descriptions: test.step('description', ...)
    const stepMatch = line.match(/test\.step\s*\(\s*(['"`])(.+?)\1/);
    if (stepMatch) {
      textsToCheck.push({ text: stepMatch[2], lineNum, context: 'test step' });
    }

    // Check bug annotation descriptions
    const bugDescMatch = line.match(/description\s*:\s*(['"`])(.+?)\1/);
    if (bugDescMatch) {
      textsToCheck.push({ text: bugDescMatch[2], lineNum, context: 'annotation description' });
    }

    // Check comments (single line)
    const commentMatch = line.match(/\/\/\s*(.+)$/);
    if (commentMatch) {
      const comment = commentMatch[1];
      // Skip TODO/FIXME/NOTE markers and URLs
      if (!/^(TODO|FIXME|NOTE|XXX|HACK):/i.test(comment) && !comment.includes('http')) {
        textsToCheck.push({ text: comment, lineNum, context: 'comment' });
      }
    }
  }

  // Use cspell's spellCheckDocument for proper dictionary support
  for (const { text, lineNum, context } of textsToCheck) {
    const words = extractWords(text);

    for (const word of words) {
      // Skip if already checked
      if (checkedWords.has(word)) continue;
      checkedWords.add(word);

      // Skip short words, numbers, constants
      if (shouldSkipWord(word)) continue;

      // Check custom dictionary first
      if (isInCustomDictionary(word)) continue;

      // Use cspell to validate the word
      try {
        const result = await cspell.spellCheckDocument(
          { uri: 'check.txt', text: word, languageId: 'plaintext' },
          { generateSuggestions: true, noConfigSearch: true },
          cspellSettings
        );

        const wordIssues = result.issues;
        if (wordIssues.length > 0) {
          const rawSuggestions = wordIssues[0].suggestions || [];
          const suggestions = rawSuggestions.map((s: unknown) =>
            typeof s === 'string' ? s : (s as { word: string }).word
          ).slice(0, 3);

          issues.push({
            line: lineNum,
            word,
            suggestions,
            context,
          });
        }
      } catch {
        // If spell check fails, skip this word
      }
    }
  }

  return issues;
}
