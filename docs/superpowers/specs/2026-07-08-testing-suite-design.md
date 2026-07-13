# Testing Suite Design — team-ai-linter (PE-271)

**Date:** 2026-07-08
**Linear:** [PE-271](https://linear.app/checksum-ai/issue/PE-271/create-full-testing-suite-for-ai-linter-to-catch-bugs-before-every) (CE tracking: CE-8901)
**Status:** Approved (user + three 10-model Senate review rounds)

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
- Git safety checker (`gitSafetyChecker.ts`) — fixtures must create **hermetic temp git repos** (`git init` in a temp dir, scripted commits/dirty state), each setting local `user.name`/`user.email` before the first commit — CI runners have no global git identity and `git commit` fails without it; this is the highest-setup-cost suite, scope it accordingly
- AST detector (`astDetector.ts`)

**P0 regression test (bug #2):** a fixture test that runs the `runAllChecks` orchestration with an `AnthropicService` that throws, and asserts deterministic + AST issues are still produced.

- **Assertion rule:** exact expected diagnostic count against a **minimal frozen fixture** that exercises only the rules under test, with the expected count documented in the test. Never assert counts against a broad fixture — every new detector rule would break it.
- **Feasibility gate (explicit plan step, not an assumption):** verify `runAllChecks` actually runs under the existing mock-vscode harness before building on it. The orchestrator touches DiagnosticCollection, output channel, webview panel, and `window.show*`; if mocking those balloons, fall back to extracting/exercising the detection-orchestration function directly rather than the full command handler.

**Convention:** every new fixture suite follows the existing exit-code contract (non-zero on failure, per-case pass/fail lines) so aggregation stays mechanical.

**Entry points:**

- `npm test` = `check-types` + `lint` + all fixture suites + static model check. **Hermetic — no network, no API key.** Runs identically offline, on forks, everywhere. `npm test` **absorbs** `test:all`: `test:all` becomes an alias (or is deleted) so there is exactly one aggregator.
- `npm run test:model-guard` = live API check (below). CI-invoked only, never part of `npm test`.

### 2. Model guard (bug #1) — two tiers

**Static check (in `npm test`, runs everywhere):** parse `package.json` → assert:

- the `teamAiLinter.model` default is a member of the settings `enum`
- the enum is non-empty
- every id matches `^claude-[a-z0-9]+(-[a-z0-9]+)*(-[0-9]{8})?$` (catches obvious typos/garbage; the live check is the real staleness guard)

Zero network; catches default/enum drift in the diff that introduces it.

**Live check (`test-fixtures/model-guard/check-models.mjs`):** reads the default + enum from `package.json` and probes each configured id with `GET /v1/models/{id}` using `ANTHROPIC_API_KEY`.

- **Per-id probe, not list-membership.** The settings enum contains shorthand/alias ids (e.g. the current default `claude-sonnet-4-6`) that resolve fine on API calls but are not returned verbatim by the `/v1/models` list (which returns dated canonical ids) — list-membership would fail a working model. The retrieve endpoint resolves aliases and sidesteps pagination entirely.
- **Failure taxonomy per probe:** HTTP 404 → **fail (stale model)**. HTTP 401/403 → **fail (bad key — infra error, distinct message)**. Transient network/5xx/429 → brief retry (3 attempts, backoff), then **fail (infra error, distinct message)**. Never conflate infra errors with staleness.
- **Strict mode is workflow plumbing, not script inference.** The script takes `--strict` (or `MODEL_GUARD_STRICT=1`). Non-strict + no key → exit 0 with a `::warning::` annotation (fork PRs). Strict + no key → **fail**. The script never guesses its context from `github.event_name` — inside a reusable workflow that is `workflow_call` and useless.

**Cadence:** model staleness is time-based, not code-based. In addition to PR/release runs, a nightly scheduled run on `main` executes the live guard in strict mode. The nightly job carries an `if: failure()` step that **opens/updates a GitHub issue** — a red X on a cron nobody watches is not "caught within 24h". Note: internal (non-fork) PRs get secrets, so a model retirement will also red-out unrelated PRs until fixed; that is accepted and is exactly the loudness we want.

### 3. E2E layer (expand the seed)

Same mocha + `@vscode/test-electron` harness (`src/test/`). New suites beyond `mdTitle.e2e.test.ts`:

- **Full `runAll` flow** on a fixture workspace: deterministic + AST paths produce expected diagnostics (AI path failing per below — no suite requires a successful AI response).
- **AI-failure regression (bug #2, integration copy):** deterministic checks still publish diagnostics when the AI call fails.
- **Diagnostics contract:** diagnostics published to the collection with correct severity/range.
- **Folder lint** (`teamAiLinter.lintFolder`) — deferred until the above are green; breadth is the main scope-creep risk.

**AI-failure plumbing (verified, not assumed):** `@anthropic-ai/sdk` (installed version) reads `ANTHROPIC_BASE_URL` in its constructor via `readEnv`, and `anthropicService.ts` constructs `new Anthropic({ apiKey })` with no `baseURL` override — so the env var wins with **zero product-code change** (verified against `node_modules` source on 2026-07-08; re-verify if the SDK is upgraded).

- Point `ANTHROPIC_BASE_URL` at a **closed localhost port** → instant `ECONNREFUSED`. Never use an unroutable IP: TCP black hole × SDK default timeout × 2 retries = a hung test.
- `ANTHROPIC_BASE_URL` must be set on the **extension-host launch** (the `extensionTestsEnv` option of `runTests()` from `@vscode/test-electron`), not merely the runner process.
- **The API key does NOT come from `process.env`** — `envLoader.ts` reads `ANTHROPIC_API_KEY` from a `.env` file at the `teamAiLinter.envFilePath` setting and validates it (≥10 chars). The E2E harness must write a dummy `.env` (e.g. `ANTHROPIC_API_KEY=sk-ant-test-dummy-key`) into the fixture workspace and set `teamAiLinter.envFilePath` in the workspace settings, or the lint flow aborts on "missing key" before ever reaching the network layer.
- **No mock HTTP server.** Every listed suite asserts deterministic/AST behavior only; the refused connection covers all of them. Build an Anthropic-shaped mock only when a future test actually needs a successful AI response.

**CI mechanics:** the e2e job builds first (`pretest:e2e` already compiles), and caches the VS Code download (`~/.vscode-test`) keyed on the VS Code version to cut flake and time.

### 4. CI

**New `.github/workflows/test.yml`:**

```yaml
on:
  pull_request:
  schedule: [{cron: '0 6 * * *'}]
  workflow_call:
    inputs:
      model_guard_strict: {type: boolean, default: false}
    secrets:
      ANTHROPIC_API_KEY: {required: false}
```

Jobs (all on `ubuntu-24.04` — `ubuntu-latest` rolls forward and isn't a pin):

- **`unit`** (hard gate): `npm ci` → `npm test`. Runs on `pull_request` + `workflow_call`; **skipped on `schedule`** (`if: github.event_name != 'schedule'`).
- **`model-guard`**: runs on all three triggers. Strict when `inputs.model_guard_strict == true` **or** `github.event_name == 'schedule'`; otherwise warn-and-skip on missing key. The empty-key strict failure is enforced by an explicit workflow step (GHA injects `""` for missing secrets — it never fails on its own). Nightly failure opens/updates a GitHub issue (`if: failure()`). The job declares `permissions: {contents: read, issues: write}` — the default token can't create issues, and a partial `permissions:` block zeroes every unlisted scope (omit `contents: read` and `actions/checkout` breaks).
- **`e2e`**: `xvfb-run -a npm run test:e2e`, `needs: unit`, skipped on `schedule`. **`continue-on-error: true` initially.** Flip to required is owned by a Linear sub-task of PE-271 with a due date 2 weeks after first merge — "≈20 green runs" is not machine-measurable and unowned heuristics never flip. Until the flip, releases are soft-gated on E2E **by design** — do not "fix" the `continue-on-error` when red E2E doesn't block a tag.

**Release blocking = `unit` + `model-guard` (strict), never the aggregate** — a green aggregate can mask a `continue-on-error` e2e.

**`release-extension.yml`:** packaging job gains `needs: test` where the `test` job is:

```yaml
uses: ./.github/workflows/test.yml
with: {model_guard_strict: true}
secrets: inherit
```

`secrets: inherit` is mandatory — reusable workflows do NOT inherit caller secrets; omitting it silently no-ops the guard on every release (bug #1 again). With `model_guard_strict: true`, a missing/empty repo secret **fails the tag build** instead of skipping.

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
- E2E in CI on PRs + releases, initially non-blocking; flip owned by a dated Linear sub-task.
- Keep ad-hoc tsx scripts; no runner migration. `npm test` is the single aggregator.
- Bug-#2 regression lives primarily in the fixture layer (fast, hermetic), secondarily in E2E — with an explicit feasibility gate on the mock harness.
- `npm test` stays offline-safe; live guard is a separate CI-only script.
- Guard strictness is an explicit `workflow_call` input threaded from the release workflow — never inferred by the script from GitHub context or key presence.
- Senate round 1 (9/10): `secrets: inherit`, guard cadence cron, `ANTHROPIC_BASE_URL` mock plumbing, E2E soft-gate rollout.
- Senate round 2 (8/10): `model_guard_strict` input, schedule job-scoping, ECONNREFUSED + dummy key + `extensionTestsEnv`, no mock server, minimal-fixture count rule, failure taxonomy, `ubuntu-24.04`, cron failure alerting, hermetic git fixtures. Kimi's claim that SDK ^0.32.1 lacks `ANTHROPIC_BASE_URL` support was checked against installed source and refuted.
- Senate round 3 (9/10): per-id `GET /v1/models/{id}` probe replaces list-membership + pagination (shorthand ids like the current default `claude-sonnet-4-6` aren't in the list payload — verified against repo commit `2e27d93`); `permissions: {contents: read, issues: write}` on the nightly job; dummy key provisioned via fixture-workspace `.env` + `envFilePath` (envLoader reads the file, not `process.env` — verified `envLoader.ts:64`); git identity per temp repo.
