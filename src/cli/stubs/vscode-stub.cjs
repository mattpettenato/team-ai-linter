/**
 * CJS stub of `vscode` for the standalone CLI. Mirrors the surface area
 * of test-fixtures/regression/mock-vscode.cjs but wraps the export in a
 * throwing Proxy to catch any detector reaching for unstubbed API.
 */

'use strict'

const CONFIG_DEFAULTS = {
  envFilePath: '',
  globalRulesPath: '',
  rulesPath: '.ai-linter/rules.md',
  model: 'claude-sonnet-4-20250514',
  minConfidence: 0.5,
  ignoreNthSelectors: false,
  autoUpdate: true,
  enableEslintLayer: true,
  eslintTypeAwareRules: true,
}

const workspace = {
  // CLI passes the root explicitly via --root, so workspaceFolders stays
  // undefined. Repo-wide scans keyed off workspace folders stay disabled.
  get workspaceFolders() {
    return undefined
  },
  getConfiguration(_section) {
    return {
      get(key, fallback) {
        if (Object.prototype.hasOwnProperty.call(CONFIG_DEFAULTS, key)) {
          return CONFIG_DEFAULTS[key]
        }
        return fallback
      },
    }
  },
  getWorkspaceFolder(_uri) {
    return undefined
  },
}

class Range {
  constructor(startLine, startCol, endLine, endCol) {
    this.startLine = startLine
    this.startCol = startCol
    this.endLine = endLine
    this.endCol = endCol
  }
}

const DiagnosticSeverity = Object.freeze({
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
})

class Diagnostic {
  constructor(range, message, severity = DiagnosticSeverity.Error) {
    this.range = range
    this.message = message
    this.severity = severity
  }
}

class Uri {
  constructor(value) { this.value = value }
  static parse(v) { return new Uri(v) }
  static file(p) { return new Uri(`file://${p}`) }
  toString() { return this.value }
}

const languages = {
  createDiagnosticCollection(name) {
    const map = new Map()
    return {
      name,
      set(uri, d) { map.set(uri.toString(), d.slice()) },
      get(uri) { return map.get(uri.toString()) },
      delete(uri) { map.delete(uri.toString()) },
      clear() { map.clear() },
      dispose() { map.clear() },
    }
  },
}

const surface = {
  workspace,
  Range,
  Diagnostic,
  DiagnosticSeverity,
  Uri,
  languages,
}

// Any detector reaching for vscode API we did not stub must fail LOUDLY at
// runtime (and therefore in the fixture suite), never silently misbehave.
module.exports = new Proxy(surface, {
  get(target, prop) {
    if (prop in target || typeof prop === 'symbol' || prop === 'then' || prop === '__esModule') {
      return target[prop]
    }
    throw new Error(
      `linter-cli vscode stub: unstubbed property "${String(prop)}" accessed — ` +
      'a detector grew a new vscode dependency; extend src/cli/stubs/vscode-stub.cjs'
    )
  },
})
