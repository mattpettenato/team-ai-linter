/**
 * CLI fixture suite. Run via: npm run test:cli
 * Builds dist/linter-cli.js then exercises the artifact end-to-end.
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
function runCli(args: string[], cwd: string = repoRoot, opts?: { maxBuffer?: number; timeout?: number }): RunResult {
  const res = spawnSync('node', [cli, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: opts?.maxBuffer ?? 10 * 1024 * 1024, // 10MB default for large outputs
    timeout: opts?.timeout ?? 30000, // 30s default
  })
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
  // Hermetic git repo: with the monorepo walk-up, fixturesDir inherits the
  // MAIN repo's git context, where @checksum-ai/runtime is legitimately
  // undeclared → a true-positive git finding. Isolate instead.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-cli-clean-'))
  execFileSync('git', ['init', '-q'], { cwd: tmp })
  fs.writeFileSync(path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { '@checksum-ai/runtime': '*' } }))
  fs.copyFileSync(path.join(fixturesDir, 'clean.spec.ts'), path.join(tmp, 'clean.spec.ts'))
  const r = runCli(['--json', '--root', tmp, '--', 'clean.spec.ts'])
  if (r.status !== 0) throw new Error(`status ${r.status} stderr: ${r.stderr}`)
  const doc = JSON.parse(r.stdout)
  if (doc.schemaVersion !== 1) throw new Error('schemaVersion')
  if (typeof doc.cliVersion !== 'string' || !doc.cliVersion) throw new Error('cliVersion')
  if (!Array.isArray(doc.findings) || !Array.isArray(doc.imports)) throw new Error('arrays missing')
  if (!Array.isArray(doc.disabledLayers) || !doc.disabledLayers.includes('spellcheck')) {
    throw new Error(`disabledLayers missing spellcheck: ${JSON.stringify(doc.disabledLayers)}`)
  }
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

check('large output: >128KB JSON parses without truncation (stdout flush on exit)', () => {
  // Generate a temp spec file with repeated hardcoded waits to create large output
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-cli-large-'))
  let content = `import { test } from '@playwright/test'\ntest('large fixture', async ({ page }) => {\n`
  // Each hardcoded wait is one finding; generate enough to exceed 128KB output
  for (let i = 0; i < 2000; i++) {
    content += `  await page.waitForTimeout(100)\n`
  }
  content += '})\n'
  const specPath = path.join(tmp, 'large.spec.ts')
  fs.writeFileSync(specPath, content)
  // Run with maxBuffer large enough for the output
  const r = runCli(['--json', '--root', tmp, '--', specPath], repoRoot, { maxBuffer: 10 * 1024 * 1024 })
  if (r.status !== 1) throw new Error(`status ${r.status} (expected 1 for findings) stderr: ${r.stderr}`)
  // Critical: JSON must parse completely (no truncation at 64KB)
  let doc: unknown
  try { doc = JSON.parse(r.stdout) } catch (e) {
    throw new Error(`JSON.parse failed: ${e instanceof Error ? e.message : String(e)}\nstdout length: ${r.stdout.length}`)
  }
  if (!Array.isArray((doc as unknown as { findings?: unknown }).findings)) {
    throw new Error('findings not an array')
  }
  const findingsCount = ((doc as unknown as { findings: unknown[] }).findings ?? []).length
  if (findingsCount < 100) throw new Error(`too few findings: ${findingsCount} (expected ~2000)`)
})

check('directory target: finds issues in test file via directory expansion', () => {
  const r = runCli(['--json', '--root', fixturesDir, '--', '.'])
  if (r.status !== 1) throw new Error(`status ${r.status} (expected 1) stderr: ${r.stderr}`)
  const doc = JSON.parse(r.stdout)
  const files = new Set(doc.findings.map((f: { file: string }) => f.file))
  // dirty.spec.ts has findings; clean.spec.ts does not
  if (!files.has('dirty.spec.ts')) throw new Error(`no findings on dirty.spec.ts: ${[...files]}`)
  // Should also include the imported helper
  if (!files.has('helper.ts')) throw new Error(`no findings on imported helper: ${[...files]}`)
})

check('shell metacharacters in imported filename do not execute (RCE regression)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-cli-rce-'))
  execFileSync('git', ['init', '-q'], { cwd: tmp })
  const evilName = 'dep`touch INJECTED`$(touch INJECTED2)'
  fs.writeFileSync(path.join(tmp, `${evilName}.ts`), 'export const h = 1\n')
  fs.writeFileSync(path.join(tmp, 'victim.spec.ts'),
    `import { h } from './${evilName}'\nimport { test } from '@playwright/test'\ntest('t', async () => { console.log(h) })\n`)
  const r = runCli(['--json', '--root', tmp, '--', 'victim.spec.ts'])
  if (fs.existsSync(path.join(tmp, 'INJECTED')) || fs.existsSync(path.join(tmp, 'INJECTED2'))) {
    throw new Error('shell injection executed — marker file created')
  }
  if (r.status === 2) throw new Error(`run failed: ${r.stderr}`)
  JSON.parse(r.stdout)
})

check('monorepo subdir --root: git layer stays enabled (walks up for .git)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-cli-mono-'))
  execFileSync('git', ['init', '-q'], { cwd: tmp })
  const pkg = path.join(tmp, 'packages', 'web')
  fs.mkdirSync(pkg, { recursive: true })
  fs.copyFileSync(path.join(fixturesDir, 'clean.spec.ts'), path.join(pkg, 'clean.spec.ts'))
  const r = runCli(['--json', '--root', pkg, '--', 'clean.spec.ts'])
  if (/git safety skipped:/.test(r.stderr)) throw new Error(`git layer disabled in subdir: ${r.stderr}`)
  JSON.parse(r.stdout)
})

check('glob target skips node_modules', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-cli-glob-'))
  fs.mkdirSync(path.join(tmp, 'node_modules', 'dep'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'node_modules', 'dep', 'vendored.spec.ts'),
    `import { test } from '@playwright/test'\ntest('v', async ({ page }) => { await page.waitForTimeout(1) })\n`)
  fs.copyFileSync(path.join(fixturesDir, 'dirty.spec.ts'), path.join(tmp, 'real.spec.ts'))
  fs.copyFileSync(path.join(fixturesDir, 'helper.ts'), path.join(tmp, 'helper.ts'))
  const r = runCli(['--json', '--root', tmp, '--', '**/*.spec.ts'])
  if (r.status !== 1) throw new Error(`status ${r.status} stderr: ${r.stderr}`)
  const doc = JSON.parse(r.stdout)
  const files = new Set(doc.findings.map((f: { file: string }) => f.file))
  if ([...files].some(f => (f as string).includes('node_modules'))) {
    throw new Error(`glob linted into node_modules: ${[...files]}`)
  }
  if (!files.has('real.spec.ts')) throw new Error(`real spec not linted: ${[...files]}`)
})

check('broken symlink discovered in directory walk is skipped, not fatal', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tal-cli-symlink-'))
  fs.copyFileSync(path.join(fixturesDir, 'clean.spec.ts'), path.join(tmp, 'clean.spec.ts'))
  fs.symlinkSync(path.join(tmp, 'gone.ts'), path.join(tmp, 'broken.spec.ts'))
  const r = runCli(['--json', '--root', tmp, '--', '.'])
  if (r.status === 2) throw new Error(`broken symlink aborted the run: ${r.stderr}`)
  if (!/skipped/.test(r.stderr)) throw new Error(`no skip warning: ${r.stderr}`)
  JSON.parse(r.stdout)
})

process.exit(failures === 0 ? 0 : 1)
