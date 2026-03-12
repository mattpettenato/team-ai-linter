# Changelog

All notable changes to the Team AI Linter extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2026-03-12] — v0.4.7

### Added
- **`prefer_web_first_assertion` rule**: Flags `.waitFor()` and `.waitFor({ state: "visible"|"hidden" })` — prefer `expect(locator).toBeVisible()` or `expect(locator).toBeHidden()` instead
  - Does not flag `.waitFor({ state: "attached" })` or `state: "detached"` (no web-first equivalent)
- **`unnecessary_assertion_timeout` rule**: Flags explicit `{ timeout: ... }` in assertions like `expect(el).toBeVisible({ timeout: 1000 })` — rely on the global assertion timeout in `playwright.config.ts`
- AI prompt updated with "DO NOT FLAG" entries for both new rules to avoid duplicates with deterministic detection

### Changed
- **`guidelines.md` updated** to stop recommending explicit assertion timeouts and `.waitFor()` for visibility checks — examples now use web-first assertions without timeouts

---

## [2026-03-09] — v0.4.5

### Added
- **SCM Context Menu Support**: "Run AI Lint" now appears in the Source Control "Changes" panel context menu
  - Right-click individual files or multi-select files to lint them
  - Right-click the "Changes" group header to lint all changed test files at once
  - Non-test files are automatically skipped with an informative message
  - Only appears on unstaged "Changes" group (not "Staged Changes")

### Fixed
- **SCM multi-select handling**: Fixed issue where multi-selecting files in the Changes panel only linted the first file — Cursor passes each selected resource as a separate positional argument rather than an array
- **Git safety false positives**: Suppressed unstaged-change warnings when the only modification is the linter's own "Last linted" timestamp comment
- **Git root discovery**: Removed `gitRoot` null guards in `GitService` — git commands now auto-discover the repo root via `path.dirname(filePath)`, improving reliability in nested repository setups

---

## [2026-03-04] — v0.4.0

### Added
- **Auto-Update from GitHub Releases**: Extension now automatically checks for new versions on startup (30s delay) and every 4 hours
  - Fetches releases from `mattpettenato/team-ai-linter` GitHub repo
  - Compares semver versions and prompts with Install / Remind Later / Skip options
  - Downloads `.vsix` asset directly from GitHub Release, installs via VS Code API, prompts reload
  - Auth header stripped on CDN redirects for security
  - 15-second timeout on API requests to prevent hanging
  - Skipped versions remembered in globalState
- **"Check for Updates" Command**: Manual update check via Command Palette (`Team AI Linter: Check for Updates`)
- **"Configure GitHub Token" Command**: Securely store GitHub PAT in OS keychain via VS Code SecretStorage (`Team AI Linter: Configure GitHub Token`)
- **`teamAiLinter.autoUpdate` Setting**: Boolean setting (default `true`) to enable/disable background update checks
- **Shared Version Service** (`versionService.ts`): Extracted `getExtensionVersion()` from webview into shared module with `compareSemver()` utility
- **GitHub Actions Release Workflow**: CI pipeline triggered on `v*` tag push — runs type-check, lint, packages `.vsix`, creates GitHub Release with artifact
- **Standalone ESLint Config**: `eslint.config.mjs` for the dedicated repo (previously inherited from monorepo)

### Changed
- **Migrated to Dedicated Repository**: Moved from `checksum-ai/playwright-mcp` monorepo to `mattpettenato/team-ai-linter`
- **Updated `package.json` repo URL** to point to `mattpettenato/team-ai-linter`
- **`.vscodeignore`**: Added `.env` exclusion to prevent secrets from being bundled in VSIX

### Fixed
- **Pre-existing lint errors**: Fixed unused variable `hasBugInTitle` in `astDetector.ts`, changed `let` to `const` for non-reassigned variables in `astDetector.ts` and `deterministicDetector.ts`

---

## [2026-03-02] — v0.3.1

### Added
- **REPL Import Detection (`repl_import`)**: New error-severity check that detects `repl` imports in both ES module (`import { repl } from "..."`) and CommonJS (`const { repl } = require(...)`) formats
  - Flags as an error — the repl tool is for local debugging only and must not be committed to test files
- **REPL Alert Banner**: When a repl import is detected, a prominent red pulsing banner ("REMOVE REPL IMPORT") is displayed at the very top of the lint results panel — above unstaged and missing file alerts — with file location and code preview

---

## [2026-02-24] — v0.3.0

### Added
- **Always-On `checksum.config.ts` Environment Checks**: Two new checks run automatically on every lint — no matter which file you're linting:
  - **`missing_env_var_guard`**: Detects `process.env.*` vars used in `checksum.config.ts` that aren't covered by a top-level `if (!process.env.X) throw` guard
  - **`env_var_not_in_dotenv`**: Detects vars used in `checksum.config.ts` that don't exist in the `.env` file
- **Auto-detect `.env` next to config**: The `.env` check now looks for `.env` in the same directory as `checksum.config.ts` first (matching the config's own `dotenv.config({ path: __dirname/.env })` pattern), then falls back to the global `envFilePath` setting
- **`findChecksumConfigPath()` helper**: Walks up from the linted file to find `checksum.config.ts`, stopping at the workspace root
- **`findEnvVarsNotInDotenv()` AST function**: Parses `checksum.config.ts` with ts-morph to find `process.env.*` references not present in the `.env` file, excluding `!!process.env.CI` boolean-coerced patterns

### Changed
- **Removed filename gate from `findMissingEnvVarGuards`**: The function no longer early-returns when the file isn't named `checksum.config.ts` — the caller now controls what content is passed
- **Consolidated env var output**: Missing `.env` vars are reported as a single summary line (e.g., `Env vars not defined in .env file: VAR_A, VAR_B`) instead of one issue per variable per occurrence
- **Session-level deduplication**: `checksum.config.ts` checks only run once per lint session — the first file triggers the check, subsequent files (including imported utilities) skip it. Cache resets at the start of each new lint run.

---

## [2026-02-20] — v0.1.3

### Added
- **Import Case Sensitivity Check**: Detects case mismatches in import paths that pass on macOS (case-insensitive) but fail on Linux/CI (case-sensitive)
  - Uses `fs.realpathSync()` to compare the import-derived path against the actual path on disk
  - Surfaces mismatches as critical git errors (e.g., `Report/` vs `report/`) with a clear message showing both paths
  - Prevents broken test runs caused by directory name casing differences between local dev and GKE nodes

---

## [2026-02-18] — v0.1.2

### Removed
- **Re-run Lint Button**: Removed the "Re-run Lint" button from the webview header
  - Use the keyboard shortcut (Cmd+Shift+L) or editor title button to re-run

### Fixed
- **Version Badge Fallback**: Version detection now falls back to reading the bundled `package.json` directly if the VS Code extension API doesn't return a version (e.g. during development)
- **Version Badge CSS**: Removed duplicate `color` property in `.version-badge` style

---

## [2026-02-18] — v0.1.1

### Fixed
- **Re-run Lint Button**: Fixed the "Re-run Lint" button in the webview panel not working
  - Previously failed silently because the webview panel itself was the focused "editor," so `activeTextEditor` returned `undefined`
  - Now falls back to the last linted file from the result store when no text editor is active
  - Error message updated to be more helpful when no file has been linted yet

### Added
- **Version Badge**: Extension version now shown as a small badge in the webview header
  - Visible in both the loading state and the results view
  - Reads the version dynamically from `package.json` via the VS Code extension context

---

## [2026-02-12]

### Added
- **Critical Git Safety Alerts**: Red alert banners in the webview panel for critical import issues
  - **UNSTAGED FILES DETECTED** banner: Shows when imported files are untracked or have unstaged changes, with a "Copy git add commands" button
  - **MISSING FILES DETECTED** banner: Shows when imported files don't exist on disk
  - Individual git issues styled with red left border and tinted background
- **Git Safety in Folder Lint**: Folder lint and multi-file lint now run git safety checks
  - Previously only single-file lint (Cmd+Shift+L) checked git status of imports
  - Right-click "Lint Folder" and "Lint Selected Files" now detect unstaged/missing imports
  - Git issues appear in the output channel log and folder summary
- **Git Issues in Fix Prompt (Folder)**: "Copy Fix Prompt" from folder lint now includes critical git sections
  - Missing files and unstaged files listed at the top of the prompt with `git add` commands

### Fixed
- **Modified-Unstaged Files Not Detected**: Fixed `git status --porcelain` parsing bug where `.trim()` stripped the leading space from status codes
  - ` M path/file` (modified in worktree, not staged) was being parsed as `M path/file` (staged in index) after trimming
  - Changed to `.trimEnd()` to preserve the leading status character
  - This caused Scenario 3 (committed file with unstaged edits) to silently pass with no errors
- **Escalated Modified-Unstaged to ERROR**: Modified-but-unstaged imports were previously WARNING, now ERROR to match untracked files
- **AI False Positive for @checksum/ Imports**: AI was flagging `import login from "@checksum/login"` as `wrong_import_pattern`, suggesting it should come from `init()` — added explicit guidance in AI prompt that `@checksum/*` path alias imports are valid standalone utility imports
- **AI Duplicate Import Issues**: Added dedup filters for `missing_import`, `wrong_import_pattern`, `cannot resolve import`, `file not found`, and `file does not exist` patterns so AI-detected import issues are suppressed when the git safety checker already covers them with correct line numbers

### Changed
- **`isMissing` Flag on GitIssue**: Added `isMissing` boolean to distinguish nonexistent file imports from unstaged file imports, enabling separate banner and prompt treatment

---

## [2026-02-11]

### Added
- **Await Enforcement Rule**: New linting rule to ensure all Playwright actions are properly awaited to prevent runtime issues
- **Nested checksumAI Warning**: New rule to warn against nesting checksumAI blocks, promoting clearer structure and better AI agent recovery
- **Ignore networkidle Toggle**: New checkbox in the filter bar to bulk-ignore all `networkidle` warnings

### Fixed
- **False Positive for let/const Destructuring**: Improved response parser to filter out incorrect AI suggestions about changing `let` to `const` for init() destructuring

---

## [2026-02-03]

### Added
- **Terminal-Style Activity Log**: New real-time status display in the AI Lint Results panel
  - Shows Claude Code-inspired terminal output with timestamps and status icons
  - Displays step-by-step progress: initialization, git safety check, AI lint, completion
  - Spinner icons animate for in-progress tasks, checkmarks for completed steps
  - Auto-scrolls as new status lines appear during linting
  - Collapsible panel - expanded during loading, collapsed in results view
  - Click to expand and review full activity history after linting completes
- **Multi-Folder Selection**: Can now select multiple folders in the explorer and lint them all at once
  - Right-click multiple selected folders and choose "Lint All Test Files in Folder"
  - Each folder is processed sequentially with results combined in the panel
- **Show All Scanned Files in Folder Lint**: When linting a folder, all scanned files now appear in results
  - Files with no issues show a green checkmark and "No issues" label
  - Files with issues appear first, followed by clean files
  - Provides confirmation that all files were actually checked

### Fixed
- **Activity Log Empty in Results View**: Fixed status messages not appearing in the Activity Log after linting completes
  - Status history is now preserved and re-displayed when transitioning from loading to results view
- **False Positive: let vs const for init()**: Fixed AI incorrectly flagging `let { test, ... } = init(base)` as needing `const`
  - Using `let` for the init() destructuring is the correct and intentional pattern
- **Hardcoded Date Line Number Correction**: Fixed incorrect line numbers for `hardcoded_date` issues
  - AI was reporting wrong line numbers (e.g., pointing to `async () => {` instead of actual date like "Mar 2026")
  - Added date pattern detection to `lineCorrector.ts` to find actual date occurrences in the file
  - Pattern matches month names with years (e.g., "Mar 2026", "January 2024") and ISO date formats (e.g., "2024-01-15")
  - Line numbers are now corrected to the closest actual date pattern in the file

---

## [2026-02-02]

### Fixed
- **Spell Checker False Positives**: Fixed spell checker flagging common English words ("verify", "click", "candidate", "wait", etc.) as misspellings
  - Root cause: cspell dictionaries weren't loading properly, causing only custom tech terms to be recognized
  - Changed from `getDictionary()` to `spellCheckDocument()` API for proper dictionary support
  - Added validation on startup that tests common words; spell checking auto-disables if dictionaries fail to load
  - This prevents floods of false positive spelling errors in lint results
- **Multi-line checksumAI Wrapper Detection**: Fixed false positives for `waitForURL` and `waitForSelector` when wrapped in multi-line checksumAI blocks
  - Root cause: Detection pattern only matched single-line format `checksumAI("desc", async () => {`
  - Now correctly detects both single-line and multi-line wrapper formats
  - Added `hasDescription()` helper function to handle description detection across line breaks
  - Prevents incorrectly flagging properly wrapped Playwright wait methods as unwrapped

---

## [2026-01-29]

### Added
- **Spell Checking**: Automatic spell checking for test descriptions, checksumAI descriptions, test.step descriptions, comments, and annotation descriptions
  - Includes suggestions for misspelled words
  - Custom dictionary with 200+ tech/testing terms (Playwright, checksumAI, etc.)
  - Shown as "info" severity to avoid being too intrusive
- **Multi-File Selection Lint**: Select multiple test files in the explorer and right-click to lint them together
  - Only lints files matching test/spec pattern
  - Available via "Team AI Linter: Lint Selected Test Files" context menu option

### Improved
- **Bug Annotation Error Messages**: Now include the expected format to help users and AI fix incomplete bug annotations

### Fixed
- **Ignore waitForTimeout Toggle**: Now correctly ignores ALL matching issues (was only applying to first duplicate when same issue appeared multiple times)
- **Duplicate Imported Issues**: Imported file issues are now deduplicated when the same utility file is imported by multiple test files
- **Folder Lint Grouping**: Imported issues now properly grouped by their actual file path instead of being mixed with main test file issues

### Changed
- **Ignore waitForTimeout Toggle**: Now visible for all users (previously restricted to specific user)

---

## [2026-01-28]

### Added
- **Ignore waitForTimeout Toggle**: Checkbox in filter bar to bulk-ignore all `avoid_waitForTimeout` issues
- **Loading Indicator**: Spinning indicator with filename shown while linting is in progress
- **Sticky Header**: Header and filter bar stay fixed at top when scrolling through issues
- **Issue Count in Title**: Panel title now shows issue count (e.g., "AI Lint Results (18)")
- **Expand/Collapse All**: Buttons to expand or collapse all file sections at once
- **Smooth Scrolling**: Smooth scroll behavior when navigating to issues

---

## [2026-01-26]

### Added
- **Severity Filter**: Filter issues by errors, warnings, or info in the webview panel
- **Ignore Issues**: Click the X button to ignore individual issues
  - Ignored issues appear faded with strikethrough text
  - Click the restore button (↶) to un-ignore
  - Ignored issues are excluded from "Copy Fix Prompt" and "Fix Now"
  - Summary shows count of ignored issues

### Fixed
- **False Positive Filter**: Parameters already prefixed with underscore (e.g., `_expect`, `_authToken`) are no longer flagged as unused - underscore prefix is the standard convention for intentionally unused parameters
- **Removed incorrect login import guideline**: The rule suggesting `import { login } from "@checksum/utils/login"` was wrong - `login` correctly comes from `init()`. Added clear documentation explaining the correct pattern

### Improved
- **Line Content Preview**: Issues in the webview now show a preview of the actual code on that line, helping verify line number accuracy

### Changed
- **Major Refactoring**: Comprehensive codebase cleanup for maintainability and testability

### Refactored
- **Decomposed God Object**: Split `anthropicService.ts` from 1,305 lines into focused modules:
  - `services/ai/prompts.ts` - SYSTEM_PROMPT constant
  - `services/ai/responseParser.ts` - Response parsing and validation
  - `services/detection/deterministicDetector.ts` - Regex pattern detection
  - `services/detection/checksumAIAnalyzer.ts` - checksumAI block analysis
  - `services/detection/lineCorrector.ts` - Line number correction
- **Extracted AST Detectors**: Moved AST-based detection from `importParser.ts` (754 lines) to dedicated `services/detection/astDetector.ts`
- **Centralized Types**: Created `types/` module with discriminated unions for type safety:
  - `severity.ts` - Severity type definitions
  - `issues.ts` - LintIssue, GitIssue, ImportedFileIssue types
  - `lint-result.ts` - Result container types
- **Consolidated Git Safety**: Created `services/git/gitSafetyChecker.ts` service
- **Centralized Output Formatting**: Created `output/` module:
  - `outputFormatter.ts` - Unified output channel formatting
  - `diagnosticReporter.ts` - Diagnostic handling utilities
- **Added Dependency Injection**: Created `services/serviceFactory.ts` for testability

### Removed
- **Dead Code**: Deleted unused files and methods (~390 lines):
  - `commands/checkImports.ts` - Never imported
  - `commands/lintTestFile.ts` - Exported but never used
  - `buildUserPrompt()` method - Defined but never called
  - Unused public methods in `pathResolver.ts`

### Improved
- Reduced largest file from 1,305 to 139 lines (anthropicService.ts)
- Clear module boundaries (types, services, commands, output)
- Better separation of concerns with single-responsibility modules
- Enabled unit testing through dependency injection

---

## [2026-01-21]

### Added
- **Webview Results Panel**: New rich UI panel displays lint results in the editor area
  - Click-to-navigate: Click any issue to jump to that line
  - Issues grouped by file, severity, and rule
  - Collapsible file sections
  - "Fix Now" button to copy fix prompt and open Cursor chat
  - "Re-run Lint" button for quick re-linting
  - "Copy Fix Prompt" button
  - Individual fix icons on each issue
  - Empty state when no issues found
- **Simplified Context Menu**: Single "Run AI Lint" option (does both git check and file lint)
- **Copy Fix Prompt in Context Menu**: Added to right-click menu for quick access

### Changed
- Fix prompts now exclude `waitForTimeout` issues (hard to auto-fix)
- Removed separate "AI Lint Only" and "Git Safety Check Only" commands from command palette

---

## [2026-01-16]

### Fixed
- Skip `unwrapped_waitForSelector` and `unwrapped_waitForURL` rules when inside checksumAI blocks
- Previously only `waitForTimeout` and `waitForLoadState` were skipped when wrapped

---

## [2026-01-15]

### Fixed
- Enhanced linting rules to skip both `waitForTimeout` and `waitForLoadState` calls inside checksumAI blocks with descriptions

---

## [2026-01-13]

### Added
- Nested import linting: imports are now followed up to 2 levels deep
- Imported file issues appear in VS Code Problems panel

### Fixed
- Improved JSON parsing to handle Claude's verbose responses
- Added comprehensive logging for debugging import resolution

### Changed
- Removed debug artifacts

---

## [2026-01-12]

### Added
- **Copy Fix Prompt**: New command to copy AI-generated fix prompt for linting results
- **Folder Linting**: Lint all test files in a folder via right-click context menu
  - Progress reporting with cancellation support
  - Batch processing of multiple test files
- **Last Linted Timestamp**: Tracks when files were last linted

### Changed
- Enhanced anthropicService to validate bug annotations and detect const declarations

---

## [2026-01-07]

### Added
- Comment line detection: Linter now skips commented-out lines
- Detection of assertions within checksumAI blocks to reduce false positives
- Skip Node.js built-in modules during package import validation

### Fixed
- Improved accuracy of issue reporting by ignoring non-relevant lines

---

## [2026-01-06]

### Added
- **Minimum Confidence Threshold**: New setting to filter AI-detected issues by confidence level
- Confidence scores displayed in diagnostic messages

### Changed
- Updated guidelines: hardcoded environment strings in `login()` calls are now acceptable

---

## [2025-12-18]

### Added
- **Imported File Analysis**: Recursively lint imported files (up to 2 levels)
- New linting rules for detecting unused imports and parameters
- Type usage validation in utility files
- Checksum Best Practices documentation (README)
- Guidelines for utility files, code hygiene, and checksumAI usage

### Changed
- Enhanced checksumAI validation and logging
- Improved line number accuracy for checksumAI-related issues
- `login()` functions should be wrapped in checksumAI to prevent false positives

---

## [2025-12-16]

### Added
- Initial release
- Environment configuration files (.env.backup, env.example)
- ChecksumAPI class with `build_internal_id_mapping` method
- Core linting functionality with Anthropic Claude integration
- Git safety checks for imports
- VS Code Problems panel integration
- Status bar button for quick access
- Keyboard shortcut (Cmd+Shift+L)
