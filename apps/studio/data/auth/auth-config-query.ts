import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { authKeys } from './keys'
import type { components } from '@/data/api'
import { get, handleError } from '@/data/fetchers'
import { AUTH_EMAIL_TEMPLATES_ENABLED } from '@/lib/constants'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

export type AuthConfigVariables = {
  projectRef?: string
}

export type AuthConfigResponse = components['schemas']['GoTrueConfigResponse']

export async function getProjectAuthConfig(
  { projectRef }: AuthConfigVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get('/platform/auth/{ref}/config', {
    params: { path: { ref: projectRef } },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type ProjectAuthConfigData = Awaited<ReturnType<typeof getProjectAuthConfig>>
export type ProjectAuthConfigError = ResponseError

export const useAuthConfigQuery = <TData = ProjectAuthConfigData>(
  { projectRef }: AuthConfigVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectAuthConfigData, ProjectAuthConfigError, TData> = {}
) =>
  useQuery<ProjectAuthConfigData, ProjectAuthConfigError, TData>({
    queryKey: authKeys.authConfig(projectRef),
    queryFn: ({ signal }) => getProjectAuthConfig({ projectRef }, signal),
    // TatNet fork: the platform auth-config API is served by the edge
    // intercept in self-hosted too (AUTH_EMAIL_TEMPLATES_ENABLED covers
    // IS_PLATFORM), so the query runs and the templates pages render.
    enabled:
      enabled &&
      AUTH_EMAIL_TEMPLATES_ENABLED &&
      typeof projectRef !== 'undefined' &&
      projectRef !== '_',
    ...options,
  })

export const useAuthConfigPrefetch = ({ projectRef }: AuthConfigVariables) => {
  const client = useQueryClient()

  return useCallback(() => {
    if (projectRef) {
      client.prefetchQuery({
        queryKey: authKeys.authConfig(projectRef),
        queryFn: ({ signal }) => getProjectAuthConfig({ projectRef }, signal),
      })
    }
  }, [client, projectRef])
}
