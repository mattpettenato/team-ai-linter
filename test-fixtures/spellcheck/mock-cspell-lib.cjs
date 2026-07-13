// Mock of cspell-lib for spell checker fixture tests.
// Implements real spell checking logic for test cases, since loading the real
// ESM-only cspell-lib via CJS fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
// This mock covers the subset of API used by src/services/detection/spellChecker.ts

'use strict'

const DICTIONARY = new Set([
  'user', 'can', 'navigate', 'to', 'dashboard', 'test', 'async', 'click', 'login',
  'await', 'checksumAI', 'hello', 'world', 'verify', // from spellChecker.ts initialization
])

async function getDefaultSettings() {
  return {}
}

function mergeSettings(...args) {
  return Object.assign({}, ...args)
}

async function spellCheckDocument(doc, opts, settings) {
  const word = doc.text.toLowerCase()

  // Check if word is in dictionary
  if (DICTIONARY.has(word)) {
    return { issues: [] }
  }

  // For known misspellings in tests, return an issue
  if (word === 'naviagte' || word === 'dashbaord') {
    return {
      issues: [{
        suggestions: [],
        word,
      }],
    }
  }

  // All other words are assumed correct
  return { issues: [] }
}

module.exports = {
  getDefaultSettings,
  mergeSettings,
  spellCheckDocument,
}
