import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const examples = {
  'examples/auth/nextjs': 'snippet',
  'examples/auth/nextjs-full': 'next',
  'examples/realtime/nextjs-authorization-demo': 'realtime',
  'examples/auth/quickstarts/react': 'react',
  'examples/auth/hono': 'hono',
  'examples/auth/hono-full': 'hono-full',
}
const example = process.argv[2]
assert.ok(Object.hasOwn(examples, example), 'Select a supported auth security example')
const kind = examples[example]
const dev = process.argv.includes('--dev')
assert.ok(!dev || kind.startsWith('hono'), 'Dev probe is only for Hono')
const cwd = resolve(example)
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-key',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-key',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-key',
}
const created = []
let child, exited
function fixture(name, content) {
  const file = resolve(cwd, name)
  assert.ok(!existsSync(file), 'Refuse to replace an existing fixture path: ' + name)
  writeFileSync(file, content)
  created.push(file)
}
try {
  if (kind === 'snippet') {
    // This example intentionally contains only reusable auth helpers and proxy.
    assert.ok(!existsSync(resolve(cwd, 'app')), 'Snippet fixture app must not exist')
    mkdirSync(resolve(cwd, 'app/login'), { recursive: true })
    created.push(resolve(cwd, 'app'))
    writeFileSync(
      resolve(cwd, 'app/layout.tsx'),
      'export default function Layout({children}: {children: React.ReactNode}) {return <html><body>{children}</body></html>}'
    )
    writeFileSync(
      resolve(cwd, 'app/page.tsx'),
      "import {createClient} from '../lib/supabase/server'; export default async function Page() {const client = await createClient(); const {data} = await client.auth.getClaims(); return <p>{data?.claims ? 'Session present' : 'No session'}</p>}"
    )
    writeFileSync(
      resolve(cwd, 'app/login/page.tsx'),
      'export default function Login() {return <h1>Snippet login fixture</h1>}'
    )
    fixture(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          lib: ['dom', 'esnext'],
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          skipLibCheck: true,
          plugins: [{ name: 'next' }],
          baseUrl: '.',
          paths: { '@/*': ['./*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
        exclude: ['node_modules'],
      })
    )
    if (!existsSync(resolve(cwd, 'next-env.d.ts'))) created.push(resolve(cwd, 'next-env.d.ts'))
  }
  if (!dev) {
    const build = spawnSync(
      process.execPath,
      [
        resolve(
          cwd,
          kind.startsWith('hono') || kind === 'react'
            ? 'node_modules/vite/bin/vite.js'
            : 'node_modules/next/dist/bin/next'
        ),
        'build',
        ...(kind.startsWith('hono') ? ['--mode', 'client'] : []),
      ],
      { cwd, env, stdio: 'inherit' }
    )
    assert.equal(build.status, 0, 'Production build failed')
    if (kind.startsWith('hono')) {
      const serverBuild = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
        cwd,
        env,
        stdio: 'inherit',
      })
      assert.equal(serverBuild.status, 0, 'Hono server bundle failed')
    }
  }
  const reservation = createServer()
  reservation.listen(kind.startsWith('hono') && !dev ? 3000 : 0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((done) => reservation.close(done))
  const args = dev
    ? [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ]
    : kind.startsWith('hono')
      ? ['index.js']
      : kind === 'react'
        ? [
            'node_modules/vite/bin/vite.js',
            'preview',
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '--strictPort',
          ]
        : ['node_modules/next/dist/bin/next', 'start', '--port', String(port)]
  child = spawn(process.execPath, args, {
    cwd: kind.startsWith('hono') && !dev ? resolve(cwd, 'dist') : cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  exited = once(child, 'exit')
  let output = ''
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-30000)
    })
  const base = 'http://127.0.0.1:' + port
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error('Server exited: ' + output)
    try {
      await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(1000) })
      ready = true
      break
    } catch {
      await delay(200)
    }
  }
  assert.ok(ready, 'Server did not become ready: ' + output)
  async function check(route, status, marker) {
    const response = await fetch(base + route, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    const body = await response.text()
    assert.equal(response.status, status, route + '\n' + body.slice(0, 1000) + '\n' + output)
    if (marker) assert.match(body, marker)
    console.log(example, route, 'HTTP', status)
    return { response, body }
  }
  if (kind === 'snippet' || kind === 'next') {
    const { response } = await check('/', 307)
    assert.equal(new URL(response.headers.get('location'), base).pathname, '/login')
    await check('/login', 200, kind === 'snippet' ? /Snippet login fixture/ : /Sign In/)
    if (kind === 'next') {
      await check('/login?message=fixture-auth-message', 200, /fixture-auth-message/)
      const { response: privateResponse } = await check('/private', 307)
      assert.equal(new URL(privateResponse.headers.get('location'), base).pathname, '/login')
    }
  } else if (kind === 'realtime') {
    await check('/', 200, /Login/)
    await check('/login?message=fixture-auth-message', 200, /fixture-auth-message/)
  } else if (kind.startsWith('hono')) {
    await check('/', 200, dev ? /src\/client\.tsx/ : /static\/client\.js/)
    const { body } = await check('/api/user', 200)
    assert.deepEqual(JSON.parse(body), { message: 'You are not logged in.' })
    const asset = await check(dev ? '/src/client.tsx' : '/static/client.js', 200)
    assert.match(asset.response.headers.get('content-type'), /javascript/)
    const response = await fetch(base + '/signout', {
      method: kind === 'hono' ? 'POST' : 'GET',
      headers: { Origin: base },
      redirect: 'manual',
    })
    assert.equal(response.status, kind === 'hono' ? 303 : 302)
    assert.equal(response.headers.get('location'), '/')
  } else {
    const { body } = await check('/', 200, /<title>Supabase Auth \+ React<\/title>/)
    const script = body.match(/<script[^>]+src="([^"]+)"/)
    assert.ok(script, 'Built React module is referenced')
    const asset = await check(script[1], 200)
    assert.match(asset.response.headers.get('content-type'), /javascript/)
  }
} finally {
  if (child) {
    child.kill('SIGTERM')
    await Promise.race([exited, delay(5000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  }
  for (const file of created.reverse()) rmSync(file, { recursive: true, force: true })
}
