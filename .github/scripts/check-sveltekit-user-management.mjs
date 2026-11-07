import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const cwd = resolve('examples/user-management/sveltekit-user-management')
const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((done) => reservation.close(done))
const origin = `http://127.0.0.1:${port}`
const child = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  {
    cwd,
    env: {
      ...process.env,
      PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-key',
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
const request = (path, init = {}) =>
  fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...init })
const post = (path, values, source = origin) =>
  request(path, {
    method: 'POST',
    headers: { origin: source, accept: 'application/json', 'x-sveltekit-action': 'true' },
    body: new URLSearchParams(values),
  })

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Preview exited: ' + output)
    try {
      await request('/')
      ready = true
      break
    } catch {
      await delay(200)
    }
  }
  assert.ok(ready, 'Preview unavailable: ' + output)
  const home = await request('/')
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /Supabase \+ SvelteKit/)
  assert.match(html, /Send magic link/)
  assert.doesNotMatch(html, /Sign Out/)
  const account = await request('/account')
  assert.equal(account.status, 303)
  assert.equal(account.headers.get('location'), '/')
  const invalid = await post('/', { email: 'invalid' })
  assert.equal(invalid.status, 400)
  assert.match(await invalid.text(), /Please enter a valid email address/)
  const unauthorized = await post('/account?/update', { fullName: 'fixture' })
  assert.equal(unauthorized.status, 401)
  assert.equal((await unauthorized.json()).type, 'failure')
  const crossOrigin = await post('/', { email: 'invalid' }, 'https://untrusted.example')
  assert.equal(crossOrigin.status, 403)
  const confirmation = await request('/auth/confirm')
  assert.equal(confirmation.status, 303)
  assert.equal(new URL(confirmation.headers.get('location'), origin).pathname, '/auth/error')
  const authError = await request('/auth/error')
  assert.equal(authError.status, 200)
  console.log(
    'SvelteKit user management: guest render, account guard, form validation, unauthorized update, CSRF and confirmation fallback passed'
  )
} finally {
  child.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}
