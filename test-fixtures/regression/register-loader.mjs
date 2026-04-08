/**
 * Same two-layer vscode stub pattern used by test-fixtures/diagnostic-provider:
 *   1. ESM loader hook for `import 'vscode'` from ESM code.
 *   2. CJS Module._resolveFilename monkey-patch so `require('vscode')` inside
 *      the CJS-compiled deterministicDetector.ts / configLoader.ts resolves to
 *      our mock.
 */
import { register } from 'node:module';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as url from 'node:url';

register(new URL('./vscode-loader.mjs', import.meta.url));

const require = createRequire(import.meta.url);
const Module = require('node:module');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const MOCK_VSCODE = path.resolve(here, 'mock-vscode.cjs');
const MOCK_CSPELL = path.resolve(here, 'mock-cspell-lib.cjs');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolveFilename(request, parent, ...rest) {
  if (request === 'vscode') {
    return MOCK_VSCODE;
  }
  // cspell-lib is ESM-only and blows up when resolved through tsx's CJS path.
  // The spell checker is orthogonal to the rules under regression test, so
  // we stub it with a no-op that returns zero issues.
  if (request === 'cspell-lib') {
    return MOCK_CSPELL;
  }
  return originalResolve.call(this, request, parent, ...rest);
};
