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

/**
 * Parse a .env file and return key-value pairs
 */
export function loadEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath))
    throw new Error(`Environment file not found: ${envPath}`);


  const content = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#'))
      continue;


    // Parse key=value
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1)
      continue;


    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);


    env[key] = value;
  }

  return env;
}

/**
 * Get the Anthropic API key from the specified .env file
 */
export function getAnthropicApiKey(envPath: string): string | null {
  try {
    const env = loadEnvFile(envPath);
    return env['ANTHROPIC_API_KEY'] || null;
  } catch (error) {
    console.error('Failed to load .env file:', error);
    return null;
  }
}

/**
 * Validate that the .env file contains the required API key
 */
export function validateEnvFile(envPath: string): { valid: boolean; error?: string } {
  try {
    const env = loadEnvFile(envPath);

    if (!env['ANTHROPIC_API_KEY']) {
      return {
        valid: false,
        error: 'ANTHROPIC_API_KEY not found in .env file'
      };
    }

    if (env['ANTHROPIC_API_KEY'].length < 10) {
      return {
        valid: false,
        error: 'ANTHROPIC_API_KEY appears to be invalid (too short)'
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error reading .env file'
    };
  }
}
