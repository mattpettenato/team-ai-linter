/**
 * Copyright (c) Checksum.
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
import { detectDeterministicPatterns } from '../services/detection/deterministicDetector'
import { parseImportsFromContent, getLocalImports } from '../services/importParser'
import { PathResolver } from '../services/pathResolver'
import { GitSafetyChecker } from '../services/git/gitSafetyChecker'
import { LintIssue, GitIssue } from '../types'

declare const __CLI_VERSION__: string

const SCHEMA_VERSION = 1
const TEST_FILE_RE = /\.(test|spec)\.(ts|js|tsx|jsx)$/
const USAGE = 'usage: linter-cli --json [--root <dir>] -- <files|dirs|globs...>'

// Detectors narrate progress via console.log; stdout must stay JSON-only.
// Load-time logs from bundled deps are caught by the esbuild banner
// (console.log=console.error runs before any module body); this rebind is
// the typed, source-visible statement of the same contract.
console.log = (...args: Parameters<typeof console.error>) => console.error(...args)

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

/**
 * Like contain(), but returns null (with a stderr warning) instead of exiting.
 * For files DISCOVERED by walking a directory or expanding a glob — one broken
 * or escaping symlink must not abort the whole run. Explicitly named targets
 * still go through contain() and fail hard.
 */
function tryContain(p: string, realRoot: string, label: string): string | null {
  let real: string
  try {
    real = fs.realpathSync(p)
  } catch {
    console.error(`${label} not found: ${p} — skipped`)
    return null
  }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    console.error(`${label} resolves outside --root: ${p} — skipped`)
    return null
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
      found.forEach(f => {
        const real = tryContain(f, realRoot, 'discovered file')
        if (real !== null) files.add(real)
      })
    } else if (/[*?[\]{}]/.test(raw)) {
      // fs.globSync: Node >= 22. CLI is built for CI (Node 22) and the skill
      // preflights node; on older Node fall through to "not found".
      const globSync = (fs as unknown as { globSync?: (p: string, o: object) => string[] }).globSync
      if (!globSync) fail(`glob targets require Node >= 22: ${raw}`)
      const matches = globSync(raw, { cwd: root })
      if (matches.length === 0) fail(`glob matched nothing: ${raw}`)
      matches.forEach((m: string) => {
        // match the directory walker's exclusions: never lint into
        // node_modules or dot-directories a glob happens to reach
        const segs = m.split(/[\\/]/)
        if (segs.some(s => s === 'node_modules' || (s.startsWith('.') && s !== '.' && s !== '..'))) return
        const abs = path.resolve(root, m)
        try {
          if (fs.statSync(abs).isFile()) {
            const real = tryContain(abs, realRoot, 'glob match')
            if (real !== null) files.add(real)
          }
        } catch {
          // skip stat failures (broken symlinks, permission denied, etc.)
        }
      })
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

  const { findings, imports } = await lintTargets(files, realRoot)

  const payload = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    cliVersion: __CLI_VERSION__,
    root: realRoot,
    // Layers the extension runs that this CLI build does not — lets JSON
    // consumers detect that "clean here" ≠ "clean in VS Code".
    disabledLayers: ['spellcheck'],
    findings,
    imports,
  }, null, 2) + '\n'
  const code = findings.length > 0 ? 1 : 0
  // Exit in write callback to ensure stdout is flushed before exit (fixes 64KB truncation on pipe)
  process.stdout.write(payload, () => process.exit(code))
}

interface CliFinding {
  file: string
  line: number
  endLine?: number
  rule: string
  severity: string
  message: string
  layer: 'static' | 'git'
}

const SOURCE_FILE_RE = /\.(ts|js|tsx|jsx|mts|mjs)$/

function rel(realRoot: string, abs: string): string {
  return path.relative(realRoot, abs).split(path.sep).join('/')
}

function staticFinding(realRoot: string, file: string, issue: LintIssue): CliFinding {
  return {
    file: rel(realRoot, file),
    line: issue.line,
    ...(issue.endLine !== undefined ? { endLine: issue.endLine } : {}),
    rule: issue.rule,
    severity: issue.severity,
    message: issue.message,
    layer: 'static',
  }
}

function gitFinding(realRoot: string, file: string, issue: GitIssue): CliFinding {
  return {
    file: rel(realRoot, file),
    line: issue.importLine,
    rule: 'git-safety',
    severity: issue.severity,
    message: `${issue.message} (import: ${issue.moduleSpecifier})`,
    layer: 'git',
  }
}

function isGitRepo(realRoot: string): boolean {
  // Walk up: --root often points at a monorepo package dir whose repo lives
  // above it. .git is a dir in a normal checkout and a FILE in a worktree —
  // existsSync covers both. (GitService does the same walk internally.)
  let dir = realRoot
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return true
    const parent = path.dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

async function lintTargets(files: string[], realRoot: string):
  Promise<{ findings: CliFinding[]; imports: string[] }> {
  const findings: CliFinding[] = []
  const targetSet = new Set(files)
  const helperSet = new Set<string>()
  const resolver = new PathResolver(realRoot)

  const gitEnabled = isGitRepo(realRoot)
  const gitChecker = gitEnabled ? new GitSafetyChecker(realRoot) : null
  if (!gitEnabled) console.error(`git safety skipped: ${realRoot} is not a git repository`)

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')

    const staticIssues = await detectDeterministicPatterns(content, file)
    findings.push(...staticIssues.map(i => staticFinding(realRoot, file, i)))

    if (gitChecker) {
      try {
        const gitIssues = await gitChecker.checkImports(content, file)
        findings.push(...gitIssues.map(i => gitFinding(realRoot, file, i)))
      } catch (err) {
        console.error(`git safety skipped for ${rel(realRoot, file)}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    for (const imp of getLocalImports(parseImportsFromContent(content, file))) {
      const resolved = resolver.resolveImport(imp.moduleSpecifier, file)
      if (!resolved) {
        console.error(`unresolved import "${imp.moduleSpecifier}" in ${rel(realRoot, file)} — skipped`)
        continue
      }
      let real: string
      try { real = fs.realpathSync(resolved) } catch { continue }
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        console.error(`import "${imp.moduleSpecifier}" in ${rel(realRoot, file)} resolves outside --root — skipped`)
        continue
      }
      if (real.includes(`${path.sep}node_modules${path.sep}`)) continue
      if (!SOURCE_FILE_RE.test(real)) continue
      if (targetSet.has(real)) continue
      helperSet.add(real)
    }
  }

  // Helper contract (deliberate, documented in the spec's parity notes):
  // one hop only — imports of TARGETS are linted, helpers' own imports are
  // not followed — and helpers get the static layer only, no git safety.
  for (const helper of [...helperSet].sort()) {
    const content = fs.readFileSync(helper, 'utf8')
    const issues = await detectDeterministicPatterns(content, helper)
    findings.push(...issues.map(i => staticFinding(realRoot, helper, i)))
  }

  return { findings, imports: [...helperSet].sort().map(h => rel(realRoot, h)) }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  process.exit(2)
})
