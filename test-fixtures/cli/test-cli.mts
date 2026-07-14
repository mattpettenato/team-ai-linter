/**
 * CLI fixture suite. Run via: npm run test:cli
 * Builds dist/linter-cli.js then exercises it end-to-end (later tasks).
 * This file starts with stub-behavior cases and grows in Tasks 2-3.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

let failures = 0
function check(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (err) {
    failures++
    console.log(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// --- stub behavior ---

check('vscode stub exposes known surface', () => {
  const out = execFileSync('node', ['-e', `
    const v = require(${JSON.stringify(path.join(repoRoot, 'src/cli/stubs/vscode-stub.cjs'))})
    if (v.workspace.getConfiguration('teamAiLinter').get('minConfidence') !== 0.5) throw new Error('config default wrong')
    if (v.DiagnosticSeverity.Error !== 0) throw new Error('enum wrong')
    console.log('ok')
  `]).toString()
  if (!out.includes('ok')) throw new Error(out)
})

check('vscode stub throws on unknown property', () => {
  let threw = false
  try {
    execFileSync('node', ['-e', `
      const v = require(${JSON.stringify(path.join(repoRoot, 'src/cli/stubs/vscode-stub.cjs'))})
      v.window
    `], { stdio: 'pipe' })
  } catch { threw = true }
  if (!threw) throw new Error('accessing v.window should throw')
})

check('cspell stub returns zero issues', () => {
  const out = execFileSync('node', ['-e', `
    const c = require(${JSON.stringify(path.join(repoRoot, 'src/cli/stubs/cspell-lib-stub.cjs'))})
    c.spellCheckDocument({}, {}, {}).then(r => console.log(JSON.stringify(r.issues)))
  `]).toString()
  if (out.trim() !== '[]') throw new Error(out)
})

// --- built artifact ---

const cli = path.join(repoRoot, 'dist', 'linter-cli.js')
const fixturesDir = path.join(here, 'fixtures')

interface RunResult { status: number; stdout: string; stderr: string }
function runCli(args: string[], cwd: string = repoRoot): RunResult {
  const res = spawnSync('node', [cli, ...args], { cwd, encoding: 'utf8' })
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

console.error('building CLI...')
execFileSync('node', ['esbuild.js', '--cli', '--production'], { cwd: repoRoot, stdio: ['ignore', 'inherit', 'inherit'] })

check('bad flag exits 2 with usage', () => {
  const r = runCli(['--bogus'])
  if (r.status !== 2) throw new Error(`status ${r.status}`)
  if (!r.stderr.includes('usage')) throw new Error(`stderr: ${r.stderr}`)
})

check('missing target exits 2', () => {
  const r = runCli(['--json', '--root', fixturesDir, '--', 'does-not-exist.spec.ts'])
  if (r.status !== 2) throw new Error(`status ${r.status}`)
})

check('target outside --root is rejected', () => {
  const r = runCli(['--json', '--root', fixturesDir, '--', path.join(repoRoot, 'package.json')])
  if (r.status !== 2) throw new Error(`status ${r.status}`)
  if (!r.stderr.includes('outside')) throw new Error(`stderr: ${r.stderr}`)
})

check('clean file: exit 0, valid JSON envelope', () => {
  const r = runCli(['--json', '--root', fixturesDir, '--', 'clean.spec.ts'])
  if (r.status !== 0) throw new Error(`status ${r.status} stderr: ${r.stderr}`)
  const doc = JSON.parse(r.stdout)
  if (doc.schemaVersion !== 1) throw new Error('schemaVersion')
  if (typeof doc.cliVersion !== 'string' || !doc.cliVersion) throw new Error('cliVersion')
  if (!Array.isArray(doc.findings) || !Array.isArray(doc.imports)) throw new Error('arrays missing')
})

check('dirty file: exit 1, findings on target AND imported helper', () => {
  const r = runCli(['--json', '--root', fixturesDir, '--', 'dirty.spec.ts'])
  if (r.status !== 1) throw new Error(`status ${r.status} stderr: ${r.stderr}`)
  const doc = JSON.parse(r.stdout)
  const files = new Set(doc.findings.map((f: { file: string }) => f.file))
  if (!files.has('dirty.spec.ts')) throw new Error(`no finding on target: ${[...files]}`)
  if (!files.has('helper.ts')) throw new Error(`no finding on imported helper: ${[...files]}`)
  if (!doc.imports.includes('helper.ts')) throw new Error(`imports list: ${doc.imports}`)
  for (const f of doc.findings) {
    for (const key of ['file', 'line', 'rule', 'severity', 'message', 'layer']) {
      if (!(key in f)) throw new Error(`finding missing ${key}: ${JSON.stringify(f)}`)
    }
    if (!['static', 'git'].includes(f.layer)) throw new Error(`bad layer ${f.layer}`)
  }
})

check('stdout is pure JSON despite detector logging', () => {
  const r = runCli(['--json', '--root', fixturesDir, '--', 'dirty.spec.ts'])
  JSON.parse(r.stdout) // throws if any log line leaked onto stdout
})

check('non-git root: git safety skipped with warning, run still succeeds', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-cli-'))
  fs.copyFileSync(path.join(fixturesDir, 'clean.spec.ts'), path.join(tmp, 'clean.spec.ts'))
  const r = runCli(['--json', '--root', tmp, '--', 'clean.spec.ts'])
  if (r.status !== 0) throw new Error(`status ${r.status} stderr: ${r.stderr}`)
  if (!/git safety skipped/i.test(r.stderr)) throw new Error(`no skip warning: ${r.stderr}`)
})

process.exit(failures === 0 ? 0 : 1)
