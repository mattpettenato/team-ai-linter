// cspell-lib is ESM-only (exports map has only the "import" condition), so the
// tsx CJS compilation of spellChecker.ts can never require() it directly.
// This shim delegates to the REAL cspell-lib via lazy dynamic import — no
// spell-check logic is mocked; the suite exercises genuine cspell behavior.

'use strict'

let real = null
const load = async () => {
  if (!real) real = await import('cspell-lib')
  return real
}

module.exports = {
  getDefaultSettings: async (...args) => (await load()).getDefaultSettings(...args),
  // Sync in cspell's API; spellChecker.ts only calls it after awaiting
  // getDefaultSettings, so the real module is always loaded by then.
  mergeSettings: (...args) => {
    if (!real) throw new Error('cspell shim: mergeSettings called before getDefaultSettings resolved')
    return real.mergeSettings(...args)
  },
  spellCheckDocument: async (...args) => (await load()).spellCheckDocument(...args),
}
