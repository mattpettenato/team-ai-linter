'use strict'

// ponytail: jiti is only reachable via eslint config loading, which the CLI
// never invokes. Stub keeps the bundle single-file; throw = loud if wrong.
module.exports = function jitiStub() {
  throw new Error('jiti is not available in linter-cli')
}
module.exports.createJiti = module.exports
