import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SelfHostedJWTSigningKeys } from './SelfHostedJWTSigningKeys'
import { useJWTSigningKeysQuery } from '@/data/jwt-signing-keys/jwt-signing-keys-query'
import { API_URL } from '@/lib/constants'
import type { SelfHostedSigningKeys } from '@/lib/jwt-signing-keys'
import { customRender, customRenderHook } from '@/tests/lib/custom-render'
import { mswServer } from '@/tests/lib/msw'
import { mockProjectGrantContext } from '@/tests/lib/project-grant-mocks'

const mode = vi.hoisted(() => ({ isPlatform: false }))

vi.mock('common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('common')>()),
  get IS_PLATFORM() {
    return mode.isPlatform
  },
  useParams: () => ({ ref: 'default' }),
}))

const metadata: SelfHostedSigningKeys = {
  jwks_url: 'https://project.example.com/auth/v1/.well-known/jwks.json',
  legacy_secret_configured: false,
  keys: [
    {
      kid: 'current-key',
      algorithm: 'ES256',
      status: 'current',
      public_jwk: {
        kid: 'current-key',
        kty: 'EC',
        alg: 'ES256',
        crv: 'P-256',
        x: 'public-x',
        y: 'public-y',
        use: 'sig',
      },
    },
  ],
}

function mockKeys(body: SelfHostedSigningKeys) {
  // The self-hosted response intentionally differs from the platform lifecycle API.
  mswServer.use(
    http.get(`${API_URL}/v1/projects/default/config/auth/signing-keys`, () =>
      HttpResponse.json<SelfHostedSigningKeys>(body)
    )
  )
}

describe('SelfHostedJWTSigningKeys', () => {
  beforeEach(() => {
    mode.isPlatform = false
    mockProjectGrantContext({ ref: 'default' })
  })
  it('shows live metadata and copies the JWKS URL and public JWK with mouse and keyboard', async () => {
    mockKeys(metadata)
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText')
    customRender(<SelfHostedJWTSigningKeys />)
    expect(await screen.findByText('Current signing key')).toBeVisible()
    expect(screen.getByText('ES256')).toBeVisible()
    expect(screen.getByLabelText('Key ID (kid)')).toHaveValue('current-key')
    await user.click(screen.getByRole('button', { name: 'Copy JWKS URL' }))
    expect(write).toHaveBeenLastCalledWith(metadata.jwks_url)
    screen.getByRole('button', { name: 'Copy public JWK for current-key' }).focus()
    await user.keyboard('{Enter}')
    const copiedJwk = write.mock.calls.at(-1)?.[0]
    expect(copiedJwk).toBe(screen.getByLabelText<HTMLTextAreaElement>('Public JWK').value)
    expect(JSON.parse(copiedJwk ?? '')).toEqual(metadata.keys[0].public_jwk)
    expect(screen.queryByRole('button', { name: /Rotate|Revoke|Create/i })).not.toBeInTheDocument()
  })

  it('does not label trusted verification keys as the active signing key', async () => {
    mockKeys({ ...metadata, keys: [{ ...metadata.keys[0], status: 'trusted' }] })
    customRender(<SelfHostedJWTSigningKeys />)
    expect(await screen.findByText('Trusted for verification')).toBeVisible()
    expect(screen.queryByText('Current signing key')).not.toBeInTheDocument()
  })

  it('describes legacy HS256 without a fabricated date or public key', async () => {
    mockKeys({ ...metadata, keys: [], legacy_secret_configured: true })
    customRender(<SelfHostedJWTSigningKeys />)
    expect(await screen.findByText('Legacy HS256 secret configured')).toBeVisible()
    expect(screen.queryByLabelText('Key ID (kid)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Public JWK')).not.toBeInTheDocument()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
  })

  it('explains an empty discovery response', async () => {
    mockKeys({ ...metadata, keys: [] })
    customRender(<SelfHostedJWTSigningKeys />)
    expect(await screen.findByText('No public signing keys are published by Auth.')).toBeVisible()
  })

  it('shows a recoverable error instead of synthetic keys and retries successfully', async () => {
    mockProjectGrantContext({ ref: 'default' })
    mswServer.use(
      http.get(`${API_URL}/v1/projects/default/config/auth/signing-keys`, () =>
        HttpResponse.json({ message: 'Auth unavailable' }, { status: 502 })
      )
    )
    const user = userEvent.setup()
    customRender(<SelfHostedJWTSigningKeys />)
    expect(await screen.findByText('Failed to load JWT signing keys')).toBeVisible()
    expect(screen.queryByLabelText('Public JWK')).not.toBeInTheDocument()
    mockKeys(metadata)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Current signing key')).toBeVisible()
  })
  it('preserves the platform signing-key lifecycle response', async () => {
    mode.isPlatform = true
    const keys = [
      {
        id: 'platform-key',
        algorithm: 'ES256',
        status: 'in_use',
        public_jwk: '{}',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    mswServer.use(
      http.get(`${API_URL}/v1/projects/default/config/auth/signing-keys`, () =>
        HttpResponse.json({ keys })
      )
    )
    const { result } = customRenderHook(() =>
      useJWTSigningKeysQuery({ projectRef: 'default' }, { enabled: true })
    )
    await waitFor(() => expect(result.current.data).toEqual({ mode: 'platform', keys }))
  })
})
