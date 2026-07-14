/**
 * CLI fixture suite. Run via: npm run test:cli
 * Builds dist/linter-cli.js then exercises it end-to-end (later tasks).
 * This file starts with stub-behavior cases and grows in Tasks 2-3.
 */
import { execFileSync } from 'node:child_process'
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

process.exit(failures === 0 ? 0 : 1)
