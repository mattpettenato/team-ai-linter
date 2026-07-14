// Live guard: probe GET /v1/models/{id} for the default + every enum id.
// Per-id probe (NOT list-membership): the enum holds alias ids like
// "claude-sonnet-4-6" that the list payload does not return verbatim; the
// retrieve endpoint resolves aliases and needs no pagination.
//
// Exit contract:
//   404 on any id                      -> exit 1  (stale model — the real failure)
//   401/403                            -> exit 1  (bad key — infra, distinct message)
//   network/5xx/429 after 3 attempts   -> exit 1 strict / exit 0 + ::warning:: otherwise
//                                         (infra, not staleness — a provider outage
//                                          must not red unrelated PRs)
//   no ids found in package.json       -> exit 1  (vacuous run — guard checked nothing)
//   no key, strict                     -> exit 1
//   no key, not strict                 -> exit 0  + ::warning:: annotation
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const strict = process.argv.includes('--strict') || process.env.MODEL_GUARD_STRICT === '1'
const apiKey = process.env.ANTHROPIC_API_KEY

if (!apiKey) {
  if (strict) {
    console.error('  FAIL  model-guard: ANTHROPIC_API_KEY is empty in strict mode (release/nightly). Configure the repo secret.')
    process.exit(1)
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
  console.error('  FAIL  model-guard: no model ids found in package.json (default/enum missing) — guard would validate nothing')
  process.exit(1)
}

async function probe(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res
    try {
      res = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(id)}`, {
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
    if (res.status === 401 || res.status === 403) return { id, kind: 'auth', detail: `HTTP ${res.status}` }
    if (attempt === 3) return { id, kind: 'infra', detail: `HTTP ${res.status} after 3 attempts` }
    await new Promise(r => setTimeout(r, attempt * 1000))
  }
}

const results = await Promise.all(ids.map(probe))
let failed = false
for (const r of results) {
  if (r.kind === 'ok') { console.log(`  PASS  model-guard: ${r.id} is live`); continue }
  if (r.kind === 'infra' && !strict) {
    // Transient provider trouble (outage, sustained 429) is not staleness —
    // don't red unrelated PRs over it. Strict (release/nightly) still fails.
    console.log(`::warning title=model-guard infra::${r.id} — ${r.detail}; live validation inconclusive, not failing PR`)
    continue
  }
  failed = true
  if (r.kind === 'stale') console.error(`  FAIL  model-guard: ${r.id} returned 404 — STALE MODEL ID. Update the default/enum in package.json.`)
  else if (r.kind === 'auth') console.error(`  FAIL  model-guard: ${r.id} — ${r.detail}. Bad/expired ANTHROPIC_API_KEY (infra, not staleness).`)
  else console.error(`  FAIL  model-guard: ${r.id} — ${r.detail} (infra, not staleness).`)
}
process.exit(failed ? 1 : 0)
