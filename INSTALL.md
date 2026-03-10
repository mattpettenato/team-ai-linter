# Team AI Linter — Installation Guide

## 1. Remove Any Old Version

If you have a previous version of Team AI Linter installed:

1. Open the **Extensions** sidebar (`Cmd+Shift+X`)
2. Search for **Team AI Linter**
3. Click the gear icon → **Uninstall**
4. Reload the window (`Cmd+Shift+P` → "Reload Window")

## 2. Download & Install the Extension

1. Download the `.vsix` file from [Google Drive](https://github.com/mattpettenato/team-ai-linter/releases/download/v0.4.6/team-ai-linter-0.4.6.vsix)
2. In VS Code / Cursor, open the Command Palette (`Cmd+Shift+P`)
3. Run **"Extensions: Install from VSIX..."**
4. Select the downloaded `.vsix` file
5. Reload the window when prompted

## 3. Configure the Anthropic API Key

The extension needs an `ANTHROPIC_API_KEY` to call Claude. If you already have a `.env` file with this key:

1. Open the Command Palette (`Cmd+Shift+P`)
2. Run **"Team AI Linter: Configure .env Path"**
3. Enter the full path to your `.env` file (e.g. `/Users/you/project/.env`)

## 4. You're Done

- **Lint a file**: Open a test file and press `Cmd+Shift+L` (or click the beaker icon in the status bar)
- **Auto-updates**: The extension checks for new versions automatically. When an update is available, you'll get a notification to install it with one click — no manual downloads needed going forward.
