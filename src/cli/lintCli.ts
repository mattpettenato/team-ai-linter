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
 * Standalone linter CLI (CE-8922 / CE-8907).
 *
 * Runs the extension's deterministic+AST detector pipeline outside VS Code:
 * vscode / cspell-lib / jiti are stubbed at build time (see esbuild.js --cli
 * and src/cli/stubs/). Output is JSON on stdout, diagnostics on stderr.
 *
 * Exit codes: 0 clean, 1 findings (successful lint), 2 execution error.
 */
import * as fs from 'fs'
import * as path from 'path'

declare const __CLI_VERSION__: string

const SCHEMA_VERSION = 1
const TEST_FILE_RE = /\.(test|spec)\.(ts|js|tsx|jsx)$/
const USAGE = 'usage: linter-cli --json [--root <dir>] -- <files|dirs|globs...>'

// Detectors narrate progress via console.log; stdout must stay JSON-only.
// Redirect BEFORE importing anything that logs.
console.log = (...args: unknown[]) => console.error(...(args as []))

interface CliArgs {
  root: string
  targets: string[]
}

function parseArgs(argv: string[]): CliArgs {
  let root = process.cwd()
  const targets: string[] = []
  let afterDashDash = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (afterDashDash) { targets.push(arg); continue }
    if (arg === '--') { afterDashDash = true; continue }
    if (arg === '--json') continue // JSON is the only output; flag kept for contract clarity
    if (arg === '--root') {
      const val = argv[++i]
      if (!val) fail(`--root requires a value\n${USAGE}`)
      root = val
      continue
    }
    if (arg.startsWith('-')) fail(`unknown flag ${arg}\n${USAGE}`)
    targets.push(arg)
  }
  if (targets.length === 0) fail(`no targets given\n${USAGE}`)
  return { root, targets }
}

function fail(message: string): never {
  console.error(message)
  process.exit(2)
}

/** realpath-resolve p and require it to live inside realRoot */
function contain(p: string, realRoot: string, label: string): string {
  let real: string
  try {
    real = fs.realpathSync(p)
  } catch {
    fail(`${label} not found: ${p}`)
  }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    fail(`${label} resolves outside --root: ${p}`)
  }
  return real
}

function walkForTestFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkForTestFiles(full, out)
    else if (TEST_FILE_RE.test(entry.name)) out.push(full)
  }
}

function expandTargets(rawTargets: string[], root: string, realRoot: string): string[] {
  const files = new Set<string>()
  for (const raw of rawTargets) {
    const abs = path.isAbsolute(raw) ? raw : path.resolve(root, raw)
    let stat: fs.Stats | null = null
    try { stat = fs.statSync(abs) } catch { /* fall through to glob */ }
    if (stat?.isFile()) {
      files.add(contain(abs, realRoot, 'target'))
    } else if (stat?.isDirectory()) {
      const found: string[] = []
      walkForTestFiles(contain(abs, realRoot, 'target'), found)
      found.forEach(f => files.add(contain(f, realRoot, 'target')))
    } else if (/[*?[\]{}]/.test(raw)) {
      // fs.globSync: Node >= 22. CLI is built for CI (Node 22) and the skill
      // preflights node; on older Node fall through to "not found".
      const globSync = (fs as unknown as { globSync?: (p: string, o: object) => string[] }).globSync
      if (!globSync) fail(`glob targets require Node >= 22: ${raw}`)
      const matches = globSync(raw, { cwd: root })
      if (matches.length === 0) fail(`glob matched nothing: ${raw}`)
      matches.forEach((m: string) => files.add(contain(path.resolve(root, m), realRoot, 'target')))
    } else {
      fail(`target not found: ${raw}`)
    }
  }
  return [...files].sort()
}

async function main(): Promise<void> {
  const { root, targets } = parseArgs(process.argv.slice(2))
  const realRoot = (() => {
    try { return fs.realpathSync(root) } catch { return fail(`--root not found: ${root}`) }
  })()
  const files = expandTargets(targets, realRoot, realRoot)

  // Findings + imports are produced in lintTargets (Task 3).
  const { findings, imports } = await lintTargets(files, realRoot)

  process.stdout.write(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    cliVersion: __CLI_VERSION__,
    root: realRoot,
    findings,
    imports,
  }, null, 2) + '\n')
  process.exit(findings.length > 0 ? 1 : 0)
}

// Task 3 replaces this placeholder implementation.
interface CliFinding {
  file: string
  line: number
  endLine?: number
  rule: string
  severity: string
  message: string
  layer: 'static' | 'git'
}
async function lintTargets(_files: string[], _realRoot: string):
  Promise<{ findings: CliFinding[]; imports: string[] }> {
  return { findings: [], imports: [] }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(2)
})
