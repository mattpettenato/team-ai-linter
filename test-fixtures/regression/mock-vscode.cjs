/**
 * CJS mock of `vscode` for running deterministicDetector.ts / astDetector.ts
 * under plain tsx (outside the extension host).
 *
 * Surface area required by the code-under-test at time of writing:
 *   - workspace.getConfiguration('teamAiLinter').get(key) -> returns defaults
 *   - workspace.workspaceFolders -> undefined (disables colon-filename scan)
 *   - workspace.getWorkspaceFolder() -> undefined (configLoader.getRulesPath)
 *
 * Defaults mirror package.json contributes.configuration so the detector
 * behaves as a stock install: ignoreNthSelectors=false, envFilePath="".
 */

'use strict';

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
};

const workspace = {
  workspaceFolders: undefined,
  getConfiguration(_section) {
    return {
      get(key, fallback) {
        if (Object.prototype.hasOwnProperty.call(CONFIG_DEFAULTS, key)) {
          return CONFIG_DEFAULTS[key];
        }
        return fallback;
      },
    };
  },
  getWorkspaceFolder(_uri) {
    return undefined;
  },
};

class Range {
  constructor(startLine, startCol, endLine, endCol) {
    this.startLine = startLine;
    this.startCol = startCol;
    this.endLine = endLine;
    this.endCol = endCol;
  }
}

const DiagnosticSeverity = Object.freeze({
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
});

class Diagnostic {
  constructor(range, message, severity = DiagnosticSeverity.Error) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}

class Uri {
  constructor(value) { this.value = value; }
  static parse(v) { return new Uri(v); }
  static file(p) { return new Uri(`file://${p}`); }
  toString() { return this.value; }
}

const languages = {
  createDiagnosticCollection(name) {
    const map = new Map();
    return {
      name,
      set(uri, d) { map.set(uri.toString(), d.slice()); },
      get(uri) { return map.get(uri.toString()); },
      delete(uri) { map.delete(uri.toString()); },
      clear() { map.clear(); },
      dispose() { map.clear(); },
    };
  },
};

module.exports = {
  workspace,
  Range,
  Diagnostic,
  DiagnosticSeverity,
  Uri,
  languages,
};
