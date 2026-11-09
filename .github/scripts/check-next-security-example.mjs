import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const routesByExample = {
  'examples/user-management/nextjs-user-management': ['/', '/login'],
  'examples/clerk': ['/'],
  'examples/caching/with-nextjs-13': [
    { path: '/', status: 200, content: 'Security build fixture' },
  ],
  'examples/caching/with-nextjs-13-server-components': [
    '/',
    { path: '/static', status: 200, content: 'Security build fixture' },
    '/static/1',
    { path: '/server-rendered', status: 200, content: 'Security build fixture' },
    '/static-with-revalidation',
  ],
  'examples/caching/with-react-query-nextjs-14': [
    '/',
    '/countries/1',
    { path: '/ssrcountries/1', status: 200, content: 'Fixture country' },
  ],
  'examples/realtime/nextjs-auth-presence': [
    { path: '/', status: 307, location: '/login' },
    '/login',
  ],
  'examples/todo-list/nextjs-todo-list': ['/'],
}
const example = process.argv[2]
assert.ok(Object.hasOwn(routesByExample, example), 'Select a supported security example')

const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((done) => reservation.close(done))

const cwd = resolve(example)
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', String(port)],
  {
    cwd,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        'pk_test_' + Buffer.from('clerk.example.com$').toString('base64'),
      CLERK_SECRET_KEY: 'sk_test_placeholder',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
)
let output = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk).slice(-30000)
  })
}
const exited = once(child, 'exit')

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Next exited before readiness: ' + output)
    try {
      await fetch('http://127.0.0.1:' + port + '/', { signal: AbortSignal.timeout(1000) })
      ready = true
      break
    } catch {
      await delay(200)
    }
  }
  assert.ok(ready, 'Next did not become ready: ' + output)
  for (const entry of routesByExample[example]) {
    const {
      path: route,
      status,
      location,
      content,
    } = typeof entry === 'string' ? { path: entry, status: 200 } : entry
    const response = await fetch('http://127.0.0.1:' + port + route, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    const html = await response.text()
    assert.equal(response.status, status, route + ': ' + html.slice(0, 500) + '\n' + output)
    if (location) assert.equal(response.headers.get('location'), location)
    if (content) assert.ok(html.includes(content), route + ': missing fixture content: ' + content)
    if (status === 200) assert.match(html, /<html/i)
    console.log(example + ' ' + route + ': HTTP ' + status)
  }
} finally {
  child.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}
