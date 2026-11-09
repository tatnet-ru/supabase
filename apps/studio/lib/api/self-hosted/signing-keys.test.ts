import { generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLegacySigningKey, getSelfHostedSigningKeys } from './signing-keys'

vi.mock('./util', () => ({
  assertSelfHosted: vi.fn(),
}))

describe('api/self-hosted/signing-keys', () => {
  let mockAssertSelfHosted: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()

    const util = await import('./util')
    mockAssertSelfHosted = vi.mocked(util.assertSelfHosted)
  })

  describe('getLegacySigningKey', () => {
    it('should call assertSelfHosted', () => {
      getLegacySigningKey()

      expect(mockAssertSelfHosted).toHaveBeenCalled()
    })

    it('should return a SigningKeyResponse-shaped legacy entry', () => {
      const key = getLegacySigningKey()

      expect(key).toEqual({
        id: '00000000-0000-0000-0000-000000000000',
        algorithm: 'HS256',
        public_jwk: '',
        status: 'in_use',
        created_at: '1970-01-01T00:00:00.000Z',
        updated_at: '1970-01-01T00:00:00.000Z',
      })
    })
  })
})

const ecKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({
  format: 'jwk',
})
const publicEcKey = {
  kty: 'EC',
  crv: 'P-256',
  x: ecKey.x,
  y: ecKey.y,
  kid: 'current-key',
  alg: 'ES256',
  use: 'sig',
}

describe('getSelfHostedSigningKeys', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'http://auth-internal:8000')
    vi.stubEnv('SUPABASE_PUBLIC_URL', 'https://api.example.com')
    vi.stubEnv('AUTH_JWT_SIGNING_KEY_ID', '')
    vi.stubEnv('GOTRUE_JWT_KEY_ID', '')
    vi.stubEnv('AUTH_JWT_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  function mockDiscovery(keys: unknown[], status = 200) {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys }), { status }))
    vi.stubGlobal('fetch', fetcher)
    return fetcher
  }

  it('reports real public metadata and the configured current key without leaking private fields', async () => {
    vi.stubEnv('AUTH_JWT_SIGNING_KEY_ID', 'current-key')
    vi.stubEnv('AUTH_JWT_SECRET', 'configured-legacy-secret')
    const fetcher = mockDiscovery([
      { ...ecKey, ...publicEcKey, d: 'private-signing-secret', other: 'sensitive' },
      { kty: 'oct', k: 'symmetric-secret', kid: 'legacy' },
    ])
    const result = await getSelfHostedSigningKeys()
    expect(result).toEqual({
      jwks_url: 'https://api.example.com/auth/v1/.well-known/jwks.json',
      legacy_secret_configured: true,
      keys: [
        { kid: 'current-key', algorithm: 'ES256', status: 'current', public_jwk: publicEcKey },
      ],
    })
    const serialized = JSON.stringify(result)
    for (const value of [
      'private-signing-secret',
      'symmetric-secret',
      'configured-legacy-secret',
      'sensitive',
    ])
      expect(serialized).not.toContain(value)
    expect(fetcher).toHaveBeenCalledWith(
      new URL('http://auth-internal:8000/auth/v1/.well-known/jwks.json'),
      expect.objectContaining({ cache: 'no-store', redirect: 'error' })
    )
  })

  it('does not infer the current key from JWKS order or from a single published key', async () => {
    mockDiscovery([publicEcKey])
    expect((await getSelfHostedSigningKeys()).keys[0].status).toBe('trusted')
  })

  it('keeps other verification keys trusted alongside the current key', async () => {
    vi.stubEnv('AUTH_JWT_SIGNING_KEY_ID', 'current-key')
    mockDiscovery([{ ...publicEcKey, kid: 'previous-key' }, publicEcKey])
    expect(
      (await getSelfHostedSigningKeys()).keys.map(({ kid, status }) => ({ kid, status }))
    ).toEqual([
      { kid: 'previous-key', status: 'trusted' },
      { kid: 'current-key', status: 'current' },
    ])
  })

  it('fails when the configured current key is missing from discovery', async () => {
    vi.stubEnv('AUTH_JWT_SIGNING_KEY_ID', 'missing-key')
    mockDiscovery([publicEcKey])
    await expect(getSelfHostedSigningKeys()).rejects.toThrow('not published')
  })

  it('rejects duplicate IDs and malformed public keys', async () => {
    mockDiscovery([publicEcKey, publicEcKey])
    await expect(getSelfHostedSigningKeys()).rejects.toThrow('Ambiguous')
    mockDiscovery([{ ...publicEcKey, x: 'bad' }])
    await expect(getSelfHostedSigningKeys()).rejects.toThrow()
  })

  it('supports public RSA and Ed25519 keys without exposing their private fields', async () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      format: 'jwk',
    })
    const ed = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' })
    mockDiscovery([
      { ...rsa, kid: 'rsa-key' },
      { ...ed, kid: 'ed-key' },
    ])
    const result = await getSelfHostedSigningKeys()
    expect(result.keys.map(({ algorithm }) => algorithm)).toEqual(['RS256', 'EdDSA'])
    for (const key of result.keys) {
      for (const name of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'])
        expect(key.public_jwk).not.toHaveProperty(name)
    }
  })

  it('represents legacy HS256 without inventing a key ID or creation date', async () => {
    vi.stubEnv('AUTH_JWT_SECRET', 'legacy-secret')
    mockDiscovery([])
    expect(await getSelfHostedSigningKeys()).toEqual({
      jwks_url: 'https://api.example.com/auth/v1/.well-known/jwks.json',
      legacy_secret_configured: true,
      keys: [],
    })
  })

  it('supports old Auth without discovery only when a legacy secret is actually configured', async () => {
    vi.stubEnv('AUTH_JWT_SECRET', 'legacy-secret')
    mockDiscovery([], 404)
    expect((await getSelfHostedSigningKeys()).legacy_secret_configured).toBe(true)
    vi.stubEnv('AUTH_JWT_SIGNING_KEY_ID', 'current-key')
    await expect(getSelfHostedSigningKeys()).rejects.toThrow('Unable to retrieve')
  })

  it('does not replace an Auth outage with fabricated legacy metadata', async () => {
    vi.stubEnv('AUTH_JWT_SECRET', 'legacy-secret')
    mockDiscovery([], 503)
    await expect(getSelfHostedSigningKeys()).rejects.toThrow('Unable to retrieve')
  })
})
