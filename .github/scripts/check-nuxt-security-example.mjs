import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const routesByExample = {
  'examples/user-management/nuxt3-user-management': ['/'],
}
const example = process.argv[2]
assert.ok(Object.hasOwn(routesByExample, example), 'Select a supported security example')

const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((done) => reservation.close(done))

const cwd = resolve(example)
const child = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    NUXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NUXT_PUBLIC_SUPABASE_KEY: 'fixture-key',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
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
    if (child.exitCode !== null) throw new Error('Nuxt exited before readiness: ' + output)
    try {
      await fetch('http://127.0.0.1:' + port + '/', { signal: AbortSignal.timeout(1000) })
      ready = true
      break
    } catch {
      await delay(200)
    }
  }
  assert.ok(ready, 'Nuxt did not become ready: ' + output)
  for (const route of routesByExample[example]) {
    const response = await fetch('http://127.0.0.1:' + port + route, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    const html = await response.text()
    assert.equal(response.status, 200, route + ': ' + html.slice(0, 500) + '\n' + output)
    assert.match(html, /<html/i)
    assert.match(html, /Sign in via magic link/)
    assert.match(html, /Send magic link/)
    assert.match(html, /<title>User Management<\/title>/)
    assert.doesNotMatch(html, /Sign Out/)
    console.log(example + ' ' + route + ': HTTP 200')
  }
} finally {
  child.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}
