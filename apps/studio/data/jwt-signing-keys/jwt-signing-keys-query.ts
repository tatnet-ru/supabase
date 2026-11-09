import { skipToken, useQuery } from '@tanstack/react-query'
import { components } from 'api-types'
import { IS_PLATFORM } from 'common'

import { jwtSigningKeysKeys } from './keys'
import { get, handleError } from '@/data/fetchers'
import type { StudioError } from '@/lib/errors/studio-errors'
import { useGrant, type GrantFor } from '@/lib/grants'
import { selfHostedSigningKeysSchema } from '@/lib/jwt-signing-keys'
import type { UseCustomQueryOptions } from '@/types'

export type JWTSigningKey = components['schemas']['SigningKeyResponse_Output']

export type JWTAlgorithm = components['schemas']['SigningKeyResponse_Output']['algorithm']

interface JWTSigningKeysVariables {
  projectRef?: string
}

type SigningKeysGrant = GrantFor<'get', '/v1/projects/{ref}/config/auth/signing-keys'>

async function getJWTSigningKeys(
  { projectRef, grant }: { projectRef: string; grant: SigningKeysGrant },
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get(`/v1/projects/{ref}/config/auth/signing-keys`, {
    params: { path: { ref: projectRef } },
    signal,
    grant,
  })

  if (error) {
    handleError(error)
  }

  if (!IS_PLATFORM) {
    return { ...selfHostedSigningKeysSchema.parse(data), mode: 'self-hosted' as const }
  }
  return { ...data, mode: 'platform' as const }
}

export type JWTSigningKeysData = Awaited<ReturnType<typeof getJWTSigningKeys>>

export const useJWTSigningKeysQuery = <TData = JWTSigningKeysData>(
  { projectRef }: JWTSigningKeysVariables,
  { enabled, ...options }: UseCustomQueryOptions<JWTSigningKeysData, StudioError, TData> = {}
) => {
  const access = useGrant('GET /v1/projects/{ref}/config/auth/signing-keys', { projectRef })
  const grant = access.grant
  return useQuery<JWTSigningKeysData, StudioError, TData>({
    queryKey: jwtSigningKeysKeys.list(projectRef),
    queryFn:
      projectRef && grant
        ? ({ signal }) => getJWTSigningKeys({ projectRef, grant }, signal)
        : skipToken,
    enabled: enabled && !!projectRef,
    ...options,
  })
}
