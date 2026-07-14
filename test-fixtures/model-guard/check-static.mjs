// test-fixtures/model-guard/check-static.mjs
// Hermetic guard: the configured default model must be a member of the settings
// enum, the enum must be non-empty, and every id must look like a Claude model
// id. Catches default/enum drift in the diff that introduces it. No network.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf-8'))

const modelCfg = pkg.contributes?.configuration?.properties?.['teamAiLinter.model']
const failures = []

if (!modelCfg) failures.push('teamAiLinter.model missing from contributes.configuration')
const def = modelCfg?.default
const enumIds = modelCfg?.enum ?? []

if (!Array.isArray(enumIds) || enumIds.length === 0) failures.push('model enum is empty')
if (!def) failures.push('model default is empty')
if (def && enumIds.length > 0 && !enumIds.includes(def))
  failures.push(`default "${def}" is not in the enum [${enumIds.join(', ')}]`)

const ID_SHAPE = /^claude-[a-z0-9]+(-[a-z0-9]+)*(-[0-9]{8})?$/
for (const id of [def, ...enumIds].filter(Boolean)) {
  if (!ID_SHAPE.test(id)) failures.push(`id "${id}" does not match Claude id shape ${ID_SHAPE}`)
}

if (failures.length > 0) {
  for (const f of failures) console.log(`  FAIL  static-model-check: ${f}`)
  process.exit(1)
}
console.log(`  PASS  static-model-check: default "${def}" ∈ enum(${enumIds.length}), all ids well-formed`)
