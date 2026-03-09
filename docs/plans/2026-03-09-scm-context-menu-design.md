# SCM Context Menu Lint Command

## Goal

Add "Run AI Lint" to the VS Code/Cursor Source Control "Changes" context menu, supporting individual file right-click, multi-select, and group header right-click.

## Approach

Thin adapter command (`lintScmFiles`) that bridges SCM resource states to the existing `lintSelectedFiles()` pipeline. No new linting logic needed.

## Scope

### In scope

- Right-click file(s) in "Changes" list shows "Run AI Lint"
- Right-click "Changes" group header shows "Run AI Lint" (lints all changed files)
- Menu visible for all files; test file filtering happens in the command handler
- Non-test files skipped with info message showing skip count
- Multi-select supported
- Only unstaged "Changes" group (`workingTree`), not "Staged Changes"

### Out of scope

- Custom tree view with lint status indicators (future Approach 3)
- Diff-only linting (future Approach 2)
- Staged Changes support

## Files changed

1. **`package.json`** — 1 new command + 2 menu entries
2. **`src/extension.ts`** — 1 new command handler (~30 lines)

## Design details

### package.json

New command:
- `teamAiLinter.lintScmFiles` with title "Run AI Lint" and `$(beaker)` icon

New menu contributions:
- `scm/resourceState/context` — no `when` clause (shows for all files), group `teamAiLinter`
- `scm/resourceGroup/context` — `when: scmResourceGroup == workingTree`, group `teamAiLinter`

### Command handler

Handles two invocation patterns:

1. **Individual file(s)**: receives `(resource: SourceControlResourceState, selectedResources: SourceControlResourceState[])`, extracts `resourceUri` from each
2. **Group header**: receives `SourceControlResourceGroup` with `resourceStates` array, extracts all `resourceUri` values

Both paths filter URIs through `/(test|spec)\.(ts|tsx|js|jsx)$|checksum\.config\.ts$/`, show skip count if applicable, then delegate to `lintSelectedFiles()`.
