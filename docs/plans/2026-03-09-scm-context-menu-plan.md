# SCM Context Menu Lint Command — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Run AI Lint" to the VS Code Source Control "Changes" context menu for individual files, multi-select, and group header.

**Architecture:** A thin adapter command (`lintScmFiles`) extracts URIs from SCM resource states, filters to test files, and delegates to the existing `lintSelectedFiles()` function. Two menu contribution points in package.json wire up the context menus.

**Tech Stack:** VS Code Extension API (`SourceControlResourceState`, `SourceControlResourceGroup`), TypeScript

---

### Task 1: Add command and menu entries to package.json

**Files:**
- Modify: `package.json:26-59` (commands array)
- Modify: `package.json:61-93` (menus object)

**Step 1: Add the new command to the commands array**

In `package.json`, add this entry after the `teamAiLinter.setupGithubToken` command (after line 59):

```json
{
  "command": "teamAiLinter.lintScmFiles",
  "title": "Run AI Lint",
  "icon": "$(beaker)"
}
```

**Step 2: Add SCM menu contributions**

In the `"menus"` object in `package.json`, add two new menu contribution points after the `"explorer/context"` block (after line 92):

```json
"scm/resourceState/context": [
  {
    "command": "teamAiLinter.lintScmFiles",
    "group": "teamAiLinter"
  }
],
"scm/resourceGroup/context": [
  {
    "command": "teamAiLinter.lintScmFiles",
    "when": "scmResourceGroup == workingTree",
    "group": "teamAiLinter"
  }
]
```

**Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"`
Expected: `valid`

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add SCM context menu entries for lint command"
```

---

### Task 2: Add command handler in extension.ts

**Files:**
- Modify: `src/extension.ts:256` (after `lintSelectedFilesCmd` registration)

**Step 1: Add the lintScmFiles command handler**

In `src/extension.ts`, add the following command registration after the `lintSelectedFilesCmd` block (after line 256, before the `copyFixPrompt` block):

```typescript
// Lint files from SCM Changes context menu (right-click files or group header)
const lintScmFilesCmd = vscode.commands.registerCommand(
    'teamAiLinter.lintScmFiles',
    async (...args: unknown[]) => {
      const testFilePattern = /(test|spec)\.(ts|tsx|js|jsx)$/
      let uris: vscode.Uri[] = []

      const first = args[0] as { resourceUri?: vscode.Uri; resourceStates?: Array<{ resourceUri: vscode.Uri }> } | undefined

      if (first?.resourceStates) {
        // Invoked from group header — first arg is SourceControlResourceGroup
        uris = first.resourceStates.map(r => r.resourceUri)
      } else if (first?.resourceUri) {
        // Invoked from individual file(s) — may have multi-select in second arg
        const selected = args[1] as Array<{ resourceUri: vscode.Uri }> | undefined
        if (selected && selected.length > 0)
          uris = selected.map(r => r.resourceUri)
        else
          uris = [first.resourceUri]
      }

      if (uris.length === 0) {
        vscode.window.showErrorMessage('No files found in selection')
        return
      }

      // Filter to test files
      const testFileUris = uris.filter(uri => testFilePattern.test(uri.fsPath) || uri.fsPath.endsWith('checksum.config.ts'))
      const skippedCount = uris.length - testFileUris.length

      if (testFileUris.length === 0) {
        vscode.window.showInformationMessage(`No lintable test files in selection (${skippedCount} file${skippedCount !== 1 ? 's' : ''} skipped)`)
        return
      }

      if (skippedCount > 0)
        vscode.window.showInformationMessage(`Linting ${testFileUris.length} of ${uris.length} files (${skippedCount} non-test file${skippedCount !== 1 ? 's' : ''} skipped)`)

      const envPath = await ensureEnvConfigured()
      if (!envPath)
        return

      await lintSelectedFiles(testFileUris, diagnosticProvider, envPath)
    }
)
context.subscriptions.push(lintScmFilesCmd)
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check-types`
Expected: No errors

**Step 3: Verify lint passes**

Run: `npm run lint`
Expected: No errors

**Step 4: Build the extension**

Run: `npm run compile`
Expected: Successful build

**Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add SCM context menu command handler for linting changed files"
```

---

### Task 3: Manual verification

**Steps:**
1. Run `npm run package` to build production .vsix
2. Install in Cursor/VS Code
3. Open a project with modified test files (unstaged)
4. In the Source Control panel, under "Changes":
   - Right-click a single test file → verify "Run AI Lint" appears → click it → verify linting runs
   - Multi-select test files → right-click → verify "Run AI Lint" → click → verify all selected are linted
   - Right-click a non-test file → verify "Run AI Lint" appears → click → verify skip message shown
   - Right-click the "Changes" group header → verify "Run AI Lint" appears → click → verify all test files in group are linted
5. Verify "Staged Changes" group header does NOT show "Run AI Lint"
