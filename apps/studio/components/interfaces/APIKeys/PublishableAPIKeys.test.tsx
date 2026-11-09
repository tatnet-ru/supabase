import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { components } from 'api-types'
import { HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PublishableAPIKeys } from './PublishableAPIKeys'
import type { ProjectSettings } from '@/data/config/project-settings-v2-query'
import { customRender as render } from '@/tests/lib/custom-render'
import { addAPIMock, type APIErrorBody } from '@/tests/lib/msw'
import { mockProjectGrantContext } from '@/tests/lib/project-grant-mocks'

type ApiKeyResponse = components['schemas']['ApiKeyResponse_Output']

const { mockIsPlatform } = vi.hoisted(() => ({ mockIsPlatform: { value: true } }))

vi.mock('common', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('common')
  return {
    ...actual,
    get IS_PLATFORM() {
      return mockIsPlatform.value
    },
    useParams: () => ({ ref: 'default' }),
  }
})

vi.mock('./CreatePublishableAPIKeyDialog', () => ({
  CreatePublishableAPIKeyDialog: () => <div>CreatePublishableAPIKeyDialog</div>,
}))

vi.mock('./APIKeyRow', () => ({
  APIKeyRow: ({ apiKey }: { apiKey: { id: string; name: string } }) => (
    <tr>
      <td>api-key-row:{apiKey.name}</td>
    </tr>
  ),
}))

const publishableKey: ApiKeyResponse = {
  id: 'pk-1',
  name: 'default-publishable',
  type: 'publishable',
  api_key: 'sb_publishable_xyz',
  hash: 'hash',
  inserted_at: '2025-02-16T22:24:42.115195Z',
}

const secretKey: ApiKeyResponse = {
  id: 'sk-1',
  name: 'default-secret',
  type: 'secret',
  api_key: 'sb_secret_xyz',
  hash: 'hash',
  inserted_at: '2025-02-16T22:24:42.115195Z',
}

function mockApiKeys(keys: ApiKeyResponse[]) {
  addAPIMock({
    method: 'get',
    path: '/v1/projects/:ref/api-keys',
    response: () => HttpResponse.json<ApiKeyResponse[]>(keys),
  })
}

const anonKey: ApiKeyResponse = {
  id: 'anon',
  name: 'anon',
  type: 'legacy',
  api_key: 'legacy-anon-jwt',
}

describe('PublishableAPIKeys', () => {
  beforeEach(() => {
    mockIsPlatform.value = true
    mockProjectGrantContext({ ref: 'default' })
    addAPIMock({
      method: 'get',
      path: '/platform/projects/:ref/settings',
      response: () =>
        HttpResponse.json<ProjectSettings>({
          app_config: {
            db_schema: 'public',
            storage_endpoint: 'project.example.com',
            endpoint: 'project.example.com',
            protocol: 'https',
          },
          cloud_provider: 'localhost',
          db_dns_name: '-',
          db_host: 'localhost',
          db_ip_addr_config: 'legacy',
          db_name: 'postgres',
          db_port: 5432,
          db_user: 'postgres',
          inserted_at: '',
          name: 'Project',
          ref: 'default',
          region: 'local',
          ssl_enforced: false,
          status: 'ACTIVE_HEALTHY',
        }),
    })
  })

  it('renders the table with publishable keys and the create button on platform', async () => {
    mockApiKeys([publishableKey])

    render(<PublishableAPIKeys />)

    expect(await screen.findByText('api-key-row:default-publishable')).toBeInTheDocument()
    expect(screen.getByText('CreatePublishableAPIKeyDialog')).toBeInTheDocument()
    expect(screen.queryByText('No publishable API keys found')).not.toBeInTheDocument()
  })

  it('on platform with secret-only keys, shows the inline "No publishable keys created yet" admonition', async () => {
    mockApiKeys([secretKey])

    render(<PublishableAPIKeys />)

    expect(await screen.findByText('No publishable keys created yet')).toBeInTheDocument()
    expect(screen.queryByText('No publishable API keys found')).not.toBeInTheDocument()
  })

  it('on platform with no keys, does NOT show the self-hosted empty-state card', async () => {
    mockApiKeys([])

    render(<PublishableAPIKeys />)

    expect(await screen.findByText('Publishable key')).toBeInTheDocument()
    expect(await screen.findByText('Publishable keys can be safely shared publicly')).toBeVisible()
    expect(screen.queryByText('No publishable API keys found')).not.toBeInTheDocument()
  })

  it('on self-hosted with no public keys, explains the missing configuration', async () => {
    mockIsPlatform.value = false
    mockApiKeys([])

    render(<PublishableAPIKeys />)

    expect(await screen.findByText(/No public API key is available/)).toBeInTheDocument()
  })

  it('hides the create button on non-platform', async () => {
    mockIsPlatform.value = false
    mockApiKeys([publishableKey])

    render(<PublishableAPIKeys />)

    expect(await screen.findByLabelText('Publishable key')).toHaveValue('sb_publishable_xyz')
    expect(screen.queryByText('CreatePublishableAPIKeyDialog')).not.toBeInTheDocument()
  })

  it('shows an error when the keys request fails', async () => {
    addAPIMock({
      method: 'get',
      path: '/v1/projects/:ref/api-keys',
      response: () => HttpResponse.json<APIErrorBody>({ message: 'boom' }, { status: 500 }),
    })

    render(<PublishableAPIKeys />)

    expect(await screen.findByText(/Failed to load API keys/)).toBeVisible()
  })

  it('shows and copies the legacy anon key and project URL without exposing service keys', async () => {
    mockIsPlatform.value = false
    mockApiKeys([
      anonKey,
      { ...anonKey, id: 'service_role', name: 'service_role', api_key: 'private-service-key' },
    ])
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    render(<PublishableAPIKeys />)

    expect(await screen.findByLabelText('Legacy anon key')).toHaveValue('legacy-anon-jwt')
    expect(await screen.findByLabelText('Project URL')).toHaveValue('https://project.example.com')
    expect(screen.queryByDisplayValue('private-service-key')).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Copy public API key' }).focus()
    await user.keyboard('{Enter}')
    expect(writeText).toHaveBeenLastCalledWith('legacy-anon-jwt')
    await user.click(screen.getByRole('button', { name: 'Copy project URL' }))
    expect(writeText).toHaveBeenLastCalledWith('https://project.example.com')
  })

  it('prefers publishable over legacy anon on self-hosted', async () => {
    mockIsPlatform.value = false
    mockApiKeys([anonKey, publishableKey])
    render(<PublishableAPIKeys />)
    expect(await screen.findByLabelText('Publishable key')).toHaveValue('sb_publishable_xyz')
    expect(screen.queryByDisplayValue('legacy-anon-jwt')).not.toBeInTheDocument()
  })

  it('keeps the public key usable if the project URL fails to load', async () => {
    mockIsPlatform.value = false
    mockApiKeys([anonKey])
    addAPIMock({
      method: 'get',
      path: '/platform/projects/:ref/settings',
      response: () =>
        HttpResponse.json<{ message: string }>({ message: 'Unavailable' }, { status: 500 }),
    })
    render(<PublishableAPIKeys />)
    expect(await screen.findByLabelText('Legacy anon key')).toHaveValue('legacy-anon-jwt')
    expect(await screen.findByText('Failed to load project URL')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy project URL' })).not.toBeInTheDocument()
  })
})
