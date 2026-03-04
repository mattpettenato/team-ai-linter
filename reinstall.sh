#!/bin/bash

# Reinstall Team AI Linter extension for Cursor IDE
# Usage: ./reinstall.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_ID="checksum.team-ai-linter"
VERSION=$(node -p "require('$SCRIPT_DIR/package.json').version")
VSIX_FILE="$SCRIPT_DIR/team-ai-linter-${VERSION}.vsix"

# Detect if we should use 'cursor' or 'code' CLI
if command -v cursor &> /dev/null; then
    CLI="cursor"
elif command -v code &> /dev/null; then
    CLI="code"
else
    echo "Error: Neither 'cursor' nor 'code' CLI found in PATH"
    echo "For Cursor: Settings > Install 'cursor' command in PATH"
    echo "For VS Code: Command Palette > Shell Command: Install 'code' command in PATH"
    exit 1
fi

echo "Using CLI: $CLI"

# Build the extension
echo "Building extension..."
cd "$SCRIPT_DIR"
npm run compile
npx @vscode/vsce package --skip-license

# Uninstall existing extension (ignore error if not installed)
echo "Uninstalling existing extension..."
$CLI --uninstall-extension "$EXTENSION_ID" 2>/dev/null || true

# Install the new VSIX
echo "Installing extension from VSIX..."
$CLI --install-extension "$VSIX_FILE"

echo ""
echo "Done! Reload Cursor/VS Code window to activate the extension."
echo "  Cmd+Shift+P -> 'Developer: Reload Window'"
