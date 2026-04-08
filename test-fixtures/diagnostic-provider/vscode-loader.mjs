// Node ESM loader hook that redirects bare `vscode` specifier imports to our
// mock file. Registered via `module.register()` from register-loader.mjs.
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';

const MOCK_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'mock-vscode.cjs',
);
const MOCK_URL = pathToFileURL(MOCK_PATH).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vscode') {
    return { url: MOCK_URL, shortCircuit: true, format: 'commonjs' };
  }
  return nextResolve(specifier, context);
}
