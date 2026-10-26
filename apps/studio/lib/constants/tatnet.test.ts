import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('TatNet self-hosted features', () => {
  it.each([
    [false, undefined, true],
    [false, 'true', true],
    [false, 'false', false],
    [true, undefined, true],
    [true, 'false', true],
  ])('platform=%s override=%s enables features=%s', async (platform, override, enabled) => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_IS_PLATFORM', String(platform))
    vi.stubEnv('NEXT_PUBLIC_EDGE_FUNCTIONS_WRITABLE', override)
    vi.stubEnv('NEXT_PUBLIC_AUTH_EMAIL_TEMPLATES', override)
    const { EDGE_FUNCTIONS_WRITABLE, AUTH_EMAIL_TEMPLATES_ENABLED } = await import('./index')
    expect(EDGE_FUNCTIONS_WRITABLE).toBe(enabled)
    expect(AUTH_EMAIL_TEMPLATES_ENABLED).toBe(enabled)
  })
})
