import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'

import { ConnectSheet } from './ConnectSheet'
import type { components } from '@/data/api'
import { API_URL } from '@/lib/constants'
import { customRender } from '@/tests/lib/custom-render'
import { addAPIMock, mswServer } from '@/tests/lib/msw'
import { mockProjectGrantContext } from '@/tests/lib/project-grant-mocks'

it('shows the managed TatNet MCP flow inside the updated self-hosted connection sheet', async () => {
  mockProjectGrantContext({ ref: 'default' })
  mswServer.use(
    http.get('*/api/enabled-features-overrides', () =>
      HttpResponse.json({ disabled_features: [] })
    ),
    http.get(`${API_URL}/platform/deployment-mode`, () => HttpResponse.json({ is_cli_mode: false }))
  )
  addAPIMock({ method: 'get', path: '/v1/projects/:ref/api-keys', response: [] })
  addAPIMock({
    method: 'get',
    path: '/platform/projects/:ref/settings',
    response: () =>
      HttpResponse.json<components['schemas']['ProjectSettingsResponse_Output']>({
        cloud_provider: 'AWS',
        db_dns_name: 'db.default.supabase.co',
        db_host: 'db.default.supabase.co',
        db_name: 'postgres',
        db_port: 5432,
        db_user: 'postgres',
        inserted_at: '2026-01-01T00:00:00Z',
        name: 'Test project',
        ref: 'default',
        region: 'local',
        ssl_enforced: true,
        status: 'ACTIVE_HEALTHY',
        app_config: {
          endpoint: 'default.supabase.co',
          storage_endpoint: 'default.supabase.co/storage',
          db_schema: 'public',
        },
        service_api_keys: [{ api_key: 'fixture-key', name: 'anon', tags: 'anon' }],
      }),
  })
  customRender(<ConnectSheet />, { nuqs: { searchParams: '?showConnect=true&connectTab=mcp' } })
  expect(
    await screen.findByRole('heading', { name: 'Connect ChatGPT to TatNet Supabase' })
  ).toBeInTheDocument()
  expect(screen.getByText('https://mcp.tatnet.cloud/supabase/mcp')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Manage or revoke access' })).toHaveAttribute(
    'href',
    'https://min.tatnet.ru/api-keys'
  )
})
