// Live guard: probe GET /v1/models/{id} for the default + every enum id.
// Per-id probe (NOT list-membership): the enum holds alias ids like
// "claude-sonnet-4-6" that the list payload does not return verbatim; the
// retrieve endpoint resolves aliases and needs no pagination.
//
// Exit contract:
//   404 on any id                      -> exit 1  (kind=stale)
//   401/403                            -> exit 1  (kind=key)
//   network/5xx/429 after 3 attempts   -> exit 1 strict / exit 0 + ::warning:: otherwise
//                                         (kind=infra, not staleness — a provider outage
//                                          must not red unrelated PRs)
//   no ids found in package.json       -> exit 1  (kind=other, vacuous run)
//   no key, strict                     -> exit 1  (kind=key)
//   no key, not strict                 -> exit 0  + ::warning:: annotation
// Failure-only GITHUB_OUTPUT: kind (key > stale > infra > other) and detail
// (first FAIL line of the winning kind, single-line, trimmed to 300 chars). Success writes nothing.
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const strict = process.argv.includes('--strict') || process.env.MODEL_GUARD_STRICT === '1'
const apiKey = process.env.ANTHROPIC_API_KEY
const baseUrl = process.env.MODEL_GUARD_BASE_URL || 'https://api.anthropic.com'

function fail(kind, line) {
  if (process.env.GITHUB_OUTPUT) {
    const detail = line.replace(/[\r\n]/g, '').trim().slice(0, 300)
    appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\ndetail=${detail}\n`)
  }
  process.exit(1)
}

if (!apiKey) {
  if (strict) {
    const line = '  FAIL  model-guard: ANTHROPIC_API_KEY is empty in strict mode (release/nightly). Configure the repo secret.'
    console.error(line)
    fail('key', line)
  }
  console.log('::warning title=model-guard skipped::ANTHROPIC_API_KEY not available (fork PR?) — live model validation did not run')
  process.exit(0)
}

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf-8'))
const modelCfg = pkg.contributes.configuration.properties['teamAiLinter.model']
const ids = [...new Set([modelCfg.default, ...(modelCfg.enum ?? [])])].filter(Boolean)

if (ids.length === 0) {
  // Probing nothing must not read as green — on nightly runs this script is
  // the only layer that executes at all.
  const line = '  FAIL  model-guard: no model ids found in package.json (default/enum missing) — guard would validate nothing'
  console.error(line)
  fail('other', line)
}

async function probe(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res
    try {
      res = await fetch(`${baseUrl}/v1/models/${encodeURIComponent(id)}`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        // Hung (not refused) connections otherwise stall until the GHA job timeout.
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      if (attempt === 3) return { id, kind: 'infra', detail: `network error: ${err.message}` }
      await new Promise(r => setTimeout(r, attempt * 1000))
      continue
    }
    if (res.status === 200) return { id, kind: 'ok' }
    if (res.status === 404) return { id, kind: 'stale' }
    if (res.status === 401 || res.status === 403) return { id, kind: 'key', detail: `HTTP ${res.status}` }
    if (attempt === 3) return { id, kind: 'infra', detail: `HTTP ${res.status} after 3 attempts` }
    await new Promise(r => setTimeout(r, attempt * 1000))
  }
}

const results = await Promise.all(ids.map(probe))
const priority = { other: 0, infra: 1, stale: 2, key: 3 }
let failureKind
let firstFailure
for (const r of results) {
  if (r.kind === 'ok') { console.log(`  PASS  model-guard: ${r.id} is live`); continue }
  if (r.kind === 'infra' && !strict) {
    // Transient provider trouble (outage, sustained 429) is not staleness —
    // don't red unrelated PRs over it. Strict (release/nightly) still fails.
    console.log(`::warning title=model-guard infra::${r.id} — ${r.detail}; live validation inconclusive, not failing PR`)
    continue
  }
  let line
  if (r.kind === 'stale') line = `  FAIL  model-guard: ${r.id} returned 404 — STALE MODEL ID. Update the default/enum in package.json.`
  else if (r.kind === 'key') line = `  FAIL  model-guard: ${r.id} — ${r.detail}. Bad/expired ANTHROPIC_API_KEY (infra, not staleness).`
  else line = `  FAIL  model-guard: ${r.id} — ${r.detail} (infra, not staleness).`
  console.error(line)
  // detail describes the winning kind, not whichever id failed first
  if (!failureKind || priority[r.kind] > priority[failureKind]) { failureKind = r.kind; firstFailure = line }
}
if (failureKind) fail(failureKind, firstFailure)
process.exit(0)
