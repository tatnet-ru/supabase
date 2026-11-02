import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const examples = {
  'examples/todo-list/nextjs-todo-list': [['/', null]],
  'examples/realtime/nextjs-auth-presence': [
    ['/', null, '/login'],
    ['/login', null],
  ],
  'examples/caching/with-nextjs-13': [['/', 'Fixture article']],
  'examples/caching/with-react-query-nextjs-14': [
    ['/', null],
    ['/countries/1', null],
    ['/ssrcountries/1', 'Fixture country'],
  ],
  'examples/caching/with-nextjs-13-server-components': [
    ['/', null],
    ['/static', 'Fixture post'],
    ['/static/1', 'Fixture post'],
    ['/server-rendered', 'Fixture post'],
    ['/server-rendered/1', 'Fixture post'],
    ['/static-with-revalidation/1', 'Fixture post'],
  ],
}
const example = process.argv[2]
assert.ok(Object.hasOwn(examples, example), 'Choose a supported legacy example')
const rows = {
  posts: [{ id: '1', title: 'Fixture post', content: 'Fixture post body' }],
  articles: [{ id: 1, title: 'Fixture article', content: 'Fixture article body' }],
  countries: [{ id: 1, name: 'Fixture country' }],
}
let reads = 0
const database = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture')
  const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1]
  if (request.method !== 'GET' || !Object.hasOwn(rows, table ?? '')) {
    response.writeHead(404, { 'content-type': 'application/json' }).end('{}')
    return
  }
  reads++
  response.setHeader('content-type', 'application/json')
  response.setHeader('content-range', '0-0/1')
  const single = request.headers.accept?.includes('application/vnd.pgrst.object+json')
  response.end(JSON.stringify(single ? rows[table][0] : rows[table]))
})
await new Promise((done) => database.listen(0, '127.0.0.1', done))
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:' + database.address().port,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-key',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-key',
  SUPABASE_SECRET_KEY: 'fixture-key',
}
const cwd = resolve(example)
let child
try {
  const build = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd,
    env,
    stdio: 'inherit',
  })
  const [buildExit] = await once(build, 'exit')
  assert.equal(buildExit, 0, 'Production build must pass')

  const reservation = createServer()
  await new Promise((done) => reservation.listen(0, '127.0.0.1', done))
  const port = reservation.address().port
  await new Promise((done) => reservation.close(done))
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', String(port)],
    {
      cwd,
      env,
      stdio: 'inherit',
    }
  )
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Production server exited before readiness')
    try {
      await fetch('http://127.0.0.1:' + port + '/', { signal: AbortSignal.timeout(1000) })
      ready = true
      break
    } catch {
      await delay(200)
    }
  }
  assert.ok(ready, 'Production server must become ready')
  for (const [route, marker, redirectPath] of examples[example]) {
    const response = await fetch('http://127.0.0.1:' + port + route, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    const body = await response.text()
    if (redirectPath) {
      assert.equal(response.status, 307, route + ' must preserve the guest redirect')
      assert.equal(response.headers.get('location'), redirectPath)
      console.log(example + ' ' + route + ': guest redirected to ' + redirectPath)
      continue
    }
    assert.equal(response.status, 200, route + ': ' + body.slice(0, 500))
    assert.match(body, /<html/i)
    if (example.endsWith('/with-nextjs-13-server-components')) {
      assert.ok(body.includes('<title>Create Next App</title>'), 'Page metadata must be preserved')
    }
    if (marker) assert.ok(body.includes(marker), route + ' must render fixture data')
    console.log(example + ' ' + route + ': HTTP 200')
  }
  if (example.endsWith('/with-nextjs-13-server-components')) {
    const beforeStaticRead = reads
    await (await fetch('http://127.0.0.1:' + port + '/static')).text()
    assert.equal(reads, beforeStaticRead, 'Static pages must retain their prerendered data')
    await (await fetch('http://127.0.0.1:' + port + '/server-rendered')).text()
    assert.ok(reads > beforeStaticRead, 'Dynamic SSR must read fresh data')
  }
  if (example.includes('/caching/')) assert.ok(reads > 0, 'The example must query PostgREST')
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await Promise.race([exited, delay(5000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  }
  database.closeAllConnections()
  await new Promise((done) => database.close(done))
}
