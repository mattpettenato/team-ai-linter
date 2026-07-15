/**
 * Stub of cspell-lib for the standalone CLI. The spell checker is exercised
 * by the top-level detectDeterministicPatterns() pipeline but is orthogonal to
 * the rules we're testing — and loading the real ESM-only package via the
 * CLI bundle would break single-file bundling.
 *
 * We return empty/no-op shapes so spellCheckDocument() resolves to an empty
 * issues array without throwing.
 */

'use strict'

async function getDefaultSettings() { return {} }
function mergeSettings(...rest) { return Object.assign({}, ...rest) }
async function spellCheckDocument(_doc, _opts, _settings) {
  return { issues: [] }
}

module.exports = {
  getDefaultSettings,
  mergeSettings,
  spellCheckDocument,
}
