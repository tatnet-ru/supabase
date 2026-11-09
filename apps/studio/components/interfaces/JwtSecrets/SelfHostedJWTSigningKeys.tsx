import { useParams } from 'common'
import { Button, Card, CardContent, Input, Textarea } from 'ui'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import { AlertError } from '@/components/ui/AlertError'
import CopyButton from '@/components/ui/CopyButton'
import { FormHeader } from '@/components/ui/Forms/FormHeader'
import { useJWTSigningKeysQuery } from '@/data/jwt-signing-keys/jwt-signing-keys-query'

export const SelfHostedJWTSigningKeys = () => {
  const { ref: projectRef } = useParams()
  const { data, isPending, error, refetch } = useJWTSigningKeysQuery(
    { projectRef },
    { enabled: true }
  )

  if (isPending) return <GenericSkeletonLoader />
  if (error) {
    return (
      <AlertError
        error={error}
        subject="Failed to load JWT signing keys"
        additionalActions={
          <Button variant="default" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    )
  }
  if (!data || data.mode !== 'self-hosted') return null

  return (
    <div className="space-y-6">
      <FormHeader
        title="JWT signing keys"
        description="Public keys for verifying user session JWTs. Key rotation is not available in Studio."
      />
      <Card>
        <CardContent className="space-y-2">
          <label htmlFor="jwt-jwks-url" className="text-sm text-foreground">
            JWKS URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="jwt-jwks-url" readOnly value={data.jwks_url} className="font-mono min-w-0" />
            <CopyButton text={data.jwks_url} variant="default" aria-label="Copy JWKS URL">
              Copy URL
            </CopyButton>
          </div>
          <p className="text-xs text-foreground-light">
            This endpoint publishes public verification keys. It does not expose private signing
            keys.
          </p>
        </CardContent>
      </Card>

      {data.keys.map((key) => {
        const publicJwk = JSON.stringify(key.public_jwk, null, 2)
        return (
          <Card key={key.kid}>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-foreground-light">Algorithm</dt>
                  <dd className="text-sm font-mono">{key.algorithm}</dd>
                </div>
                <div>
                  <dt className="text-sm text-foreground-light">Status</dt>
                  <dd className="text-sm">
                    {key.status === 'current' ? 'Current signing key' : 'Trusted for verification'}
                  </dd>
                </div>
              </dl>
              <div className="space-y-2">
                <label htmlFor={`jwt-kid-${key.kid}`} className="text-sm text-foreground">
                  Key ID (kid)
                </label>
                <Input id={`jwt-kid-${key.kid}`} readOnly value={key.kid} className="font-mono" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={`jwt-jwk-${key.kid}`} className="text-sm text-foreground">
                    Public JWK
                  </label>
                  <CopyButton
                    text={publicJwk}
                    variant="default"
                    aria-label={`Copy public JWK for ${key.kid}`}
                  >
                    Copy JWK
                  </CopyButton>
                </div>
                <Textarea
                  id={`jwt-jwk-${key.kid}`}
                  readOnly
                  value={publicJwk}
                  rows={10}
                  className="font-mono resize-none"
                />
              </div>
              {key.status === 'trusted' && (
                <p className="text-xs text-foreground-light">
                  Auth publishes this key for verification. Its current signing role is not
                  reported.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}

      {data.legacy_secret_configured && (
        <Card>
          <CardContent className="space-y-2">
            <h3 className="text-sm text-foreground">Legacy HS256 secret configured</h3>
            <p className="text-sm text-foreground-light">
              HS256 uses a shared secret and has no public JWK. The secret is not shown here. Its
              presence does not mean Auth currently uses it to sign new sessions.
            </p>
          </CardContent>
        </Card>
      )}
      {data.keys.length === 0 && !data.legacy_secret_configured && (
        <p className="text-sm text-foreground-light">
          No public signing keys are published by Auth.
        </p>
      )}
    </div>
  )
}
