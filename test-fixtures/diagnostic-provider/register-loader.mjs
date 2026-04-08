/**
 * Two-layer vscode stub, because tsx loads .ts files as CJS in this repo
 * (package.json has no "type":"module") but our test entrypoint is .mts (ESM):
 *
 * 1. ESM loader hook (vscode-loader.mjs) — handles any `import 'vscode'` from
 *    ESM callers. Not actually triggered by diagnosticProvider.ts in practice,
 *    but registered for safety in case a future caller loads this from ESM.
 * 2. CJS Module._resolveFilename monkey-patch — redirects `require('vscode')`
 *    from the CJS-compiled diagnosticProvider.ts to the CJS mock file. This is
 *    the path that actually fires at runtime.
 */
import { register } from 'node:module';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as url from 'node:url';

// Layer 1: ESM loader hook for `import 'vscode'` from ESM code.
register(new URL('./vscode-loader.mjs', import.meta.url));

// Layer 2: monkey-patch CJS resolution for `require('vscode')`.
const require = createRequire(import.meta.url);
const Module = require('node:module');
const here = path.dirname(url.fileURLToPath(import.meta.url));
const MOCK_CJS = path.resolve(here, 'mock-vscode.cjs');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolveFilename(request, parent, ...rest) {
  if (request === 'vscode') {
    return MOCK_CJS;
  }
  return originalResolve.call(this, request, parent, ...rest);
};
