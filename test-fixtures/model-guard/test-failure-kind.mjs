// Hermetic subprocess checks: only a throwaway key and a loopback HTTP server.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = new URL('./check-models.mjs', import.meta.url)
const { ANTHROPIC_API_KEY: _realKey, ...safeEnv } = process.env
const temp = mkdtempSync(join(tmpdir(), 'model-guard-kind-'))
let respond = () => 200
const server = createServer((req, res) => {
  res.writeHead(respond(req))
  res.end('{}')
})

async function check(name, { status = 200, key = 'test-key', strict = '1', kind, exit = 1 }) {
  let firstPath
  respond = typeof status === 'function' ? req => {
    firstPath ??= req.url
    return status(req.url === firstPath)
  } : () => status
  const output = join(temp, 'output')
  const existing = 'existing=value\n'
  writeFileSync(output, existing)
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(script)], {
      env: {
        ...safeEnv,
        ANTHROPIC_API_KEY: key,
        MODEL_GUARD_STRICT: strict,
        GITHUB_OUTPUT: output,
        MODEL_GUARD_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    })
    let stderr = ''
    child.stdout.resume()
    child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stderr }))
  })
  assert.equal(result.signal, null, `${name}: unexpected signal`)
  assert.equal(result.code, exit, `${name}: exit code; ${result.stderr}`)
  const written = readFileSync(output, 'utf-8')
  if (kind) {
    const marker = { key: /ANTHROPIC_API_KEY/, stale: /STALE MODEL/, infra: /after 3 attempts/ }[kind]
    const firstFail = result.stderr.split(/\r?\n/).find(line => line.trimStart().startsWith('FAIL') && marker.test(line))
    assert.ok(firstFail, `${name}: missing FAIL console line`)
    assert.equal(written, `${existing}kind=${kind}\ndetail=${firstFail.trim().slice(0, 300)}\n`, `${name}: failure outputs`)
  } else {
    assert.equal(written, existing, `${name}: successful/skipped guard must not write outputs`)
  }
  console.log(`  PASS  model-guard-kind: ${name}`)
}

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  // This case also detects missing output support without sending any request.
  await check('empty key in strict mode', { key: '', kind: 'key' })
  await check('HTTP 401', { status: 401, kind: 'key' })
  await check('HTTP 403', { status: 403, kind: 'key' })
  await check('HTTP 404', { status: 404, kind: 'stale' })
  await check('HTTP 500 after retries', { status: 500, kind: 'infra' })
  await check('mixed 404/401 prioritizes key', { status: first => first ? 404 : 401, kind: 'key' })
  await check('all HTTP 200', { exit: 0 })
  await check('empty key outside strict mode', { key: '', strict: '0', exit: 0 })
} catch (err) {
  console.error(`  FAIL  model-guard-kind: ${err.message}`)
  process.exitCode = 1
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  rmSync(temp, { recursive: true, force: true })
}
