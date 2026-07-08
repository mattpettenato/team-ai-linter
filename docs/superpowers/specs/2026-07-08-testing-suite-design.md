# Testing Suite Design — team-ai-linter (PE-271)

**Date:** 2026-07-08
**Linear:** [PE-271](https://linear.app/checksum-ai/issue/PE-271/create-full-testing-suite-for-ai-linter-to-catch-bugs-before-every)
**Status:** Approved (user + 9/10-model Senate review)

## Problem

The extension has no CI-enforced test gate. Two bugs shipped silently:

1. **Stale default model** — the default Claude model id (and the settings enum) went 404; the extension was fully broken on default config. Found only by a manual E2E run during PE-209.
2. **Deterministic detection gated on AI success** — any Claude API failure silently disabled all regex/AST rule checks.

Existing infra (not in CI): ~6 tsx fixture scripts under `test-fixtures/` with a mock-vscode harness (`npm run test:all`), plus a seed `@vscode/test-electron` E2E harness (`npm run test:e2e`, 6 tests, `.checksum.md` title rules only). The release workflow runs only `check-types` + `eslint`. No PR workflow.

## Design

### 1. Unit/fixture layer (existing style, gaps filled)

Keep the tsx + mock-vscode pattern — no runner migration (mocha/vitest port is churn with zero new coverage). Add fixture suites under `test-fixtures/` for uncovered detectors, each with positive + negative fixtures:

- `.checksum.md` rules (title↔filename, title↔spec, orphaned story)
- Spell checker (`spellChecker.ts`)
- Git safety checker (`gitSafetyChecker.ts`)
- AST detector (`astDetector.ts`)

**P0 regression test (bug #2):** a fixture test that runs the `runAllChecks` orchestration with an `AnthropicService` that throws, and asserts deterministic + AST issues are still produced, with an exact expected diagnostic count (not just "≥1"). This is the fastest, hermetic guard for the most dangerous regression; the E2E copy (below) is integration proof, not the primary lock.

**Convention:** every new fixture suite follows the existing exit-code contract (non-zero on failure, per-case pass/fail lines) so `test:all` aggregation stays mechanical.

**Entry points:**

- `npm test` = `check-types` + `lint` + all fixture suites + static model check. **Hermetic — no network, no API key.** Runs identically offline, on forks, everywhere.
- `npm run test:model-guard` = live API check (below). CI-invoked only, never part of `npm test`.

### 2. Model guard (bug #1) — two tiers

**Static check (in `npm test`, runs everywhere):** parse `package.json` → assert the `teamAiLinter.model` default is a member of the settings `enum`, the enum is non-empty, and every id matches the versioned-id shape (`claude-*`). Zero network; catches typos and default/enum drift in the diff that introduces them.

**Live check (`test-fixtures/model-guard/check-models.mjs`):** reads the default + enum from `package.json`, calls Anthropic `GET /v1/models` with `ANTHROPIC_API_KEY`, fails if any configured id is absent from the live list.

- Key present, id missing → **fail**.
- Key present, transient network/5xx → brief retry, then fail with a distinct infra-error message.
- Key absent → behavior depends on context: on fork PRs, exit 0 with a GitHub Actions warning annotation (`::warning::`); on release-tag runs the workflow marks the key **required**, so a missing repo secret fails the run rather than silently skipping (this is how bug #1 shipped).

**Cadence:** model staleness is time-based, not code-based. In addition to PR/release runs, a nightly `schedule:` cron on `main` runs the live guard so an Anthropic model retirement is caught within 24h, not at the next unrelated PR.

### 3. E2E layer (expand the seed)

Same mocha + `@vscode/test-electron` harness (`src/test/`). New suites beyond `mdTitle.e2e.test.ts`:

- **Full `runAll` flow** on a fixture workspace: deterministic + AST paths produce expected diagnostics.
- **AI-failure regression (bug #2, integration copy):** point the extension host at a dead/mock endpoint via `ANTHROPIC_BASE_URL` (the Anthropic SDK reads this env var natively — no product-code change), assert deterministic checks still publish diagnostics.
- **Diagnostics contract:** diagnostics published to the collection with correct severity/range.
- **Folder lint** (`teamAiLinter.lintFolder`) — deferred until the above are green; breadth is the main scope-creep risk.

AI calls in E2E are never live: `ANTHROPIC_BASE_URL` targets a local mock server (or an unroutable port for the failure case) started by the test harness.

### 4. CI

**New `.github/workflows/test.yml`** with `pull_request`, `workflow_call`, and `schedule` (nightly, live model guard only) triggers. Jobs:

- **`unit`** (hard gate): `npm ci` → `npm test` (includes check-types, lint, static model check, all fixture suites incl. the P0 bug-#2 regression).
- **`model-guard`**: `npm run test:model-guard` with `ANTHROPIC_API_KEY` from repo secrets. Required on release-tag invocations; warn-and-skip on secretless fork PRs.
- **`e2e`**: `xvfb-run -a npm run test:e2e` on pinned `ubuntu-latest`, `needs: unit`. **`continue-on-error: true` initially**; flip to required after ~20 consecutive green runs. A brand-new E2E suite as a day-one release blocker is how CI gets disabled.

**`release-extension.yml`:** packaging job gains `needs: test` via a `uses: ./.github/workflows/test.yml` job **with `secrets: inherit`** — reusable workflows do NOT inherit caller secrets by default; omitting this silently no-ops the model guard on every release (recreating bug #1). On tag runs the model guard treats a missing key as failure.

**One-time setup:** add `ANTHROPIC_API_KEY` to GitHub repo secrets.

### 5. Docs

Rewrite the CLAUDE.md "Testing" section (currently "No automated test suite"): the three layers, the commands (`npm test`, `npm run test:model-guard`, `npm run test:e2e`), how to add a fixture suite, and the CI gates. `package.json` scripts are the source of truth; docs point at exact commands.

## Acceptance mapping (PE-271)

| Criterion | Covered by |
|---|---|
| Unit tests per detector via `npm test` | §1 |
| E2E expanded from PE-209 seed | §3 |
| Guard fails CI on invalid model ids | §2 + §4 |
| CI on PRs, blocks releases | §4 |
| CLAUDE.md updated | §5 |

## Decisions log

- Live API ping over static allowlist (static-only recreates the staleness bug) — plus a hermetic static enum check that runs everywhere.
- E2E in CI on PRs + releases, initially non-blocking.
- Keep ad-hoc tsx scripts; no runner migration.
- Bug-#2 regression lives primarily in the fixture layer (fast, hermetic), secondarily in E2E.
- `npm test` stays offline-safe; live guard is a separate CI-only script.
- Senate review (9/10 quorum) findings incorporated: `secrets: inherit`, guard cadence cron, `ANTHROPIC_BASE_URL` mock plumbing, E2E soft-gate rollout.
