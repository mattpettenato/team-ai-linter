# CLAUDE.md - Team AI Linter

## Project Overview

Team AI Linter is a VS Code/Cursor extension that provides AI-powered test linting for Playwright and Checksum test files. It uses the Claude API to analyze test code for issues, complemented by deterministic regex and AST-based detection. The extension also performs git-based safety checks on import graphs.

Target files: `*.test.ts`, `*.spec.ts` (and `.js`/`.jsx`/`.tsx` variants), plus `checksum.config.ts`.

**Repository**: `mattpettenato/team-ai-linter` (GitHub)
**Remote**: `git@github.com:mattpettenato/team-ai-linter.git`

## Tech Stack

- **Language**: TypeScript 5.7, targeting ES2020
- **Module system**: CommonJS (for VS Code compatibility)
- **Bundler**: esbuild (custom `esbuild.js` config)
- **Runtime**: VS Code Extension API ^1.96.0
- **AI**: @anthropic-ai/sdk ^0.32.1 (Claude API)
- **AST**: ts-morph ^25.0.1 (TypeScript AST analysis)
- **Spell check**: cspell-lib ^9.6.2
- **Linting**: ESLint 9 with @typescript-eslint

## Commands

```bash
npm run compile       # Type-check + esbuild build
npm run watch         # esbuild watch mode (no type checking)
npm run package       # Type-check + production esbuild build (minified)
npm run check-types   # TypeScript type checking only (tsc --noEmit)
npm run lint          # ESLint on src/
```

To test the extension: build with `npm run package`, then install the `.vsix` via VS Code.

## Releasing

CI handles packaging via GitHub Actions (`.github/workflows/release-extension.yml`):

```bash
# 1. Bump version in package.json
# 2. Commit the version bump
# 3. Tag and push
git tag v0.4.0 && git push origin v0.4.0
# CI builds, type-checks, lints, packages .vsix, creates GitHub Release
```

The auto-updater in the extension checks GitHub Releases and prompts users to install new versions.

## Project Structure

```
src/
├── extension.ts                          # Entry point: activate/deactivate, command registration, auto-updater init
├── commands/
│   ├── runAllChecks.ts                   # Main single-file lint workflow orchestrator
│   └── lintFolder.ts                     # Folder/multi-file lint command
├── config/
│   ├── configLoader.ts                   # VS Code settings reader (model, rules path, etc.)
│   └── envLoader.ts                      # .env file parser for ANTHROPIC_API_KEY
├── services/
│   ├── serviceFactory.ts                 # Factory functions for DI of all services
│   ├── anthropicService.ts               # Claude API client wrapper
│   ├── autoUpdater.ts                    # GitHub Releases auto-update checker + installer
│   ├── versionService.ts                 # Shared getExtensionVersion() + compareSemver()
│   ├── importParser.ts                   # Parses import statements from test files
│   ├── importedFileLinter.ts             # Lints imported/helper files referenced by tests
│   ├── lintResultStore.ts                # In-memory store for last lint results
│   ├── packageJsonService.ts             # Reads package.json metadata
│   ├── pathResolver.ts                   # Resolves import paths to file system paths
│   ├── promptGeneratorService.ts         # Generates fix prompts for clipboard copy
│   ├── timestampService.ts              # Tracks last-linted timestamps per file
│   ├── gitService.ts                     # Low-level git operations
│   ├── ai/
│   │   ├── prompts.ts                    # System prompt template for Claude
│   │   └── responseParser.ts             # Parses Claude JSON responses into LintIssue[]
│   ├── detection/
│   │   ├── deterministicDetector.ts      # Regex-based pattern detection (no AI)
│   │   ├── astDetector.ts                # AST-based detection via ts-morph
│   │   ├── checksumAIAnalyzer.ts         # Checksum-specific AI analysis
│   │   ├── lineCorrector.ts             # Corrects line numbers in AI responses
│   │   └── spellChecker.ts               # Spell checking via cspell-lib
│   └── git/
│       └── gitSafetyChecker.ts           # Git import-graph safety validation
├── diagnostics/
│   └── diagnosticProvider.ts             # VS Code diagnostics collection manager
├── output/
│   ├── index.ts                          # Barrel export
│   ├── outputFormatter.ts                # Formats lint output for the output channel
│   └── diagnosticReporter.ts             # Maps lint issues to VS Code diagnostics
├── types/
│   ├── index.ts                          # Barrel export
│   ├── lint-result.ts                    # LintIssue, GitIssue, ImportedFileIssue types
│   ├── issues.ts                         # Issue-related type definitions
│   └── severity.ts                       # Severity enum
└── webview/
    ├── lintResultsPanel.ts               # WebView panel for displaying results
    └── panelHtml.ts                      # HTML template for the webview panel

.github/workflows/
└── release-extension.yml                 # CI: tag push → build → package .vsix → GitHub Release
```

Bundled output: `dist/extension.js` (single file via esbuild).

## Architecture

### Detection Layers (run in parallel where possible)

1. **Deterministic detection** (`deterministicDetector.ts`) - Fast regex pattern matching for known anti-patterns (hardcoded waits, `.nth()` selectors, etc.)
2. **AST detection** (`astDetector.ts`) - TypeScript AST analysis via ts-morph for structural issues
3. **AI detection** (`anthropicService.ts`) - Claude API call with test code + guidelines for nuanced issues

### Auto-Update Flow

`autoUpdater.ts` runs on a schedule (30s startup delay, then every 4 hours):
1. Read GitHub PAT from `context.secrets` (OS keychain via SecretStorage)
2. Fetch `GET /repos/mattpettenato/team-ai-linter/releases` from GitHub API
3. Compare latest release tag (e.g. `v0.4.0`) against current version via `compareSemver()`
4. If newer: prompt user with Install / Remind Later / Skip options
5. Install: download `.vsix` asset (with auth stripping on CDN redirect), install via VS Code API, prompt reload

### Main Flow

`runAllChecks.ts` orchestrates the full pipeline:
1. Load config (API key, rules, model settings)
2. Create services via `serviceFactory.ts` (factory pattern with constructor-based DI)
3. Run git safety checks (validates imports are committed/tracked)
4. Run deterministic + AST + AI detection
5. Report results via diagnostics + output channel + webview panel

### Service Factory Pattern

`serviceFactory.ts` provides `createLintServices(config)` which wires up:
- `AnthropicService` (core AI client)
- `ImportedFileLinter` (depends on AnthropicService)
- `GitSafetyChecker` (self-contained)

## Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension entry point, command registration, status bar, auto-updater |
| `src/commands/runAllChecks.ts` | Main lint workflow orchestrator |
| `src/services/anthropicService.ts` | Claude API wrapper |
| `src/services/autoUpdater.ts` | GitHub Releases update checker + installer |
| `src/services/versionService.ts` | Shared version utilities (getExtensionVersion, compareSemver) |
| `src/services/detection/deterministicDetector.ts` | Regex-based rule detection |
| `src/services/detection/astDetector.ts` | AST-based rule detection |
| `src/services/git/gitSafetyChecker.ts` | Git import-graph validation |
| `src/services/ai/prompts.ts` | System prompt sent to Claude |
| `guidelines.md` (root) | Bundled linting rules document |

## Coding Conventions

- **Strict TypeScript** (`"strict": true` in tsconfig)
- **ES6 imports** with relative paths for local modules
- **Namespace imports for Node builtins**: `import * as fs from 'fs'`, `import * as path from 'path'`
- **Named imports** for local modules: `import { AnthropicService } from './anthropicService'`
- **async/await** throughout (no raw promises)
- **Constructor-based DI** - services receive dependencies via constructor params
- **Factory functions** over classes for service creation (`createLintServices`)
- **Type guards** for discriminated unions in type definitions
- **JSDoc comments** on exported/public functions
- **No semicolons** at end of statements (project convention)
- **Apache 2.0 license header** on source files

## Testing

No automated test suite. The extension is tested manually:
1. Build with `npm run package`
2. Install the `.vsix` in VS Code/Cursor
3. Open a test file and trigger linting (`Cmd+Shift+L`)

No test runner or test framework is configured.

## Configuration

VS Code settings under `teamAiLinter.*` namespace:

| Setting | Default | Description |
|---------|---------|-------------|
| `envFilePath` | `""` | Path to `.env` file with `ANTHROPIC_API_KEY` |
| `globalRulesPath` | `""` | Absolute path to global rules file |
| `rulesPath` | `.ai-linter/rules.md` | Workspace-relative rules path |
| `model` | `claude-sonnet-4-20250514` | Claude model for AI linting |
| `minConfidence` | `0.5` | Minimum confidence threshold (0-1) |
| `ignoreNthSelectors` | `false` | Suppress `.nth()` selector warnings |
| `autoUpdate` | `true` | Auto-check GitHub Releases for updates |

GitHub token is stored in **SecretStorage** (OS keychain), not in settings. Configure via `teamAiLinter.setupGithubToken` command.

**Rules resolution order**: globalRulesPath > bundled `guidelines.md` > workspace `.ai-linter/rules.md`

## Extension Commands

| Command | Title | Trigger |
|---------|-------|---------|
| `teamAiLinter.runAll` | Run AI Lint | `Cmd+Shift+L`, editor title bar, context menu |
| `teamAiLinter.setup` | Configure .env Path | Command palette |
| `teamAiLinter.setupRules` | Configure Guidelines Path | Command palette |
| `teamAiLinter.setupGithubToken` | Configure GitHub Token | Command palette |
| `teamAiLinter.checkForUpdates` | Check for Updates | Command palette |
| `teamAiLinter.lintFolder` | Lint All Test Files in Folder | Explorer context menu |
| `teamAiLinter.lintSelectedFiles` | Lint Selected Test Files | Explorer context menu |
| `teamAiLinter.copyFixPrompt` | Copy Fix Prompt | Context menu |
