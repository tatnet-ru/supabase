import { createPublicKey } from 'node:crypto'
import { components } from 'api-types'
import { z } from 'zod'

import { assertSelfHosted } from './util'
import { publicSigningJwkSchema, type SelfHostedSigningKeys } from '@/lib/jwt-signing-keys'

const jwksPayloadSchema = z.object({ keys: z.array(z.unknown()).max(64) })
const symmetricJwkSchema = z.object({ kty: z.literal('oct') })

type SigningKeyResponse = components['schemas']['SigningKeyResponse_Output']

const LEGACY_KEY_ID = '00000000-0000-0000-0000-000000000000'
const LEGACY_KEY_CREATED_AT = '1970-01-01T00:00:00.000Z'

/**
 * Returns a synthetic legacy signing key entry representing the symmetric
 * `AUTH_JWT_SECRET` so the Legacy JWT Secret page can render with the
 * "secret has been migrated" state on self-hosted.
 *
 * This compatibility entry is used only by the Legacy JWT Secret page.
 * The read-only signing-keys view uses live public Auth discovery instead.
 *
 * _Only call this from server-side self-hosted code._
 */
export function getLegacySigningKey(): SigningKeyResponse {
  assertSelfHosted()

  return {
    id: LEGACY_KEY_ID,
    algorithm: 'HS256',
    public_jwk: '',
    status: 'in_use',
    created_at: LEGACY_KEY_CREATED_AT,
    updated_at: LEGACY_KEY_CREATED_AT,
  }
}

/** Public verification metadata; private signing material never leaves the Auth service. */
export async function getSelfHostedSigningKeys(): Promise<SelfHostedSigningKeys> {
  assertSelfHosted()
  const baseUrl = process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL || 'http://kong:8000'
  const publicUrl = process.env.SUPABASE_PUBLIC_URL || baseUrl
  const jwksPath = '/auth/v1/.well-known/jwks.json'
  const jwksUrl = new URL(jwksPath, publicUrl).toString()
  const currentKeyId = process.env.AUTH_JWT_SIGNING_KEY_ID || process.env.GOTRUE_JWT_KEY_ID
  const legacySecretConfigured = !!(process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET)
  const response = await fetch(new URL(jwksPath, baseUrl), {
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
    cache: 'no-store',
  })

  // Older Auth versions may have no discovery endpoint. Do not turn an outage into a legacy key.
  if (response.status === 404 && !currentKeyId && legacySecretConfigured) {
    return { jwks_url: jwksUrl, legacy_secret_configured: true, keys: [] }
  }
  if (!response.ok) throw new Error('Unable to retrieve public JWT signing keys')

  const payload = jwksPayloadSchema.parse(await response.json())
  const keys: SelfHostedSigningKeys['keys'] = []
  const seen = new Set<string>()
  for (const entry of payload.keys) {
    // Symmetric JWKs contain secrets and must never be returned to the browser.
    if (symmetricJwkSchema.safeParse(entry).success) continue
    const publicJwk = publicSigningJwkSchema.parse(entry)
    createPublicKey({ key: publicJwk, format: 'jwk' })
    if (seen.has(publicJwk.kid)) throw new Error('Ambiguous public JWT signing key IDs')
    seen.add(publicJwk.kid)
    keys.push({
      kid: publicJwk.kid,
      algorithm: publicJwk.alg,
      status: publicJwk.kid === currentKeyId ? 'current' : 'trusted',
      public_jwk: publicJwk,
    })
  }
  if (currentKeyId && !seen.has(currentKeyId)) {
    throw new Error('The current JWT signing key is not published by Auth')
  }
  return { jwks_url: jwksUrl, legacy_secret_configured: legacySecretConfigured, keys }
}
