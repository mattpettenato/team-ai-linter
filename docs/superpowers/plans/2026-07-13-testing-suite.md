# PE-271 Testing Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI-enforced test suite (unit fixtures + model guard + E2E) that blocks PRs and releases, per `docs/superpowers/specs/2026-07-08-testing-suite-design.md`.

**Architecture:** Three layers. (1) Hermetic tsx fixture suites under `test-fixtures/` reusing the existing mock-vscode loader pattern, aggregated by `npm test`. (2) A live model guard probing `GET /v1/models/{id}` per configured id, CI-only. (3) The existing `@vscode/test-electron` E2E harness reworked to run fully offline (dummy key + `ANTHROPIC_BASE_URL` → refused port). A reusable `test.yml` workflow gates PRs and releases.

**Tech Stack:** tsx, mock-vscode CJS stubs, `@vscode/test-electron` + mocha, GitHub Actions, Anthropic `/v1/models/{id}` REST.

## Global Constraints

- No semicolons at statement ends (project convention); Apache 2.0 header on `src/` files (not required in `test-fixtures/`).
- `npm test` must be hermetic: no network, no API key, no secrets.
- The live guard is NEVER part of `npm test`; it is `npm run test:model-guard`, CI-invoked.
- E2E never makes live AI calls.
- Fixture suites exit non-zero on failure and print per-case PASS/FAIL lines (existing convention).
- CI runners: `ubuntu-24.04` (never `ubuntu-latest`).
- Existing coverage already satisfies spec §1 for AST + deterministic core (`test:regression`) and `.checksum.md` rules (`test:smoke`) — do NOT duplicate those suites.

## Existing interfaces the tasks rely on (verified against source)

- `AnthropicService` (`src/services/anthropicService.ts`): `constructor(apiKey: string, model?: string)`; `lintTestFile(fileContent, filePath, rules, minConfidence?): Promise<LintIssue[]>` — runs `detectDeterministicPatterns` first, wraps the AI call in try/catch, returns deterministic-only on failure (the bug-#2 fix under test). SDK client built as `new Anthropic({ apiKey })` — reads `ANTHROPIC_BASE_URL` from env.
- `GitSafetyChecker` (`src/services/git/gitSafetyChecker.ts`): `constructor(workspaceRoot: string)`; `checkImports(fileContent, filePath): Promise<GitIssue[]>`.
- `spellCheckFile(content: string): Promise<SpellCheckIssue[]>` (`src/services/detection/spellChecker.ts`); statically imports ESM-only `cspell-lib` (works under Node ≥20.19 `require(esm)`; local Node 23 and CI Node 22 both fine).
- Loader pattern: `tsx --import ./test-fixtures/<dir>/register-loader.mjs ./test-fixtures/<dir>/test-*.mts` with `mock-vscode.cjs` (see `test-fixtures/regression/`).
- E2E harness: `src/test/runTest.ts` builds a temp git workspace, launches VS Code via `runTests({extensionDevelopmentPath, extensionTestsPath, launchArgs})`; suites live in `src/test/suite/*.e2e.test.ts` (mocha `suite`/`test`).
- `package.json` config: `teamAiLinter.model` default `claude-sonnet-4-6` + `enum` list under `contributes.configuration`.

---

### Task 1: Static model check + `npm test` aggregator

**Files:**
- Create: `test-fixtures/model-guard/check-static.mjs`
- Modify: `package.json` (scripts only)

**Interfaces:**
- Produces: `npm test` (hermetic aggregate), `npm run test:model-static`. Task 7 (CI) calls `npm test`; Task 8 documents it.

- [ ] **Step 1: Write the static check (it doubles as its own failing/passing test — it validates the real package.json)**

```javascript
// test-fixtures/model-guard/check-static.mjs
// Hermetic guard: the configured default model must be a member of the settings
// enum, the enum must be non-empty, and every id must look like a Claude model
// id. Catches default/enum drift in the diff that introduces it. No network.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf-8'))

const modelCfg = pkg.contributes?.configuration?.properties?.['teamAiLinter.model']
const failures = []

if (!modelCfg) failures.push('teamAiLinter.model missing from contributes.configuration')
const def = modelCfg?.default
const enumIds = modelCfg?.enum ?? []

if (!Array.isArray(enumIds) || enumIds.length === 0) failures.push('model enum is empty')
if (!def) failures.push('model default is empty')
if (def && enumIds.length > 0 && !enumIds.includes(def))
  failures.push(`default "${def}" is not in the enum [${enumIds.join(', ')}]`)

const ID_SHAPE = /^claude-[a-z0-9]+(-[a-z0-9]+)*(-[0-9]{8})?$/
for (const id of [def, ...enumIds].filter(Boolean)) {
  if (!ID_SHAPE.test(id)) failures.push(`id "${id}" does not match Claude id shape ${ID_SHAPE}`)
}

if (failures.length > 0) {
  for (const f of failures) console.log(`  FAIL  static-model-check: ${f}`)
  process.exit(1)
}
console.log(`  PASS  static-model-check: default "${def}" ∈ enum(${enumIds.length}), all ids well-formed`)
```

- [ ] **Step 2: Run it, expect PASS**

Run: `node test-fixtures/model-guard/check-static.mjs`
Expected: `PASS static-model-check: default "claude-sonnet-4-6" ∈ enum(...)`, exit 0.

- [ ] **Step 3: Verify it fails on a bad default**

Run: `node -e "const s=require('fs').readFileSync('package.json','utf8'); require('fs').writeFileSync('package.json', s.replace('\"claude-sonnet-4-6\"','\"claude-bogus-XX\"'))" && node test-fixtures/model-guard/check-static.mjs; git checkout package.json`
Expected: FAIL lines + exit 1, then package.json restored. (`git status` must be clean after.)

- [ ] **Step 4: Rewire scripts in package.json**

Replace the `test:all` entry and add `test`/`test:model-static` (keep every existing `test:*` script unchanged):

```json
"test": "npm run check-types && npm run lint && npm run test:model-static && npm run test:fixtures && npm run test:detector && npm run test:diagnostics && npm run test:regression && npm run test:smoke && npm run test:vsix",
"test:model-static": "node test-fixtures/model-guard/check-static.mjs",
"test:all": "npm test",
```

- [ ] **Step 5: Run the aggregate**

Run: `npm test`
Expected: type-check, eslint, static check, and all six existing fixture suites pass; exit 0. (test:vsix may require a built vsix — if it fails with "no .vsix found", move `test:vsix` OUT of `npm test` and leave it in the release path only; note the decision in the commit message.)

- [ ] **Step 6: Commit**

```bash
git add test-fixtures/model-guard/check-static.mjs package.json
git commit -m "test: add hermetic static model check, make npm test the single aggregator"
```

---

### Task 2: Live model guard (per-id probe)

**Files:**
- Create: `test-fixtures/model-guard/check-models.mjs`
- Modify: `package.json` (one script)

**Interfaces:**
- Consumes: env `ANTHROPIC_API_KEY`, flag `--strict` (or env `MODEL_GUARD_STRICT=1`).
- Produces: `npm run test:model-guard [-- --strict]`. Task 7 wires it into CI.

- [ ] **Step 1: Write the guard**

```javascript
// test-fixtures/model-guard/check-models.mjs
// Live guard: probe GET /v1/models/{id} for the default + every enum id.
// Per-id probe (NOT list-membership): the enum holds alias ids like
// "claude-sonnet-4-6" that the list payload does not return verbatim; the
// retrieve endpoint resolves aliases and needs no pagination.
//
// Exit contract:
//   404 on any id                      -> exit 1  (stale model — the real failure)
//   401/403                            -> exit 1  (bad key — infra, distinct message)
//   network/5xx/429 after 3 attempts   -> exit 1  (infra, distinct message)
//   no key, strict                     -> exit 1
//   no key, not strict                 -> exit 0  + ::warning:: annotation
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const strict = process.argv.includes('--strict') || process.env.MODEL_GUARD_STRICT === '1'
const apiKey = process.env.ANTHROPIC_API_KEY

if (!apiKey) {
  if (strict) {
    console.error('  FAIL  model-guard: ANTHROPIC_API_KEY is empty in strict mode (release/nightly). Configure the repo secret.')
    process.exit(1)
  }
  console.log('::warning title=model-guard skipped::ANTHROPIC_API_KEY not available (fork PR?) — live model validation did not run')
  process.exit(0)
}

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf-8'))
const modelCfg = pkg.contributes.configuration.properties['teamAiLinter.model']
const ids = [...new Set([modelCfg.default, ...(modelCfg.enum ?? [])])].filter(Boolean)

async function probe(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res
    try {
      res = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(id)}`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      })
    } catch (err) {
      if (attempt === 3) return { id, kind: 'infra', detail: `network error: ${err.message}` }
      await new Promise(r => setTimeout(r, attempt * 1000))
      continue
    }
    if (res.status === 200) return { id, kind: 'ok' }
    if (res.status === 404) return { id, kind: 'stale' }
    if (res.status === 401 || res.status === 403) return { id, kind: 'auth', detail: `HTTP ${res.status}` }
    if (attempt === 3) return { id, kind: 'infra', detail: `HTTP ${res.status} after 3 attempts` }
    await new Promise(r => setTimeout(r, attempt * 1000))
  }
}

const results = await Promise.all(ids.map(probe))
let failed = false
for (const r of results) {
  if (r.kind === 'ok') { console.log(`  PASS  model-guard: ${r.id} is live`); continue }
  failed = true
  if (r.kind === 'stale') console.error(`  FAIL  model-guard: ${r.id} returned 404 — STALE MODEL ID. Update the default/enum in package.json.`)
  else if (r.kind === 'auth') console.error(`  FAIL  model-guard: ${r.id} — ${r.detail}. Bad/expired ANTHROPIC_API_KEY (infra, not staleness).`)
  else console.error(`  FAIL  model-guard: ${r.id} — ${r.detail} (infra, not staleness).`)
}
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Add the script to package.json**

```json
"test:model-guard": "node test-fixtures/model-guard/check-models.mjs",
```

- [ ] **Step 3: Test all four paths**

Run each; expected results:

```bash
unset ANTHROPIC_API_KEY; npm run test:model-guard              # exit 0, ::warning:: line
unset ANTHROPIC_API_KEY; npm run test:model-guard -- --strict  # exit 1, "empty in strict mode"
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2) npm run test:model-guard -- --strict   # exit 0, PASS per id (needs the repo .env key; skip if absent locally and verify in CI)
ANTHROPIC_API_KEY=sk-ant-bogus npm run test:model-guard -- --strict  # exit 1, "Bad/expired" message
```

- [ ] **Step 4: Commit**

```bash
git add test-fixtures/model-guard/check-models.mjs package.json
git commit -m "test: add live model guard probing /v1/models/{id} per configured id"
```

---

### Task 3: P0 bug-#2 regression fixture (AI fails → deterministic survives)

**Files:**
- Create: `test-fixtures/ai-failure/test-ai-failure-fallback.mts`
- Create: `test-fixtures/ai-failure/fixture.spec.ts`
- Modify: `package.json` (one script + add to `npm test` chain)

**Interfaces:**
- Consumes: `AnthropicService.lintTestFile` (signature above); regression loader `test-fixtures/regression/register-loader.mjs` (reused as-is — it stubs `vscode` + `cspell-lib`).
- Produces: `npm run test:ai-failure`.

- [ ] **Step 1: Write the fixture file (2 deterministic violations, nothing else)**

```typescript
// test-fixtures/ai-failure/fixture.spec.ts
// Minimal frozen fixture for the AI-failure fallback test: exactly one
// avoid_waitForTimeout (line 5) and one avoid_nth_selector (line 6).
// If you add rules to the detector, do NOT extend this file — its exact
// issue set is asserted by test-ai-failure-fallback.mts.
import { test, expect } from '@playwright/test'

test('demo', async ({ page }) => {
  await page.waitForTimeout(3000)
  await page.locator('.row').nth(2).click()
  await expect(page.getByRole('heading'), 'heading visible').toBeVisible()
})
```

- [ ] **Step 2: Write the failing test**

```typescript
// test-fixtures/ai-failure/test-ai-failure-fallback.mts
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

import { AnthropicService } from '../../src/services/anthropicService'
import type { LintIssue } from '../../src/types'

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
```

- [ ] **Step 3: Run it — verify it exercises the failure path**

Run: `npm run test:ai-failure` (after Step 4 wiring) or directly:
`tsx --import ./test-fixtures/regression/register-loader.mjs ./test-fixtures/ai-failure/test-ai-failure-fallback.mts`
Expected: stderr shows `[AnthropicService] AI lint failed; returning deterministic results only` with an ECONNREFUSED cause, then `PASS ai-failure-fallback`. Total runtime a few seconds (SDK's 2 connection retries). If it hangs >30s, the base URL is wrong.

- [ ] **Step 4: Verify the test CAN fail (temporarily break the fallback)**

Edit `src/services/anthropicService.ts` catch block to `throw error`, rerun — expected: unhandled rejection / FAIL. Revert with `git checkout src/services/anthropicService.ts`.

- [ ] **Step 5: Wire into package.json**

```json
"test:ai-failure": "tsx --import ./test-fixtures/regression/register-loader.mjs ./test-fixtures/ai-failure/test-ai-failure-fallback.mts",
```

And insert `npm run test:ai-failure &&` into the `test` chain after `test:model-static`.

- [ ] **Step 6: Run `npm test`, expect all green. Commit**

```bash
git add test-fixtures/ai-failure package.json
git commit -m "test: P0 regression — deterministic detection survives AI call failure"
```

---

### Task 4: Spell checker fixture suite

**Files:**
- Create: `test-fixtures/spellcheck/register-loader.mjs`
- Create: `test-fixtures/spellcheck/test-spellcheck.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `spellCheckFile(content): Promise<SpellCheckIssue[]>` where `SpellCheckIssue` has at least `{ line: number; word: string }` (confirm exact fields by reading `src/services/detection/spellChecker.ts:80` before asserting).
- Produces: `npm run test:spellcheck`.

- [ ] **Step 1: Write a loader that mocks ONLY vscode (real cspell-lib)**

```javascript
// test-fixtures/spellcheck/register-loader.mjs
// Unlike ../regression/register-loader.mjs this does NOT stub cspell-lib —
// the real spell checker is the unit under test. Requires Node >= 20.19
// (require(esm) support) for cspell-lib's ESM entry under tsx's CJS transform.
import { register, createRequire } from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

register(new URL('../regression/vscode-loader.mjs', import.meta.url))

const require = createRequire(import.meta.url)
const Module = require('node:module')
const here = path.dirname(url.fileURLToPath(import.meta.url))
const MOCK_VSCODE = path.resolve(here, '../regression/mock-vscode.cjs')

const originalResolve = Module._resolveFilename
Module._resolveFilename = function patched(request, parent, ...rest) {
  if (request === 'vscode') return MOCK_VSCODE
  return originalResolve.call(this, request, parent, ...rest)
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// test-fixtures/spellcheck/test-spellcheck.mts
/** Positive + negative cases for the real cspell-backed spell checker. */
import * as spellNs from '../../src/services/detection/spellChecker'

type SpellModule = { spellCheckFile: (content: string) => Promise<Array<{ line: number; word: string }>> }
const { spellCheckFile }: SpellModule =
  (spellNs as unknown as { default?: SpellModule }).default ?? (spellNs as unknown as SpellModule)

let failed = 0
function record(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`)
  if (!pass) failed++
}

// Positive: an unambiguous misspelling in a test title must be flagged.
{
  const issues = await spellCheckFile(`test('user can naviagte to dashbaord', async () => {})\n`)
  const words = issues.map(i => i.word.toLowerCase())
  record('spellcheck: flags "naviagte"', words.includes('naviagte'), `words=${JSON.stringify(words)}`)
  record('spellcheck: flags "dashbaord"', words.includes('dashbaord'), `words=${JSON.stringify(words)}`)
}

// Negative: clean content plus domain terms must stay silent.
{
  const issues = await spellCheckFile(`test('user can navigate to dashboard', async () => {\n  await checksumAI('click login')\n})\n`)
  record('spellcheck: silent on clean content', issues.length === 0, `issues=${JSON.stringify(issues)}`)
}

process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 3: Run, adjust to reality**

Run: `tsx --import ./test-fixtures/spellcheck/register-loader.mjs ./test-fixtures/spellcheck/test-spellcheck.mts`
Two legitimate adjustments allowed: (a) if `SpellCheckIssue`'s field is named differently than `word`, match the real interface; (b) if `checksumAI` is flagged as a spelling error, that's a REAL finding — add it to the negative-case expectation as a known issue or fix the checker's dictionary, don't paper over it. If the suite dies with `ERR_REQUIRE_ESM`, the Node version is <20.19 — document Node ≥22 in Task 8 and pin CI Node to 22 in Task 7.

- [ ] **Step 4: Wire into package.json + `npm test` chain**

```json
"test:spellcheck": "tsx --import ./test-fixtures/spellcheck/register-loader.mjs ./test-fixtures/spellcheck/test-spellcheck.mts",
```

- [ ] **Step 5: Run `npm test`, commit**

```bash
git add test-fixtures/spellcheck package.json
git commit -m "test: spell checker fixture suite with real cspell-lib"
```

---

### Task 5: Git safety checker fixture suite

**Files:**
- Create: `test-fixtures/git-safety/test-git-safety.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `new GitSafetyChecker(workspaceRoot).checkImports(fileContent, filePath): Promise<GitIssue[]>`. `GitIssue` has at least `{ type: string; message: string }` (confirm exact discriminants in `src/types/lint-result.ts` before asserting).
- Produces: `npm run test:git-safety`.

- [ ] **Step 1: Write the failing test**

```typescript
// test-fixtures/git-safety/test-git-safety.mts
/**
 * Hermetic git-safety fixtures. Builds throwaway git repos in tmp dirs — each
 * sets local user.name/user.email before committing (CI runners have no global
 * git identity; git commit hard-fails without it).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { GitSafetyChecker } from '../../src/services/git/gitSafetyChecker'

function sh(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' })
}

function buildRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'tal-gitsafety-'))
  sh(root, 'init', '-q')
  sh(root, 'config', 'user.email', 'fixtures@test.local')
  sh(root, 'config', 'user.name', 'Fixture Bot')
  return root
}

function write(root: string, rel: string, content: string) {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}

let failed = 0
function record(name: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`)
  if (!pass) failed++
}

// Case 1 (negative): test imports a committed helper -> no issues.
{
  const root = buildRepo()
  write(root, 'helpers/util.ts', 'export const x = 1\n')
  write(root, 'tests/a.spec.ts', "import { x } from '../helpers/util'\n")
  sh(root, 'add', '-A')
  sh(root, 'commit', '-q', '-m', 'all committed')

  const checker = new GitSafetyChecker(root)
  const issues = await checker.checkImports("import { x } from '../helpers/util'\n", join(root, 'tests/a.spec.ts'))
  record('git-safety: committed import is clean', issues.length === 0, JSON.stringify(issues))
  rmSync(root, { recursive: true, force: true })
}

// Case 2 (positive): test imports an UNTRACKED helper -> flagged.
{
  const root = buildRepo()
  write(root, 'tests/a.spec.ts', "import { y } from '../helpers/untracked'\n")
  sh(root, 'add', '-A')
  sh(root, 'commit', '-q', '-m', 'spec only')
  write(root, 'helpers/untracked.ts', 'export const y = 2\n') // never committed

  const checker = new GitSafetyChecker(root)
  const issues = await checker.checkImports("import { y } from '../helpers/untracked'\n", join(root, 'tests/a.spec.ts'))
  record('git-safety: untracked import is flagged', issues.length > 0, 'expected >= 1 issue, got 0')
  rmSync(root, { recursive: true, force: true })
}

// Case 3 (positive): committed but with uncommitted modifications -> flagged.
{
  const root = buildRepo()
  write(root, 'helpers/util.ts', 'export const x = 1\n')
  write(root, 'tests/a.spec.ts', "import { x } from '../helpers/util'\n")
  sh(root, 'add', '-A')
  sh(root, 'commit', '-q', '-m', 'baseline')
  write(root, 'helpers/util.ts', 'export const x = 999 // dirty\n')

  const checker = new GitSafetyChecker(root)
  const issues = await checker.checkImports("import { x } from '../helpers/util'\n", join(root, 'tests/a.spec.ts'))
  record('git-safety: dirty import is flagged', issues.length > 0, 'expected >= 1 issue, got 0')
  rmSync(root, { recursive: true, force: true })
}

process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: Run it**

Run: `tsx --import ./test-fixtures/regression/register-loader.mjs ./test-fixtures/git-safety/test-git-safety.mts`
Expected: 3 PASS. If a case fails, read `gitSafetyChecker.ts` to learn the actual issue taxonomy (it may only flag some of these shapes) — adjust the assertion to the real contract and note it in the test comment; do NOT delete a failing positive case without understanding why.

- [ ] **Step 3: Wire into package.json (`test:git-safety`) + `npm test` chain, run `npm test`, commit**

```bash
git add test-fixtures/git-safety package.json
git commit -m "test: git safety checker fixtures with hermetic temp repos"
```

---

### Task 6: E2E offline rework + diagnostics contract suite

**Files:**
- Modify: `src/test/runTest.ts`
- Create: `src/test/suite/diagnostics.e2e.test.ts`

**Interfaces:**
- Consumes: existing harness + `mdTitle.e2e.test.ts` (untouched — its asserted rules are all deterministic and survive AI failure).
- Produces: `npm run test:e2e` that needs NO real API key and makes NO live AI calls.

- [ ] **Step 1: Rework runTest.ts to run offline**

In `src/test/runTest.ts`:

1. Delete the top-level `const apiKey = process.env.ANTHROPIC_API_KEY` and the `if (!apiKey) { ... exit(1) }` block in `main()` (and the stale doc-comment paragraph saying a real key is required — the deterministic layer no longer depends on AI success).
2. In `buildWorkspace()`, replace the `.env` write with a dummy key (envLoader validates ≥10 chars):

```typescript
  // envLoader reads the key from this file (not process.env) and requires
  // >= 10 chars. The value is fake: the AI call is pointed at a refused port.
  write(root, '.env', 'ANTHROPIC_API_KEY=sk-ant-test-dummy-key\n');
```

3. In `main()`, pass the refused-port base URL into the extension host:

```typescript
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspace, '--disable-extensions'],
      // Closed localhost port -> instant ECONNREFUSED in the SDK. Read by the
      // Anthropic client constructor inside the extension host process.
      extensionTestsEnv: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1' },
    });
```

- [ ] **Step 2: Write the diagnostics-contract suite**

```typescript
// src/test/suite/diagnostics.e2e.test.ts
import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

/**
 * Diagnostics contract: after teamAiLinter.runAll (which mdTitle.e2e.test.ts
 * has already executed against this workspace), published diagnostics must
 * carry the right source, severity mapping, and sane ranges — and the run must
 * have produced deterministic results DESPITE the AI layer failing (the
 * harness points ANTHROPIC_BASE_URL at a refused port: bug-#2 integration copy).
 */
suite('diagnostics contract (E2E, AI offline)', () => {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath
  const targetUri = vscode.Uri.file(path.join(root, 'checksum/tests/target.spec.ts'))

  test('deterministic diagnostics exist even though the AI call failed', () => {
    const diags = vscode.languages.getDiagnostics(targetUri)
    assert.ok(diags.length > 0, 'expected deterministic diagnostics with AI unreachable — bug #2 regressed')
  })

  test('spec-mismatch is an Error, filename/orphan are Warnings', () => {
    const diags = vscode.languages.getDiagnostics(targetUri)
    const bySev = (code: string) => diags.find(d => String(d.code) === code)?.severity
    assert.strictEqual(bySev('checksum_md_title_spec_mismatch'), vscode.DiagnosticSeverity.Error)
    assert.strictEqual(bySev('checksum_md_title_filename_mismatch'), vscode.DiagnosticSeverity.Warning)
    assert.strictEqual(bySev('checksum_md_orphaned_story'), vscode.DiagnosticSeverity.Warning)
  })

  test('every diagnostic has a non-negative in-file range', () => {
    const content = require('fs').readFileSync(targetUri.fsPath, 'utf-8') as string
    const lineCount = content.split('\n').length
    for (const d of vscode.languages.getDiagnostics(targetUri)) {
      assert.ok(d.range.start.line >= 0 && d.range.start.line < lineCount,
        `diagnostic "${d.code}" has out-of-file line ${d.range.start.line}`)
    }
  })
})
```

Note: mocha runs suite files alphabetically via the glob in `src/test/suite/index.ts` — `diagnostics` sorts before `mdTitle`, so this suite would run BEFORE `runAll` executes. Fix deterministically: name the mdTitle execution order explicit by having this suite run `teamAiLinter.runAll` itself if no diagnostics exist yet:

```typescript
  suiteSetup(async function () {
    this.timeout(120_000)
    if (vscode.languages.getDiagnostics(targetUri).length === 0) {
      const doc = await vscode.workspace.openTextDocument(targetUri)
      await vscode.window.showTextDocument(doc)
      await vscode.commands.executeCommand('teamAiLinter.runAll')
      for (let i = 0; i < 40 && vscode.languages.getDiagnostics(targetUri).length === 0; i++) {
        await new Promise(r => setTimeout(r, 250))
      }
    }
  })
```

- [ ] **Step 3: Run E2E locally with NO key in the environment**

Run: `unset ANTHROPIC_API_KEY && npm run test:e2e`
Expected: both suites pass (mdTitle 6 tests + diagnostics 3 tests); harness log shows the AI-failure path (`AI lint failed`) — proving offline operation. If mdTitle fails only on `unwrapped_action` or AI-dependent codes, read the failure: every asserted code in mdTitle is deterministic, so a failure is a real regression, not an offline artifact.

- [ ] **Step 4: Commit**

```bash
git add src/test/runTest.ts src/test/suite/diagnostics.e2e.test.ts
git commit -m "test(e2e): run fully offline (dummy key + refused-port base URL), add diagnostics contract suite"
```

---

### Task 7: CI — test.yml + release gate

**Files:**
- Create: `.github/workflows/test.yml`
- Modify: `.github/workflows/release-extension.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run test:model-guard -- --strict`, `npm run test:e2e` (all from prior tasks).
- Produces: reusable workflow `test.yml` with `model_guard_strict` input; release blocked on `unit` + `model-guard`.

- [ ] **Step 1: Write test.yml**

```yaml
name: Test

on:
  pull_request:
  schedule:
    - cron: '0 6 * * *'   # nightly live model guard on main
  workflow_call:
    inputs:
      model_guard_strict:
        type: boolean
        default: false
    secrets:
      ANTHROPIC_API_KEY:
        required: false

jobs:
  unit:
    # Hermetic gate: types, lint, static model check, all fixture suites.
    if: github.event_name != 'schedule'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test

  model-guard:
    # Live per-id probe. Strict on release calls and nightly; warn-and-skip on
    # secretless fork PRs. GHA injects "" for missing secrets and never fails
    # by itself — the strict empty-key failure lives in the script (--strict).
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      issues: write
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      MODEL_GUARD_STRICT: ${{ (inputs.model_guard_strict || github.event_name == 'schedule') && '1' || '0' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm run test:model-guard
      - name: Alert on nightly failure
        if: failure() && github.event_name == 'schedule'
        uses: actions/github-script@v7
        with:
          script: |
            const title = 'Nightly model guard failed — configured Claude model may be stale'
            const { data: open } = await github.rest.issues.listForRepo({
              owner: context.repo.owner, repo: context.repo.repo, state: 'open', labels: 'model-guard' })
            const body = `Run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
            if (open.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner, repo: context.repo.repo, issue_number: open[0].number, body })
            } else {
              await github.rest.issues.create({
                owner: context.repo.owner, repo: context.repo.repo, title, body, labels: ['model-guard'] })
            }

  e2e:
    # Soft gate during rollout: flip continue-on-error to false per the dated
    # Linear sub-task of PE-271 (see spec §4). Do NOT "fix" a red e2e not
    # blocking a tag — that is the intended rollout behavior.
    if: github.event_name != 'schedule'
    needs: unit
    runs-on: ubuntu-24.04
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/cache@v4
        with:
          path: .vscode-test
          key: vscode-test-${{ runner.os }}
      - run: npm ci
      - run: xvfb-run -a npm run test:e2e
```

- [ ] **Step 2: Wire the release workflow**

In `.github/workflows/release-extension.yml`, add before the `release` job and gate it:

```yaml
jobs:
  test:
    uses: ./.github/workflows/test.yml
    with:
      model_guard_strict: true
    # Reusable workflows do NOT inherit caller secrets — omitting this silently
    # no-ops the model guard on every release (exactly how bug #1 shipped).
    secrets: inherit

  release:
    needs: test
    runs-on: ubuntu-24.04
    ...existing steps unchanged (update runs-on from ubuntu-latest)...
```

- [ ] **Step 3: Validate YAML + create the PE-271 flip sub-task**

Run: `node -e "const yaml=require('js-yaml')" 2>/dev/null || npx --yes js-yaml .github/workflows/test.yml >/dev/null && npx --yes js-yaml .github/workflows/release-extension.yml >/dev/null && echo YAML-OK`
Expected: `YAML-OK`.
Then create a Linear sub-task under PE-271: "Flip e2e continue-on-error to false" with a due date 2 weeks out (the executor may delegate this back to the orchestrating session if Linear tools are unavailable).

- [ ] **Step 4: Add repo secret (manual, one-time)**

`ANTHROPIC_API_KEY` must exist in GitHub repo settings → Secrets → Actions. This cannot be scripted with the default token — flag it in the task report if not yet configured (`gh secret list` shows whether it exists; `gh secret set ANTHROPIC_API_KEY` can set it if the user provides the value).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test.yml .github/workflows/release-extension.yml
git commit -m "ci: add reusable test workflow gating PRs and releases (PE-271)"
```

---

### Task 8: CLAUDE.md Testing docs

**Files:**
- Modify: `CLAUDE.md` (the "## Testing" section only)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Replace the Testing section**

Replace the current section (which says "No automated test suite...") with:

```markdown
## Testing

Three layers, gated in CI (`.github/workflows/test.yml` — PRs, nightly, and releases via `release-extension.yml`):

1. **Hermetic suite — `npm test`.** Type-check + ESLint + static model check
   (default ∈ enum + id shape) + every fixture suite under `test-fixtures/`
   (detector, diagnostics, regression, smoke, ai-failure, spellcheck,
   git-safety, vsix). No network, no API key — runs identically offline and on
   fork PRs. This is the hard CI gate.
2. **Live model guard — `npm run test:model-guard`.** Probes
   `GET /v1/models/{id}` for the default + every enum id (per-id probe: enum
   holds alias ids the list endpoint doesn't return). CI-only; `--strict`
   (releases, nightly cron) fails on a missing `ANTHROPIC_API_KEY`, non-strict
   (fork PRs) warns and skips. Nightly failure auto-opens a GitHub issue.
3. **E2E — `npm run test:e2e`.** `@vscode/test-electron` + mocha
   (`src/test/`). Launches a real extension host against a generated fixture
   workspace and asserts published diagnostics. Runs fully offline: dummy key
   in the fixture `.env`, `ANTHROPIC_BASE_URL` pointed at a refused port — the
   AI layer always fails, which doubles as the standing regression test that
   deterministic checks survive AI failure. Requires no key. In CI it is a
   soft gate (`continue-on-error`) until flipped per the PE-271 sub-task.

**Adding a fixture suite:** create `test-fixtures/<name>/test-<name>.mts`, run
it via `tsx --import ./test-fixtures/regression/register-loader.mjs` (stubs
`vscode` + `cspell-lib`; use `test-fixtures/spellcheck/register-loader.mjs` to
get real cspell), print per-case `PASS`/`FAIL` lines, exit non-zero on failure,
add a `test:<name>` script, and chain it into `npm test`.

Node ≥ 22 (CI) / ≥ 20.19 (local minimum — `require(esm)` for cspell-lib).
```

Also update the Commands section: replace the `test:all`-era listing if present, ensure `npm test`, `test:model-guard`, `test:e2e` appear.

- [ ] **Step 2: Verify docs match reality**

Run: `npm test` one final time; every command named in the docs must exist in `package.json`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: replace 'no automated test suite' with the three-layer testing guide"
```

---

## Coverage vs spec

| Spec item | Task |
|---|---|
| Static model check + `npm test` aggregator (§1, §2) | 1 |
| Live guard, per-id probe, strict plumbing, taxonomy (§2) | 2 |
| P0 bug-#2 fixture regression, minimal frozen fixture (§1) | 3 |
| Spell checker suite (§1) | 4 |
| Git safety suite, hermetic repos + identity (§1) | 5 |
| `.checksum.md` rules suite (§1) | already exists (`test:smoke`) — no task |
| AST detector suite (§1) | already exists (`test:regression`) — no task |
| E2E: offline, dummy `.env` + `envFilePath`, refused port, diagnostics contract, AI-failure integration copy (§3) | 6 |
| Folder-lint E2E (§3) | deferred by spec — no task |
| test.yml, strict input, schedule scoping, permissions, cache, release gate, `secrets: inherit` (§4) | 7 |
| Nightly alert issue (§2/§4) | 7 |
| E2E flip ownership sub-task (§4) | 7 step 3 |
| CLAUDE.md rewrite (§5) | 8 |
