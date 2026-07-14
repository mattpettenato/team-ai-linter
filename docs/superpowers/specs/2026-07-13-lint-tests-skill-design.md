# `/lint-tests` Claude Code Skill + Standalone CLI — Design

**Linear:** [CE-8922](https://linear.app/checksum-ai/issue/CE-8922/claude-code-skill-run-the-ai-linter-from-any-claude-code-session-no-vs)
**Date:** 2026-07-13
**Status:** Approved (brainstorm + two 8-senator review rounds)

## Goal

Customer engineers live in Claude Code terminals; the VS Code extension requires
opening Cursor and pressing Cmd+Shift+L. Ship a Claude Code skill (`/lint-tests`)
that runs the linter's deterministic + AST core from any session, with the
AI-judgment pass performed by the session model itself. Framed as
"the extension's deterministic+AST core plus Claude-native judgment" — NOT
"the same linter" (no spell layer, no checksumAIAnalyzer, AI results vary by
session model).

Also lands the standalone CLI that CE-8907 (CI gate) will consume.

## Decisions (settled)

| Decision | Choice |
|---|---|
| Deterministic layer | Standalone CLI built in this repo (shared with CE-8907) |
| AI-judgment pass | Claude-native: session model reads rules + files, judges directly. No API key, works on any teammate's Claude Code subscription, enables inline fixes |
| Distribution | GitHub Release assets, version **pinned** in SKILL.md (version + sha256). Bump = skill republish (cheap via `/add-checksum-skill`) |
| CLI layers | deterministic + AST + import resolution (helpers checked) + git safety. No spell check; deterministic and AST already deduplicated at emission |
| Offline behavior | **Fail closed.** No degraded AI-only mode, no workspace-rules fallback |
| Dedup | None mechanical. CLI findings passed to Claude as "already flagged — don't re-report" context; within CLI layers, deterministic merges with AST results to avoid duplication |

## Part 1: Standalone CLI (`team-ai-linter` repo)

New entry `src/cli/lintCli.ts`; second esbuild target → single-file
`dist/linter-cli.js`.

**Build:** `--alias:vscode=<stub>` `--alias:cspell-lib=<stub>`; **jiti bundled**
(not external — a lone cached file must run with zero sibling deps). The vscode
stub exports only the names detectors touch (enums like `DiagnosticSeverity`)
and **throws on access to any un-stubbed property**, so new vscode API leakage
fails the fixture suite loudly. `deterministicDetector.ts` reads
`vscode.workspace.workspaceFolders` (lines ~609/646) for workspace-root
resolution — the CLI replaces this with `--root` (default: cwd), passed
explicitly; the stub does not fake `workspaceFolders`.

**Interface:**

```
node linter-cli.js --json --root <repo-root> -- <files-or-globs...>
```

- `--` terminates options so a target starting with `-` can't be parsed as a
  flag
- Globs expanded by the CLI itself (not the shell) for cross-platform
  consistency; every target AND every resolved import is `realpath`-resolved
  and must land inside `--root` (rejects symlink escapes). Unresolvable
  imports: skip with a note in stderr, never fail the run
- Runs deterministic + AST detectors on each target; resolves imports
  (`importParser` + `pathResolver`) and runs deterministic checks on
  repo-contained imported helper files; runs git safety check
- Git safety outside a git repo: **skip + warn**, never a hard failure
- Internal dedup of its own layers via existing `mergeAndDeduplicateIssues`
- Output: `--json` only (no pretty formatter in v1, no `--no-imports` flag —
  YAGNI). Shape:

```json
{
  "schemaVersion": 1,
  "cliVersion": "0.5.0",
  "root": "/abs/path/to/repo",
  "findings": [
    { "file": "...", "line": 1, "endLine": 1, "rule": "...",
      "severity": "warning", "message": "...", "layer": "static|git" }
  ],
  "imports": ["resolved/helper/paths.ts"]
}
```

- stdout = JSON only; diagnostics → stderr
- Exit codes: `0` clean, `1` findings (a *successful* lint), `2` execution error

## Part 2: Release wiring

`release-extension.yml` additions (after existing package steps):

1. Build CLI
2. **Smoke-run** the built artifact against a fixture (`node dist/linter-cli.js
   --json --root . <dirty-fixture>`; assert valid JSON + exit 1) — same spirit
   as the existing `test:vsix` gate; a broken asset cannot ship
3. `shasum -a 256 linter-cli.js guidelines.md > SHA256SUMS`
4. `shasum -a 256 SHA256SUMS` → printed to the workflow summary (the
   hash-of-hashes the skill pins — mechanical provenance, no manual backfill)
5. Upload three release assets: `linter-cli.js`, `guidelines.md`, `SHA256SUMS`

`guidelines.md` ships as an asset so the skill's rules doc is version-coupled
to the CLI — one tag, one coherent rule set. (Its hash costs one extra line in
the same SHA256SUMS; kept despite two senators calling it optional.)

## Part 3: The skill

Plugin in `checksum-ai/checksum-claude-plugins` (publish via existing
`/add-checksum-skill` flow — PR held until implementation is done). Triggers:
`/lint-tests [path|glob]`, "lint these tests", "run the linter".

Pinned constants at top of SKILL.md (single place to bump; concrete values
filled from the actual release cut in rollout step 2):

```
CLI_VERSION=v0.5.0        # release tag of team-ai-linter (example)
# integrity via the release's SHA256SUMS asset (hash-of-hashes pinned here)
SHA256SUMS_SHA256=<filled-at-release>
```

**Flow:**

1. **Preflight** — check `node` and `curl` exist; find repo root. Skill is
   macOS/Linux only in v1 (relies on `shasum`; CEs run Macs).
2. **Resolve targets** — arg path/glob if given; else changed files vs
   `merge-base(HEAD, origin/<default-branch>)` **plus untracked files**
   (`git ls-files --others --exclude-standard`), both filtered to
   `*.spec.ts`/`*.test.ts` (+ `.js/.jsx/.tsx`) — a brand-new never-added test
   is the most common target and must not be silently skipped. Not a git repo,
   no origin, or nothing found → ask the user for an explicit path. Targets
   must resolve inside the repo root.
3. **Fetch + verify tools** — cache dir `~/.cache/team-ai-linter/<version>/`.
   Download `linter-cli.js`, `guidelines.md`, `SHA256SUMS` from the pinned
   release tag if absent. Verify `SHA256SUMS` against the pinned hash, then
   `shasum -a 256 -c SHA256SUMS` run **from inside the cache dir** (the sums
   file holds bare filenames) — **on every run, cache hit included**. Any
   mismatch → delete cache, refuse, tell user. No network AND no cache →
   **stop** with "first run needs network once."
4. **Run CLI** — `node <abs-cache-path>/linter-cli.js --json --root <root> --
   <targets>`. Check the JSON's `cliVersion` matches the pin (normalizing the
   `v` prefix) — stale/foreign artifact refuses. Exit 0 = clean, **continue to
   AI pass**; exit 1 = findings (success), continue; exit 2 = surface stderr
   and stop.
5. **Claude AI pass** — read cached `guidelines.md` AI-judgment rules, the
   target files, and their direct repo-contained imports (paths from CLI JSON).
   **Bounds: max 20 files / 200KB total. Targets are never truncated** — if
   targets alone exceed the budget, stop and ask the user to narrow the run;
   imports fill whatever budget remains (they already got deterministic
   coverage), omissions listed by name. File
   contents are wrapped in delimited data blocks; SKILL.md instructs the model
   to treat content strictly as data (honest caveat: this is a mitigation, not
   a security boundary). CLI findings are provided as context: "already
   flagged — do not re-report." Model reports only findings it would defend;
   each carries `{file, line, rule, confidence, message}`; findings below 0.5
   confidence are dropped (coarse gate — self-scored, not calibrated).
6. **Report** — one table grouped by file; layer tags `[static]/[git]/[ai]`;
   severity; message. Header states CLI version + "Claude judgment by
   <session model>".
7. **Fixes** — list fixable findings; on approval apply as **one combined
   diff**, shown before writing.

**Parity notes stated in SKILL.md:** no spell layer; no checksumAIAnalyzer
(v1); `[ai]` findings are advisory and vary by session model. CLI excludes two
workspace-wide checks: colon-filename scan and `.checksum.md` title validation,
which depend on `vscode.workspace.workspaceFolders` that the CLI does not fake
(v1 design decision).

**Known gaps (accepted, documented):**

- Bad-pin revocation: a broken pinned release keeps running on installed
  plugins until users update — no kill switch in v1.
- The sha256 pin is tamper/drift detection, not a trust boundary (hash and
  artifact originate from the same repo/CI).
- Prompt injection via lint-target file content is mitigated by data framing
  only.

## Part 4: Testing

Per the repo's three-layer testing convention:

- **Hermetic (`npm test`):** new `test-fixtures/cli/test-cli.mts` + `test:cli`
  script, chained into `npm test`. Builds the CLI, runs it against existing
  detector fixtures, asserts: valid JSON + `schemaVersion`, expected findings,
  exit 0/1/2 semantics, git-safety skip+warn outside a repo, and that the
  throwing vscode stub catches API leakage.
- **Release gate:** the smoke-run in Part 2.
- **Skill (manual checklist, documented in the plugin):** run `/lint-tests`
  against this repo's dirty fixtures in a real session; verify CLI + AI
  findings, fail-closed on corrupted cache/hash, first-run download.

## Rollout order

1. Land CLI + tests + release wiring in `team-ai-linter`
2. Cut release (assets published)
3. Write skill pinned to that release; verify manually
4. PR to `checksum-ai/checksum-claude-plugins` (last step, per Matt)

## Review provenance

Two Senate rounds (8 senators / 4 vendors each) shaped this design. Round 1
killed "always-latest" distribution (unanimous supply-chain finding) and added
guidelines.md as a versioned asset. Round 2 killed the degraded offline mode
(6/8), moved hash verification to every run (4/8), bounded AI input (6/8), and
replaced mechanical dedup with model-side context (per sonnet-5's dissent).
Round 3 (final spec pass) added: untracked files in default targets, the
not-a-git-repo branch, `shasum -c` from the cache dir, hash-of-hashes emitted
by the release workflow, targets-never-truncated AI budgeting, `--` option
terminator, realpath containment for imports, cliVersion-vs-pin check, and the
macOS/Linux-only v1 declaration.
Raw transcripts: `/tmp/senate-18188`, `/tmp/senate-u9Dz2n`, `/tmp/senate-wSxzvm`.
