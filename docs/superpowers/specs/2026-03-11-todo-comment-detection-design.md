# TODO Comment Detection

## Problem

AI agents leave `// TODO` comments when they cannot complete a task. These leftovers are a red flag — they indicate unfinished work that should never be merged. The linter should catch them as errors.

## Scope Decision

Only `TODO` is targeted. Other markers (`FIXME`, `HACK`, `XXX`) are out of scope — the user explicitly scoped this to TODO and its variants only.

## Design

### Detection Function

Add `detectTodoComments(lines: string[]): LintIssue[]` to `deterministicDetector.ts`.

This function is separate from the existing `DETERMINISTIC_PATTERNS` loop because that loop skips comment lines via `isCommentLine()`. TODO detection specifically targets comments.

### Pattern

```
/(?:\/\/|\/\*|\*)\s*TODO\b/i
```

Not anchored to start-of-line — catches both dedicated comment lines and inline TODOs:
- `// TODO ...` (standalone comment line)
- `const x = 5 // TODO: fix this` (inline comment)
- `/* TODO ... */` (block comment)
- `* TODO ...` (inside multi-line block comments with `*` prefix)

Case-insensitive. The `\b` word boundary prevents matching words like `TODOLIST`.

Note: A bare `TODO` inside a multi-line block comment without a `*` prefix (e.g., `  TODO: fix this` between `/*` and `*/`) is not caught. This is an acceptable gap — standard block comment style uses `*` on continuation lines.

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

Called inside `detectDeterministicPatterns()`. Results are pushed into the same mutable `issues` array used by the existing pattern loop, before the `detectASTPatterns()` call:

```typescript
// existing pattern loop pushes into issues[]
// ...
issues.push(...detectTodoComments(lines))   // ← new
// ...
await detectASTPatterns(...)                 // pushes into issues[]
```

### AI Prompt Update

The current AI prompt in `src/services/ai/prompts.ts` states: "Single-line explanatory comments and TODO comments are acceptable and should NOT be flagged." This must be updated to reflect that TODO comments are now handled by deterministic detection and should not be flagged by the AI (to avoid contradictory guidance).

### Deduplication

Add `todo_comment` to the dedup filter in `mergeAndDeduplicateIssues()` so if the AI ever reports a TODO-related issue, it won't duplicate the deterministic detection.

### Spell Checker

The existing spell checker in `spellChecker.ts` already skips `TODO:` markers when processing comments. No interaction issues.

### Scope

- Runs on every file the linter processes (test files and imported utilities)
- Always on — no configuration toggle
- Purely deterministic — no AI involvement

### Files Changed

| File | Change |
|------|--------|
| `src/services/detection/deterministicDetector.ts` | Add `detectTodoComments()` function; call it in `detectDeterministicPatterns()`; add `todo_comment` to dedup filter |
| `src/services/ai/prompts.ts` | Update AI prompt to note TODO comments are handled by deterministic detection |
