Team AI Linter

Internal User Guide

**Overview**  
The Team AI Linter is a VS Code/Cursor extension that provides AI-powered test linting and import-graph git safety checks. It helps catch issues before they cause problems in CI or code review.

Key capabilities:

* AI Test Linting: One-click analysis against configurable best practices using Claude API  
* Import-Graph Git Safety: Verifies all imports resolve and are tracked by git ("Will this test run on a clean checkout?")  
* Spell Checking: Automatic spell checking for test descriptions with a custom dictionary of 200+ tech/testing terms  
* Multi-File Linting: Lint individual files, multiple selected files, or entire folders

**Installation**

**Requirements**

* Node.js with npm  
* VS Code 1.96+ or Cursor IDE  
* Anthropic API key (each team member needs access to one)

**Quick Setup Steps**

**Step 1: Install Dependencies**  
cd team-ai-linter

npm install

**Step 2: Build and Install the Extension**  
./reinstall.sh

This script compiles, packages, and installs the extension into VS Code/Cursor automatically.

**Step 3: Configure the API Key**  
After reloading VS Code/Cursor:

1\. Open Command Palette (Cmd+Shift+P on Mac / Ctrl+Shift+P on Windows)

2\. Run: Team AI Linter: Configure .env Path

3\. Enter the path to a .env file containing your API key

The .env file should contain:

ANTHROPIC\_API\_KEY=sk-ant-...

**Updating the Linter**

When a new version is available, run the following from your terminal:

cd team-ai-linter

git pull

npm install

./reinstall.sh

Then reload Cursor (Cmd+Shift+P > "Developer: Reload Window") to pick up the changes.

**Usage**

**Running the Linter**  
There are several ways to run the linter:

**Beaker Icon:** Open any test file (.test.ts, .spec.ts, etc.) and click the beaker icon in the editor title bar

**Right-Click Menu:** Right-click in a test file and select "Run AI Lint"

**Folder Linting:** Right-click a folder in the explorer to lint all test files in it

**Multi-File Selection:** Select multiple test files in the explorer, right-click, and lint them together

**Viewing Results**  
Results appear in a rich webview panel with issues grouped by file and severity. Click any issue to jump directly to that line in your code. The panel includes:

* Severity filters (errors, warnings, info)  
* Ignore/restore functionality for individual issues  
* "Fix Now" button to copy fix prompt and open Cursor chat  
* Expand/collapse all buttons for easy navigation

**Best Practices**

**Custom Linting Rules**  
Create .ai-linter/rules.md in your project root to customize the linting rules. If no rules file exists, default rules will be used.

**Confidence Threshold**  
The linter has a configurable confidence threshold (default: 0.5). Issues below this threshold are hidden. Adjust this in VS Code settings under teamAiLinter.minConfidence if you find you're getting too many or too few results.

**Model Selection**  
You can choose between different Claude models:

* claude-sonnet-4-20250514 (default): Good balance of speed and accuracy  
* claude-opus-4-20250514: Most thorough analysis, slower  
* claude-3-5-haiku-20241022: Fastest, good for quick checks

**Ignoring False Positives**  
If the linter flags something that isn't actually an issue, click the X button next to it to ignore it. Ignored issues won't be included when you use "Copy Fix Prompt" or "Fix Now".

**What to Look Out For**

**Common Issues the Linter Catches**  
**waitForTimeout Usage:** Avoid hardcoded waits; prefer explicit wait conditions

**checksumAI Wrapper Rules:** Actions should be wrapped, but assertions and element selection should not

**Misleading Descriptions:** checksumAI descriptions should accurately describe what the code does

**Untracked Imports:** Files imported but not added to git

**Missing Packages:** npm packages not declared in package.json

**Spell Check:** Typos in test descriptions and comments

**Git Safety Checks**  
The linter verifies your test will work on a clean checkout by checking for:

* Untracked imports: Files imported but not added to git  
* Missing files: Imports that don't resolve to any file  
* Uncommitted changes: Files with local modifications  
* Missing packages: npm packages not declared in package.json

**Troubleshooting**  
**API Key Not Working:** Make sure your .env file path is correctly configured and the key starts with "sk-ant-"

**Extension Not Appearing:** After installation, reload VS Code/Cursor (Cmd+Shift+P \> "Developer: Reload Window")

**No Beaker Icon:** The icon only appears for files matching .test.ts, .spec.ts, etc.

**reinstall.sh Fails:** Ensure you have the Cursor or VS Code CLI installed (Settings \> Install 'cursor' command in PATH)

**Sharing Feedback**  
**We want your feedback\!** This tool is actively being developed and your input helps make it better.

Please share:

* False positives: Rules that flag things that aren't actually problems  
* False negatives: Issues the linter should catch but doesn't  
* Feature requests: What would make this tool more useful for your workflow?  
* Usability issues: Anything confusing or hard to use  
* Custom rules: Patterns specific to our codebase that should be added

Even small feedback is valuable\! If something seems off or could be improved, let us know. The more we hear from you, the better we can make this tool.

