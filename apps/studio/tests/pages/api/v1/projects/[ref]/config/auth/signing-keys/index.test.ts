import { createMocks } from 'node-mocks-http'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSelfHostedSigningKeys } from '@/lib/api/self-hosted/signing-keys'
import handler from '@/pages/api/v1/projects/[ref]/config/auth/signing-keys'

vi.mock('@/lib/constants', () => ({ IS_PLATFORM: false, API_URL: 'https://api.example.com' }))
vi.mock('@/lib/api/self-hosted/signing-keys', () => ({ getSelfHostedSigningKeys: vi.fn() }))

describe('self-hosted signing keys API', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns verification metadata without caching it', async () => {
    const payload = {
      jwks_url: 'https://api.example.com/auth/v1/.well-known/jwks.json',
      legacy_secret_configured: true,
      keys: [],
    }
    vi.mocked(getSelfHostedSigningKeys).mockResolvedValue(payload)
    const { req, res } = createMocks({ method: 'GET', query: { ref: 'default' } })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res._getJSONData()).toEqual(payload)
    expect(res.getHeader('Cache-Control')).toBe('no-store')
  })
  it('does not serialize upstream errors or private data into an error response', async () => {
    vi.mocked(getSelfHostedSigningKeys).mockRejectedValue(
      new Error('upstream private-signing-secret')
    )
    const { req, res } = createMocks({ method: 'GET', query: { ref: 'default' } })
    await handler(req, res)
    expect(res.statusCode).toBe(502)
    expect(res._getJSONData()).toEqual({
      message: 'Unable to load public JWT signing keys. Try again.',
    })
    expect(res._getData()).not.toContain('private-signing-secret')
  })
  it('does not expose key lifecycle mutations', async () => {
    const { req, res } = createMocks({ method: 'POST', query: { ref: 'default' } })
    await handler(req, res)
    expect(res.statusCode).toBe(405)
    expect(getSelfHostedSigningKeys).not.toHaveBeenCalled()
  })
})
