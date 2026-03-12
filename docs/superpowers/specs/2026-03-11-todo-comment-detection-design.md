# TODO Comment Detection

## Problem

AI agents leave `// TODO` comments when they cannot complete a task. These leftovers are a red flag — they indicate unfinished work that should never be merged. The linter should catch them as errors.

## Design

### Detection Function

Add `detectTodoComments(lines: string[]): LintIssue[]` to `deterministicDetector.ts`.

This function is separate from the existing `DETERMINISTIC_PATTERNS` loop because that loop skips comment lines. TODO detection specifically targets comments.

### Pattern

```
/^\s*(?:\/\/|\/\*|\*)\s*TODO\b/i
```

Matches:
- `// TODO ...`
- `/* TODO ... */`
- `* TODO ...` (inside block comments)

Case-insensitive. The `\b` word boundary prevents matching words like `TODOLIST`.

### Issue Shape

```typescript
{
  line: lineNumber,        // 1-indexed
  message: "TODO comment found — resolve before merging. AI agents leave TODOs when unable to complete work.",
  severity: "error",
  rule: "todo_comment",
}
```

### Integration

Called inside `detectDeterministicPatterns()` alongside the existing pattern loop and `detectASTPatterns()`. Results are concatenated into the returned issues array.

```
detectDeterministicPatterns()
  ├── existing DETERMINISTIC_PATTERNS regex loop
  ├── detectTodoComments(lines)          ← new
  ├── detectASTPatterns(...)
  └── return all issues merged
```

### Scope

- Runs on every file the linter processes (test files and imported utilities)
- Always on — no configuration toggle
- Purely deterministic — no AI involvement

### Files Changed

| File | Change |
|------|--------|
| `src/services/detection/deterministicDetector.ts` | Add `detectTodoComments()` function; call it in `detectDeterministicPatterns()` |

No changes to types, settings, AI prompts, or any other files.
