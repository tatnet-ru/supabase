import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const example = process.argv[2]
assert.ok(
  ['examples/with-cloudflare-workers', 'examples/caching/with-cloudflare-workers-kv'].includes(
    example
  )
)
const isKv = example.includes('workers-kv')
const cwd = resolve(example)
const output = mkdtempSync(join(tmpdir(), 'worker-security-'))
const load = createRequire(resolve(cwd, 'node_modules/wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = load('miniflare')
let articles = [{ id: 1, title: 'Fixture article' }]
let reads = 0
const backend = createServer((request, response) => {
  assert.equal(request.headers.apikey, 'fixture-key')
  const url = new URL(request.url, 'http://fixture')
  if (url.pathname !== '/rest/v1/articles') {
    response.writeHead(404).end()
    return
  }
  reads++
  const id = url.searchParams.get('id')?.replace(/^eq\./, '')
  const data = id ? articles.filter((item) => String(item.id) === id) : articles
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(
    JSON.stringify(request.headers.accept?.includes('vnd.pgrst.object') ? data[0] : data)
  )
})
let worker
try {
  const build = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run', '--outdir', output],
    { cwd, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'inherit' }
  )
  assert.equal(build.status, 0, 'Wrangler dry-run failed')
  backend.listen(0, '127.0.0.1')
  await once(backend, 'listening')
  worker = new Miniflare(
    convertV4MiniflareOptions({
      name: 'security-example',
      modules: true,
      script: readFileSync(join(output, 'index.js'), 'utf8'),
      compatibilityDate: isKv ? '2022-07-07' : '2022-07-26',
      bindings: {
        SUPABASE_URL: 'http://127.0.0.1:' + backend.address().port,
        SUPABASE_PUBLISHABLE_KEY: 'fixture-key',
      },
      ...(isKv ? { kvNamespaces: ['ARTICLES'] } : {}),
    })
  )
  async function get(route) {
    const response = await worker.dispatchFetch('http://worker.test' + route)
    assert.equal(response.status, 200, route + ': ' + response.status)
    return response.json()
  }
  if (!isKv) {
    assert.deepEqual(await get('/'), articles)
    assert.equal(reads, 1)
  } else {
    assert.deepEqual(await get('/articles'), articles)
    assert.equal(reads, 1)
    assert.deepEqual(await get('/articles'), articles)
    assert.equal(reads, 1, 'List cache avoids a second backend request')
    assert.deepEqual(await get('/articles/1'), articles[0])
    assert.equal(reads, 2)
    assert.deepEqual(await get('/articles/1'), articles[0])
    assert.equal(reads, 2, 'Detail cache avoids a second backend request')
    articles = [{ id: 1, title: 'Updated fixture article' }]
    const response = await worker.dispatchFetch('http://worker.test/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'UPDATE', record: articles[0] }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { received: true })
    const namespace = await worker.getKVNamespace('ARTICLES')
    let updated = false
    for (let i = 0; i < 100; i++) {
      if ((await namespace.get('/articles')) === JSON.stringify(articles)) {
        updated = true
        break
      }
      await delay(50)
    }
    assert.ok(updated, 'waitUntil revalidation refreshed list cache')
    assert.deepEqual(await get('/articles/1'), articles[0])
    assert.deepEqual(await get('/articles'), articles)
    assert.equal(reads, 3, 'Revalidation fetches once; later requests use cache')
  }
  console.log(
    example +
      ': local Worker runtime, data reads' +
      (isKv ? ', KV cache and revalidation' : '') +
      ' passed'
  )
} finally {
  await worker?.dispose()
  backend.closeAllConnections()
  await new Promise((done) => backend.close(done))
  rmSync(output, { recursive: true, force: true })
}
