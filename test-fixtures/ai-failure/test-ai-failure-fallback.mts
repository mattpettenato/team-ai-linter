/**
 * P0 regression for bug #2 (deterministic detection silently disabled when the
 * AI call fails). Instantiates the REAL AnthropicService with a dummy key and
 * ANTHROPIC_BASE_URL pointed at a closed localhost port (instant ECONNREFUSED,
 * never an unroutable IP — that's a TCP black hole x SDK retries = hang), then
 * asserts lintTestFile still returns the deterministic findings.
 *
 * Run via: npm run test:ai-failure
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Must be set BEFORE the SDK client is constructed (read in the constructor).
process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:1'

import * as anthropicServiceNs from '../../src/services/anthropicService'
import type { LintIssue } from '../../src/types'

// tsx compiles the imported .ts as CJS; named exports land under `default`
// when imported from this ESM (.mts) context.
const anthropicModule: any = (anthropicServiceNs as any).default ?? anthropicServiceNs
const AnthropicService = anthropicModule.AnthropicService as new (apiKey: string, model: string) => {
  lintTestFile(content: string, filePath: string, rules: string, minConfidence: number): Promise<LintIssue[]>
}

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(here, 'fixture.spec.ts')
const content = readFileSync(fixturePath, 'utf-8')

const service = new AnthropicService('sk-ant-test-dummy-key', 'claude-sonnet-4-6')
const issues: LintIssue[] = await service.lintTestFile(content, fixturePath, '# no rules', 0.5)

const rules = issues.map(i => i.rule).sort()
const expected = ['avoid_nth_selector', 'avoid_waitForTimeout']
const pass =
  expected.every(r => rules.includes(r)) &&
  issues.filter(i => expected.includes(i.rule)).length === 2

if (pass) {
  console.log(`  PASS  ai-failure-fallback: deterministic issues survive AI failure (${rules.join(', ')})`)
  process.exit(0)
}
console.log(`  FAIL  ai-failure-fallback: expected exactly [${expected.join(', ')}], got [${rules.join(', ')}]`)
process.exit(1)
