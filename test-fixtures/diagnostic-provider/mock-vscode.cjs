/**
 * Minimal CJS mock of the `vscode` module for unit-testing DiagnosticProvider
 * outside of the VS Code extension host. Loaded as CJS so it can be required
 * from the CJS-compiled diagnosticProvider.ts without a require(esm) cycle.
 *
 * Implements only the surface DiagnosticProvider touches:
 *   - Range
 *   - Diagnostic
 *   - DiagnosticSeverity
 *   - Uri (via Uri.parse / Uri.file)
 *   - languages.createDiagnosticCollection (backed by a Map)
 */

'use strict';

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
    this.source = undefined;
    this.code = undefined;
  }
}

class Uri {
  constructor(value) {
    this.value = value;
  }
  static parse(v) {
    return new Uri(v);
  }
  static file(p) {
    return new Uri(`file://${p}`);
  }
  toString() {
    return this.value;
  }
}

// Mirror VS Code's DiagnosticCollection semantics: `set` REPLACES the array
// for that uri; `get` returns the current array (or undefined).
class MockDiagnosticCollection {
  constructor(name) {
    this.name = name;
    this.map = new Map();
  }
  set(uri, diagnostics) {
    this.map.set(uri.toString(), diagnostics.slice());
  }
  get(uri) {
    return this.map.get(uri.toString());
  }
  delete(uri) {
    this.map.delete(uri.toString());
  }
  clear() {
    this.map.clear();
  }
  dispose() {
    this.map.clear();
  }
}

const languages = {
  createDiagnosticCollection(name) {
    return new MockDiagnosticCollection(name);
  },
};

module.exports = {
  Range,
  Diagnostic,
  DiagnosticSeverity,
  Uri,
  languages,
};
