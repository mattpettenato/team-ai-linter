#!/usr/bin/env bash
# Build a vsix that includes the production node_modules tree (eslint, typescript-eslint, etc.)
# by staging into a temp directory and running vsce package from there. The repo's .vscodeignore
# is left untouched; the staging dir gets a minimal one that does NOT exclude node_modules/.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$PWD"

VERSION=$(node -p "require('./package.json').version")
OUT="$REPO_ROOT/team-ai-linter-$VERSION.vsix"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "[package:vsix] staging in $STAGE"

# 1. Build the bundle
npm run package

# 2. Copy what the vsix needs
cp -r dist package.json README.md guidelines.md LICENSE "$STAGE/"
if [ -d images ]; then
  cp -r images "$STAGE/"
fi

# 2a. Strip the vscode:prepublish script from the staged package.json — we
# already built in the source dir, and the staging dir doesn't have tsconfig
# or src/, so re-running the prepublish step would fail.
node -e "
  const fs = require('fs');
  const p = require('$STAGE/package.json');
  if (p.scripts) delete p.scripts['vscode:prepublish'];
  fs.writeFileSync('$STAGE/package.json', JSON.stringify(p, null, 2) + '\n');
"

# 3. Write a minimal .vscodeignore for the staging dir (does NOT exclude node_modules)
cat > "$STAGE/.vscodeignore" <<'EOF'
.vscode/**
.vscode-test/**
src/**
.gitignore
.env
tsconfig.json
esbuild.js
**/*.ts
**/*.map
EOF

# 4. Install only production deps into the staging dir
(cd "$STAGE" && npm install --omit=dev --omit=optional --no-audit --no-fund --silent)

# 5. Package
(cd "$STAGE" && npx --yes @vscode/vsce package --out "$OUT")

echo "[package:vsix] built $OUT"
ls -lh "$OUT"
