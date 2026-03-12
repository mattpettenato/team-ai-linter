# TODO Comment Detection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect `// TODO` comments (and variants) in all linted files and flag them as errors, since they indicate unfinished work left by AI agents.

**Architecture:** Add a standalone `detectTodoComments()` function to the deterministic detector. It runs separately from the main pattern loop (which skips comments). Update the AI prompt and dedup filter for consistency.

**Tech Stack:** TypeScript, regex

**Spec:** `docs/superpowers/specs/2026-03-11-todo-comment-detection-design.md`

---

## Chunk 1: Implementation

### Task 1: Add `detectTodoComments()` function

**Files:**
- Modify: `src/services/detection/deterministicDetector.ts:214-216` (after `isCommentLine`)

- [ ] **Step 1: Add the `detectTodoComments` function**

Insert after the `isCommentLine` function (after line 216), before the `detectDeterministicPatterns` function:

```typescript
/**
 * Detect TODO comments left by AI agents that indicate unfinished work.
 * Runs separately from DETERMINISTIC_PATTERNS because that loop skips comment lines.
 */
export function detectTodoComments(lines: string[]): LintIssue[] {
  const issues: LintIssue[] = []
  const todoPattern = /(?:\/\/|\/\*|\*)\s*TODO\b/i

  for (let i = 0; i < lines.length; i++) {
    if (todoPattern.test(lines[i])) {
      issues.push({
        line: i + 1,
        message: 'TODO comment found — resolve before merging. AI agents leave TODOs when unable to complete work.',
        severity: 'error',
        rule: 'todo_comment',
      })
    }
  }

  return issues
}
```

- [ ] **Step 2: Call `detectTodoComments` in `detectDeterministicPatterns`**

In `detectDeterministicPatterns()`, insert the call after the utility-file-only patterns block (after line 294) and before the AST-based detections call (line 297). Add this line:

```typescript
  // Detect TODO comments (runs on all files, always on)
  issues.push(...detectTodoComments(lines))
```

The surrounding context should look like:

```typescript
    }
  }

  // Detect TODO comments (runs on all files, always on)
  issues.push(...detectTodoComments(lines))

  // AST-based detections
  await detectASTPatterns(issues, fileContent, filePath, isUtilityFile);
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run check-types`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/services/detection/deterministicDetector.ts
git commit -m "feat: add TODO comment detection as error-level lint rule"
```

---

### Task 2: Add `todo_comment` to the dedup filter

**Files:**
- Modify: `src/services/detection/deterministicDetector.ts:521-552` (inside `mergeAndDeduplicateIssues`)

- [ ] **Step 1: Add `todo_comment` to the dedup filter**

In the `isDeterministicPattern` check inside `mergeAndDeduplicateIssues()`, the last condition on line 552 is:

```typescript
           (issue.message.toLowerCase().includes('multiple') && issue.message.toLowerCase().includes('checksumai'))
```

Append ` ||` to the end of that line, then add the new conditions before the closing parenthesis on line 553:

```typescript
           (issue.message.toLowerCase().includes('multiple') && issue.message.toLowerCase().includes('checksumai')) ||
           issue.rule.toLowerCase().includes('todo_comment') ||
           (issue.message.toLowerCase().includes('todo') && issue.message.toLowerCase().includes('comment'))
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check-types`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/detection/deterministicDetector.ts
git commit -m "feat: add todo_comment to AI dedup filter"
```

---

### Task 3: Update AI prompt to reflect TODO handling

**Files:**
- Modify: `src/services/ai/prompts.ts:271-272`

- [ ] **Step 1: Update the comment about TODO comments**

Replace line 272:
```
   Single-line explanatory comments and TODO comments are acceptable and should NOT be flagged.
```

With:
```
   Single-line explanatory comments are acceptable and should NOT be flagged.
   TODO comments are handled by deterministic detection (rule: "todo_comment") — DO NOT flag them in AI analysis.
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check-types`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/ai/prompts.ts
git commit -m "feat: update AI prompt to defer TODO detection to deterministic rule"
```

---

### Task 4: Full build and lint verification

- [ ] **Step 1: Run full type check**

Run: `npm run check-types`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run production build**

Run: `npm run package`
Expected: Builds successfully, produces `dist/extension.js`
