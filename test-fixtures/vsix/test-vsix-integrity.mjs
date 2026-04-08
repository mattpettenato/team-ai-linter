#!/usr/bin/env node
/**
 * VSIX integrity test.
 *
 * Extracts team-ai-linter-<version>.vsix to a temp dir and verifies that:
 *   1. The expected file structure is present (package.json, dist/extension.js,
 *      critical bundled dependencies under extension/node_modules/).
 *   2. eslint and checksumai-eslint-config can be require()'d from the
 *      extracted vsix (simulating what VS Code's extension host does at
 *      runtime when dist/extension.js does `require("eslint")`).
 *   3. The bundled ESLint + checksumai-eslint-config actually lints a real
 *      fixture file and surfaces the `checksum/one-test-per-file` rule.
 *   4. dist/extension.js can be require()'d without throwing anything other
 *      than the expected `vscode` module-not-found error.
 *
 * Exits 0 if every check passes, 1 otherwise.
 *
 * Run via: npm run test:vsix
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------- Result tracking ----------
let passCount = 0;
let failCount = 0;
const failures = [];

function pass(name) {
  passCount += 1;
  console.log(`  PASS  ${name}`);
}

function fail(name, detail) {
  failCount += 1;
  failures.push({ name, detail });
  console.log(`  FAIL  ${name}`);
  if (detail) {
    console.log(`        ${String(detail).split('\n').join('\n        ')}`);
  }
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

// ---------- 0. Locate or build vsix ----------
function findVsix() {
  const explicit = path.join(REPO_ROOT, 'team-ai-linter-0.4.8.vsix');
  if (fs.existsSync(explicit)) return explicit;
  // Fallback: any team-ai-linter-*.vsix in repo root
  const candidates = fs
    .readdirSync(REPO_ROOT)
    .filter((f) => /^team-ai-linter-.*\.vsix$/.test(f))
    .map((f) => path.join(REPO_ROOT, f));
  return candidates[0] ?? null;
}

let vsixPath = findVsix();
if (!vsixPath) {
  console.log('vsix not found, running `npm run package:vsix`...');
  execSync('npm run package:vsix', { cwd: REPO_ROOT, stdio: 'inherit' });
  vsixPath = findVsix();
  if (!vsixPath) {
    console.error('FATAL: vsix still missing after build');
    process.exit(1);
  }
}
console.log(`vsix: ${vsixPath}`);

// ---------- 1. Extract ----------
const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-ai-linter-vsix-'));
const extensionDir = path.join(stagingDir, 'extension');
console.log(`staging: ${stagingDir}`);

function cleanup() {
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`cleanup warning: ${err.message}`);
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

try {
  execSync(`unzip -q "${vsixPath}" -d "${stagingDir}"`, { stdio: 'inherit' });
  pass('extract vsix with unzip');
} catch (err) {
  fail('extract vsix with unzip', err.message);
  console.error('Cannot continue without extracted vsix');
  process.exit(1);
}

// ---------- 2. File structure ----------
section('File structure');

function checkFile(relPath) {
  const abs = path.join(extensionDir, relPath);
  if (fs.existsSync(abs)) {
    pass(`exists: extension/${relPath}`);
    return true;
  }
  fail(`exists: extension/${relPath}`, `missing at ${abs}`);
  return false;
}

checkFile('package.json');
checkFile('dist/extension.js');
checkFile('node_modules');

// ---------- 3. Critical bundled deps ----------
section('Critical bundled deps (node_modules)');

const criticalDeps = [
  'eslint',
  '@eslint/js',
  '@eslint/eslintrc',
  '@eslint/config-array',
  'typescript-eslint',
  '@typescript-eslint/parser',
  '@typescript-eslint/utils',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/scope-manager',
  '@typescript-eslint/type-utils',
  '@typescript-eslint/types',
  '@typescript-eslint/typescript-estree',
  '@typescript-eslint/visitor-keys',
  'typescript',
  'globals',
  'checksumai-eslint-config',
  'acorn',
  'acorn-jsx',
  'espree',
  'eslint-scope',
  'eslint-visitor-keys',
  'ajv',
  '@anthropic-ai/sdk',
  'cspell-lib',
  'ts-morph',
];

const nodeModulesDir = path.join(extensionDir, 'node_modules');
const missing = [];
for (const dep of criticalDeps) {
  const pkgJson = path.join(nodeModulesDir, dep, 'package.json');
  if (fs.existsSync(pkgJson)) {
    pass(`dep: ${dep}`);
  } else {
    missing.push(dep);
    fail(`dep: ${dep}`, `missing ${pkgJson}`);
  }
}

// ---------- 4. Load eslint from extracted vsix ----------
section('Runtime load from extracted vsix');

// Create a `require` anchored inside extension/ so Node's resolver walks
// into extension/node_modules the same way VS Code's extension host does
// when dist/extension.js calls require("eslint").
const extRequire = createRequire(path.join(extensionDir, 'package.json'));

let eslintModule = null;
try {
  eslintModule = extRequire('eslint');
  if (eslintModule && typeof eslintModule.ESLint === 'function') {
    pass('require("eslint") from extracted vsix');
  } else {
    fail('require("eslint") from extracted vsix', 'ESLint export not a constructor');
  }
} catch (err) {
  fail('require("eslint") from extracted vsix', err.stack || err.message);
}

let checksumConfigModule = null;
try {
  checksumConfigModule = extRequire('checksumai-eslint-config');
  const cfg = checksumConfigModule;
  const tests = cfg?.tests ?? cfg?.default?.tests;
  if (Array.isArray(tests) && tests.length > 0) {
    pass(`require("checksumai-eslint-config") + .tests array (length=${tests.length})`);
  } else {
    fail(
      'require("checksumai-eslint-config") + .tests array',
      `tests is ${Array.isArray(tests) ? 'empty array' : typeof tests}`,
    );
  }
} catch (err) {
  fail('require("checksumai-eslint-config")', err.stack || err.message);
}

// ---------- 5. Actually lint a fixture ----------
section('Lint fixture with bundled ESLint');

const fixturePath = path.join(
  REPO_ROOT,
  'test-fixtures',
  'eslint-detector',
  'tests',
  'two-tests.checksum.spec.ts',
);

if (!fs.existsSync(fixturePath)) {
  fail('fixture file exists', `missing ${fixturePath}`);
} else if (!eslintModule || !checksumConfigModule) {
  fail('lint fixture', 'skipped: eslint or checksumai-eslint-config failed to load');
} else {
  try {
    const { ESLint } = eslintModule;
    const tests =
      checksumConfigModule.tests ?? checksumConfigModule.default?.tests;
    // Disable the type-aware floating-promise rule for this smoke lint so
    // we don't need a real tsconfig for the fixture.
    const overrideConfig = [
      ...tests,
      { rules: { '@typescript-eslint/no-floating-promises': 'off' } },
    ];
    const eslint = new ESLint({
      cwd: path.dirname(fixturePath),
      overrideConfigFile: true,
      overrideConfig,
      errorOnUnmatchedPattern: false,
    });
    const source = fs.readFileSync(fixturePath, 'utf8');
    const results = await eslint.lintText(source, {
      filePath: fixturePath,
      warnIgnored: false,
    });
    const messages = results.flatMap((r) => r.messages);
    const hit = messages.find((m) => m.ruleId === 'checksum/one-test-per-file');
    if (hit) {
      pass(
        `lint fires checksum/one-test-per-file (line ${hit.line}: ${hit.message})`,
      );
    } else {
      const summary = messages
        .map((m) => `${m.ruleId}:${m.line}:${m.message}`)
        .join(' | ');
      fail(
        'lint fires checksum/one-test-per-file',
        `no matching rule. messages: ${summary || '<none>'}`,
      );
    }
  } catch (err) {
    fail('lint fixture with bundled ESLint', err.stack || err.message);
  }
}

// ---------- 6. Require extension.js ----------
section('Load dist/extension.js');

try {
  extRequire(path.join(extensionDir, 'dist', 'extension.js'));
  // If it loaded without throwing at all, that's a pass (unusual — vscode
  // shim isn't present — but not a failure).
  pass('require(dist/extension.js) without throwing');
} catch (err) {
  const msg = err && (err.message || String(err));
  const code = err && err.code;
  const isVscodeMissing =
    (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
    /['"]vscode['"]/.test(msg);
  if (isVscodeMissing) {
    pass('require(dist/extension.js) -> expected MODULE_NOT_FOUND for "vscode"');
  } else {
    fail('require(dist/extension.js)', err.stack || msg);
  }
}

// ---------- Report ----------
section('Summary');
const total = passCount + failCount;
console.log(`  total:    ${total}`);
console.log(`  passed:   ${passCount}`);
console.log(`  failed:   ${failCount}`);

if (failCount > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
  process.exitCode = 0;
}
