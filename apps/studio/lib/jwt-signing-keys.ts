import { z } from 'zod'

const keyId = z.string().min(1).max(256)
const keyMaterial = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/)
const commonFields = { kid: keyId, use: z.literal('sig').default('sig') }

// Keep this an allowlist: neither private JWK fields nor symmetric secrets belong in Studio responses.
export const publicSigningJwkSchema = z.discriminatedUnion('kty', [
  z.object({
    ...commonFields,
    kty: z.literal('EC'),
    alg: z.literal('ES256').default('ES256'),
    crv: z.literal('P-256'),
    x: keyMaterial,
    y: keyMaterial,
  }),
  z.object({
    ...commonFields,
    kty: z.literal('RSA'),
    alg: z.literal('RS256').default('RS256'),
    n: keyMaterial,
    e: keyMaterial,
  }),
  z.object({
    ...commonFields,
    kty: z.literal('OKP'),
    alg: z.literal('EdDSA').default('EdDSA'),
    crv: z.literal('Ed25519'),
    x: keyMaterial,
  }),
])

export const selfHostedSigningKeysSchema = z.object({
  jwks_url: z.string().url(),
  legacy_secret_configured: z.boolean(),
  keys: z.array(
    z.object({
      kid: keyId,
      algorithm: z.enum(['ES256', 'RS256', 'EdDSA']),
      status: z.enum(['current', 'trusted']),
      public_jwk: publicSigningJwkSchema,
    })
  ),
})

export type SelfHostedSigningKeys = z.infer<typeof selfHostedSigningKeysSchema>
