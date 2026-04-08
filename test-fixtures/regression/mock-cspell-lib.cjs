/**
 * Stub of cspell-lib for regression tests. The spell checker is exercised by
 * the top-level detectDeterministicPatterns() pipeline but is orthogonal to
 * the rules we're regression-testing — and loading the real ESM-only package
 * via tsx's CJS path blows up with ERR_PACKAGE_PATH_NOT_EXPORTED.
 *
 * We return empty/no-op shapes so spellCheckFile() resolves to an empty
 * issues array without throwing.
 */

'use strict';

async function getDefaultSettings() { return {}; }
function mergeSettings(...rest) { return Object.assign({}, ...rest); }
async function spellCheckDocument(_doc, _opts, _settings) {
  return { issues: [] };
}

module.exports = {
  getDefaultSettings,
  mergeSettings,
  spellCheckDocument,
};
