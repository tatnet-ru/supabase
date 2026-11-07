import { readFile } from 'node:fs/promises'
import dns from 'node:dns/promises'
import type { LookupAddress, LookupOptions, LookupOneOptions, LookupAllOptions } from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
import * as React from 'react'
import satori from 'satori'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), flush: vi.fn() }))

const backend = 'https://ticket-fixture.example'
const username = 'renderer_fixture'
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ioAAAAASUVORK5CYII=',
  'base64'
)
let font: Buffer
let uploaded: Uint8Array<ArrayBuffer> | undefined
let color = '#ffffff'
let assetRequests = 0
const dnsLookup = vi.spyOn(dns, 'lookup')
function fixtureLookup(hostname: string, options: LookupAllOptions): Promise<LookupAddress[]>
function fixtureLookup(
  hostname: string,
  options?: LookupOneOptions | number
): Promise<LookupAddress>
function fixtureLookup(
  hostname: string,
  options: LookupOptions
): Promise<LookupAddress | LookupAddress[]>
async function fixtureLookup(
  hostname: string,
  options?: LookupOptions | number
): Promise<LookupAddress | LookupAddress[]> {
  expect(hostname).toBe('ticket-fixture.example')
  const address = { address: '93.184.216.34', family: 4 }
  return typeof options === 'object' && options.all ? [address] : address
}
let GET: (request: Request) => Promise<Response>
let runtime: string

beforeAll(async () => {
  dnsLookup.mockImplementation(fixtureLookup)
  syncBuiltinESMExports()
  font = await readFile(
    new URL('../../../public/fonts/custom/CustomFont-Book.woff', import.meta.url)
  )
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', backend)
  vi.stubEnv('LIVE_SUPABASE_COM_SERVICE_ROLE_KEY', 'fixture-service-key')
  const route = await import('./route')
  GET = route.GET
  runtime = route.runtime
})

beforeEach(() => {
  uploaded = undefined
  assetRequests = 0
  color = '#ffffff'
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (
        url.href ===
        'https://xguihxuzqibwxjnimxev.supabase.co/storage/v1/object/public/fonts/CircularStd-Book.otf'
      ) {
        return new Response(new Uint8Array(font))
      }
      if (url.origin !== backend) throw new Error('Unexpected fixture host: ' + url.origin)
      if (url.pathname === '/rest/v1/tickets_view') {
        return Response.json([
          {
            id: 'fixture-id',
            name: 'Fixture',
            ticket_number: 15,
            metadata: {
              company: 'A & B <fixture>',
              colors: { foreground: color, background: color },
            },
          },
        ])
      }
      if (
        url.pathname === `/storage/v1/object/images/launch-week/lw15/og/regular/${username}.png`
      ) {
        uploaded = new Uint8Array(await new Response(init?.body).arrayBuffer())
        return Response.json({ Key: `images/launch-week/lw15/og/regular/${username}.png` })
      }
      if (
        url.pathname ===
        `/storage/v1/object/public/images/launch-week/lw15/og/regular/${username}.png`
      ) {
        expect(uploaded).toBeDefined()
        return new Response(uploaded, { headers: { 'content-type': 'image/png' } })
      }
      if (url.pathname.startsWith('/storage/v1/object/public/images/launch-week/lw15/assets/')) {
        assetRequests++
        return new Response(new Uint8Array(pixel), { headers: { 'content-type': 'image/png' } })
      }
      throw new Error('Unexpected fixture request: ' + url.pathname)
    })
  )
})

afterAll(() => {
  dnsLookup.mockRestore()
  syncBuiltinESMExports()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('ticket OG patched renderer', () => {
  it('renders and uploads a real 1200×628 PNG through the production handler', async () => {
    expect(runtime).toBe('nodejs')
    const response = await GET(
      new Request(`https://www.example/api-v2/ticket-og?username=${username}`)
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(body.readUInt32BE(16)).toBe(1200)
    expect(body.readUInt32BE(20)).toBe(628)
    expect(body.length).toBeGreaterThan(1000)
    expect(new Uint8Array(body)).toEqual(uploaded)
    expect(assetRequests).toBe(2)
  })

  it('does not interpret injected color values as SVG markup', async () => {
    const payload = 'red"/><path data-pwned="true"/><text fill="red'
    const svg = await satori(React.createElement('div', { style: { color: payload } }, 'safe'), {
      width: 100,
      height: 100,
      embedFont: false,
      fonts: [{ name: 'Custom', data: font }],
    })
    expect(svg).not.toContain('<path data-pwned="true"')
    expect(svg).toContain(
      'fill="red&quot;/&gt;&lt;path data-pwned=&quot;true&quot;/&gt;&lt;text fill=&quot;red"'
    )
  })

  it('rejects internal style injection before rendering', async () => {
    await expect(
      satori(
        {
          type: 'div',
          key: null,
          props: {
            style: {
              _inheritedClipPathId: 'x)"/><rect width="100" height="100"/><g data-x="',
            },
          },
        },
        { width: 100, height: 100, fonts: [{ name: 'Custom', data: font }] }
      )
    ).rejects.toThrow('Invalid style property: "_inheritedClipPathId"')
  })

  it('rejects a missing username without uploading', async () => {
    const response = await GET(new Request('https://www.example/api-v2/ticket-og'))
    expect(response.status).toBe(400)
    expect(uploaded).toBeUndefined()
    expect(await response.json()).toEqual({ error: 'missing username param' })
  })
})
