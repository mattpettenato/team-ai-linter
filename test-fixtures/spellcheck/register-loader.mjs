// ESM-only cspell-lib can't be loaded via require() in tsx's CJS environment,
// even with Node >= 20.19 (its exports map defines only the "import" condition).
// Instead, requires of 'cspell-lib' resolve to a CJS shim that lazily
// dynamic-imports the REAL cspell-lib and delegates to it — no spell logic is
// mocked; the suite exercises genuine cspell dictionaries.
import { register, createRequire } from 'node:module'
import * as path from 'node:path'
import * as url from 'node:url'

register(new URL('../regression/vscode-loader.mjs', import.meta.url))

const require = createRequire(import.meta.url)
const Module = require('node:module')
const here = path.dirname(url.fileURLToPath(import.meta.url))
const MOCK_VSCODE = path.resolve(here, '../regression/mock-vscode.cjs')
const MOCK_CSPELL = path.resolve(here, 'mock-cspell-lib.cjs')

const originalResolve = Module._resolveFilename
Module._resolveFilename = function patched(request, parent, ...rest) {
  if (request === 'vscode') return MOCK_VSCODE
  if (request === 'cspell-lib') return MOCK_CSPELL
  return originalResolve.call(this, request, parent, ...rest)
}
