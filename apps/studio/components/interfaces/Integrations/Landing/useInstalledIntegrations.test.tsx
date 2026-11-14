import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { useInstalledIntegrations } from './useInstalledIntegrations'
import { getInstallActionType } from './useIntegrationDetail.utils'
import { customRenderHook } from '@/tests/lib/custom-render'
import { addAPIMock, mswServer, type APIErrorBody } from '@/tests/lib/msw'

function mockCronInstallation({
  nativeVersion = null,
  hasCronSchema = true,
  isTatnetCron = false,
  probeError = false,
}: {
  nativeVersion?: string | null
  hasCronSchema?: boolean
  isTatnetCron?: boolean
  probeError?: boolean
} = {}) {
  const probes: string[] = []
  addAPIMock({
    method: 'get',
    path: '/platform/projects/:ref',
    response: {
      id: 1,
      ref: 'default',
      organization_id: 1,
      name: 'Test Project',
      status: 'ACTIVE_HEALTHY',
      cloud_provider: 'AWS',
      region: 'us-east-1',
      db_host: 'db.default.supabase.co',
      connectionString: null,
      restUrl: 'https://default.supabase.co/rest/v1/',
      inserted_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      subscription_id: 'sub_123',
      is_branch_enabled: false,
      is_physical_backups_enabled: false,
      high_availability: false,
      integration_source: null,
      is_hibernating: false,
    },
  })
  mswServer.use(
    http.get('*/api/cli-release-version', () => HttpResponse.json({})),
    http.get('*/api/enabled-features-overrides', () => HttpResponse.json({}))
  )
  addAPIMock({
    method: 'post',
    path: '/platform/pg-meta/:ref/query',
    response: ({ request }) => {
      const key = new URL(request.url).searchParams.get('key')
      if (key === 'database-extensions') {
        return HttpResponse.json([
          { name: 'pg_cron', installed_version: nativeVersion, default_version: '1.6' },
        ])
      }
      if (key === 'schemas') {
        return HttpResponse.json(hasCronSchema ? [{ id: 1, name: 'cron' }] : [])
      }
      if (key === 'fdws') return HttpResponse.json([])
      if (key === 'projects-default-tatnet-cron') {
        probes.push(key)
        if (probeError) {
          return HttpResponse.json<APIErrorBody>(
            { message: 'Cron metadata unavailable' },
            { status: 503 }
          )
        }
        return HttpResponse.json([{ is_tatnet_cron: isTatnetCron }])
      }
      throw new Error(`Unexpected SQL query: ${key}`)
    },
  })
  return probes
}

describe('self-hosted Cron installation', () => {
  it('exposes TatNet Cron to the jobs tab and removes the install action without pg_cron', async () => {
    mockCronInstallation({ isTatnetCron: true })
    const { result } = customRenderHook(useInstalledIntegrations)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const cron = result.current.installedIntegrations.find(
      (integration) => integration.id === 'cron'
    )
    expect(cron).toBeDefined()
    expect(getInstallActionType({ integration: cron, isInstalled: !!cron })).toBe('installed')
  })

  it('continues recognizing native pg_cron without probing for TatNet', async () => {
    const probes = mockCronInstallation({ nativeVersion: '1.6' })
    const { result } = customRenderHook(useInstalledIntegrations)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(
      result.current.installedIntegrations.some((integration) => integration.id === 'cron')
    ).toBe(true)
    expect(probes).toEqual([])
  })

  it.each([true, false])(
    'does not treat an unrelated cron schema (%s) as installed',
    async (hasCronSchema) => {
      mockCronInstallation({ hasCronSchema })
      const { result } = customRenderHook(useInstalledIntegrations)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(
        result.current.installedIntegrations.some((integration) => integration.id === 'cron')
      ).toBe(false)
    }
  )

  it('propagates probe failures instead of reporting a successful installation check', async () => {
    mockCronInstallation({ probeError: true })
    const { result } = customRenderHook(useInstalledIntegrations)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.error?.message).toBe('Cron metadata unavailable')
  })
})
