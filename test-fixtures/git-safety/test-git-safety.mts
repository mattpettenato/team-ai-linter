/**
 * Hermetic git-safety fixtures. Builds throwaway git repos in tmp dirs — each
 * sets local user.name/user.email before committing (CI runners have no global
 * git identity; git commit hard-fails without it).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// tsx compiles the imported .ts as CJS; named exports land under `default`
// when imported from this ESM (.mts) context.
import * as gitSafetyCheckerNs from '../../src/services/git/gitSafetyChecker'
const gitSafetyModule: any = (gitSafetyCheckerNs as any).default ?? gitSafetyCheckerNs
const GitSafetyChecker = gitSafetyModule.GitSafetyChecker as new (workspaceRoot: string) => {
  checkImports(fileContent: string, filePath: string): Promise<any[]>
}

function sh(cwd: string, ...args: string[]) {
  // Neutralize global/system git config: a developer's commit.gpgsign or
  // core.hooksPath would otherwise hang or fail the fixture commits.
  return execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  })
}

function buildRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tal-gitsafety-')))
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
