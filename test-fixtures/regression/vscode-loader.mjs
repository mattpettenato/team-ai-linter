/**
 * ESM loader hook that redirects `import 'vscode'` to the CJS mock.
 * Companion to register-loader.mjs. Not strictly required in practice
 * (tsx compiles .ts as CJS, which goes through the Module._resolveFilename
 * patch), but registered for safety in case an ESM caller ever pulls it in.
 */
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOCK = pathToFileURL(path.resolve(here, 'mock-vscode.cjs')).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'vscode') {
    return { url: MOCK, shortCircuit: true, format: 'commonjs' };
  }
  return nextResolve(specifier, context);
}
