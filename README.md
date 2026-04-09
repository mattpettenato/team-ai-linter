# Team AI Linter

AI-powered test linting for Playwright/Checksum tests in VS Code and Cursor.

## Features

- **AI Test Linting** - Analyzes tests against best practices using Claude API
- **Git Safety Checks** - Verifies all imports are tracked by git
- **Rich Results Panel** - Interactive webview with filtering, click-to-navigate, and one-click fixes
- **Folder & Multi-File Linting** - Lint entire folders or select multiple files/folders at once
- **Spell Checking** - Catches typos in test descriptions and comments
- **Imported File Analysis** - Recursively lints imported utility files (up to 2 levels deep)

## Installation

### Quick Install

```bash
cd team-ai-linter
./reinstall.sh
```

### Manual Install

```bash
npm install
npm run package
# Then: Extensions → ... → "Install from VSIX..."
```

## Setup

### 1. Configure API Key

1. Open Command Palette (`Cmd+Shift+P`)
2. Run: `Team AI Linter: Configure .env Path`
3. Select your `.env` file containing:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### 2. Auto-Updates

The extension automatically checks for updates on startup and every 4 hours. When a new version is available, you'll get a notification with options to Install, Remind Later, or Skip.

To disable auto-checks, set `teamAiLinter.autoUpdate` to `false` in VS Code settings. You can always check manually via `Team AI Linter: Check for Updates`.

### 3. Custom Rules (Optional)

Create `.ai-linter/rules.md` in your project root, or set a global rules path in settings.

## Usage

### Keyboard Shortcut

`Cmd+Shift+L` (Mac) / `Ctrl+Shift+L` (Windows) - Run linter on current file

### Editor Title Bar

Click the beaker icon when viewing a test file.

### Context Menu (Right-Click)

- **On a test file**: "Run AI Lint"
- **On a folder**: "Lint All Test Files in Folder"
- **On multiple files**: Select files → "Lint Selected Test Files"
- **On multiple folders**: Select folders → "Lint All Test Files in Folder"

## Results Panel

The results panel shows all issues with interactive features:

| Feature | Description |
|---------|-------------|
| **Click to Navigate** | Click any issue to jump to that line |
| **Filter by Severity** | Show only errors, warnings, or info |
| **Ignore Issues** | Click ✕ to ignore individual issues |
| **Bulk Ignore** | Toggle to ignore all `waitForTimeout` or `.nth()` issues |
| **Fix Now** | Copies fix prompt and opens Cursor chat |
| **Copy Fix Prompt** | Copies all issues as a prompt for AI fixing |
| **Expand/Collapse** | Expand or collapse file sections |
| **Clean Files** | Files with no issues show ✔ checkmark |

## Configuration

Settings available in VS Code settings (`Cmd+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `teamAiLinter.envFilePath` | - | Path to .env file with ANTHROPIC_API_KEY |
| `teamAiLinter.globalRulesPath` | - | Absolute path to global rules file |
| `teamAiLinter.rulesPath` | `.ai-linter/rules.md` | Workspace-relative rules path |
| `teamAiLinter.model` | `claude-sonnet-4-20250514` | Claude model (sonnet/opus/haiku) |
| `teamAiLinter.minConfidence` | `0.5` | Minimum confidence threshold (0.0-1.0) |
| `teamAiLinter.ignoreNthSelectors` | `false` | Ignore .nth() selector warnings |
| `teamAiLinter.autoUpdate` | `true` | Auto-check GitHub Releases for updates |

## What It Checks

### AI Lint Rules

- **checksumAI descriptions** - Vague, misleading, or missing descriptions
- **Locator best practices** - Avoid `.nth()`, prefer data-testid/role
- **Race conditions** - `waitForTimeout`, `networkidle` usage
- **Hardcoded values** - Dates, URLs, environment strings
- **Type safety** - Unsafe `as` assertions, silent fallbacks
- **Code quality** - Unused parameters, wrong imports, empty catch blocks
- **Spell checking** - Typos in descriptions and comments

### Git Safety

- **Untracked imports** - Files not added to git
- **Missing files** - Imports that don't resolve
- **Uncommitted changes** - Files with local modifications
- **Missing packages** - npm packages not in package.json

## Commands

| Command | Description |
|---------|-------------|
| `Run AI Lint` | Lint current file (AI + git checks) |
| `Configure .env Path` | Set API key location |
| `Configure Guidelines Path` | Set global rules file |
| `Lint All Test Files in Folder` | Lint all tests in selected folder(s) |
| `Lint Selected Test Files` | Lint multiple selected files |
| `Copy Fix Prompt` | Copy issues as AI fix prompt |
| `Check for Updates` | Manually check for new versions |

## Releasing a New Version

CI automatically builds and publishes releases when you push a version tag.

```bash
# 1. Bump the version in package.json (e.g. 0.4.0 → 0.5.0)

# 2. Commit the version bump
git add package.json
git commit -m "chore: bump version to 0.5.0"

# 3. Create an annotated tag and push
git tag -a v0.5.0 -m "v0.5.0 - description of changes"
git push origin main v0.5.0
```

GitHub Actions will:
1. Check out the tagged commit
2. Run `npm ci`, type-check, and lint
3. Package the `.vsix` with `@vscode/vsce`
4. Create a GitHub Release with the `.vsix` attached

Team members with the extension installed will be automatically notified of the new version (if they have a GitHub token configured and `autoUpdate` enabled).
