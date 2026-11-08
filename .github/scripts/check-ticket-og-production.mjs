import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import dns from 'node:dns/promises'
import { resolve } from 'node:path'

const www = resolve('apps/www')
const backend = 'https://ticket-fixture.example'
const username = 'renderer_fixture'
process.env.NEXT_PUBLIC_SUPABASE_URL = backend
process.env.LIVE_SUPABASE_COM_SERVICE_ROLE_KEY = 'fixture-service-key'
const font = await readFile(resolve(www, 'public/fonts/custom/CustomFont-Book.woff'))
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ioAAAAASUVORK5CYII=',
  'base64'
)
let uploaded
let assetRequests = 0
const originalLookup = dns.lookup
// Keep SSRF validation active while DNS and HTTP remain local fixture stand-ins.
dns.lookup = async (hostname) => {
  assert.equal(hostname, 'ticket-fixture.example')
  return [{ address: '93.184.216.34', family: 4 }]
}
syncBuiltinESMExports()
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (
    url.href ===
    'https://xguihxuzqibwxjnimxev.supabase.co/storage/v1/object/public/fonts/CircularStd-Book.otf'
  )
    return new Response(font)
  assert.equal(url.origin, backend, 'Unexpected fixture host')
  if (url.pathname === '/rest/v1/tickets_view')
    return Response.json([
      {
        id: 'fixture-id',
        name: 'Fixture',
        ticket_number: 15,
        metadata: {
          company: 'A & B <fixture>',
          colors: { foreground: '#ffffff', background: '#000000' },
        },
      },
    ])
  if (url.pathname === `/storage/v1/object/images/launch-week/lw15/og/regular/${username}.png`) {
    uploaded = new Uint8Array(await new Response(init.body).arrayBuffer())
    return Response.json({ Key: `images/launch-week/lw15/og/regular/${username}.png` })
  }
  if (
    url.pathname === `/storage/v1/object/public/images/launch-week/lw15/og/regular/${username}.png`
  ) {
    assert.ok(uploaded)
    return new Response(uploaded, { headers: { 'content-type': 'image/png' } })
  }
  if (url.pathname.startsWith('/storage/v1/object/public/images/launch-week/lw15/assets/')) {
    assetRequests++
    return new Response(pixel, { headers: { 'content-type': 'image/png' } })
  }
  throw new Error('Unexpected fixture request: ' + url.pathname)
}

try {
  const require = createRequire(resolve(www, 'package.json'))
  const route = require(resolve(www, '.next/server/app/api-v2/ticket-og/route.js'))
  await route.routeModule.ensureUserland()
  const response = await route.routeModule.userland.GET(
    new Request(`https://www.example/api-v2/ticket-og?username=${username}`)
  )
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal(response.headers.get('content-type'), 'image/png')
  const body = Buffer.from(await response.arrayBuffer())
  assert.deepEqual(body.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.equal(body.readUInt32BE(16), 1200)
  assert.equal(body.readUInt32BE(20), 628)
  assert.deepEqual(new Uint8Array(body), uploaded)
  assert.equal(assetRequests, 2, 'Background and logo must actually load')
  const trace = JSON.parse(
    await readFile(resolve(www, '.next/server/app/api-v2/ticket-og/route.js.nft.json'), 'utf8')
  )
  assert.ok(
    trace.files.some((file) => /resvg.*\.node$/.test(file)),
    'Native renderer missing from deployment trace'
  )
  console.log(
    'Compiled production Node handler: PNG 1200×628 uploaded; native renderer included in deployment trace'
  )
} finally {
  globalThis.fetch = originalFetch
  dns.lookup = originalLookup
  syncBuiltinESMExports()
}
