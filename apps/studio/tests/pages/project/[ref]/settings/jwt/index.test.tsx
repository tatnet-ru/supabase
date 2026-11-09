import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import JWTSigningKeysPage from '@/pages/project/[ref]/settings/jwt/index'

const { mockIsPlatform, mockUseAsyncCheckPermissions, mockUseDeploymentMode } = vi.hoisted(() => ({
  mockIsPlatform: { value: true },
  mockUseAsyncCheckPermissions: vi.fn(),
  mockUseDeploymentMode: vi.fn(),
}))

vi.mock('common', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('common')
  return {
    ...actual,
    get IS_PLATFORM() {
      return mockIsPlatform.value
    },
  }
})

vi.mock('@/hooks/misc/useCheckPermissionsV2', () => ({
  useAsyncCheckPermissionsV2: mockUseAsyncCheckPermissions,
  FGA_PERMISSIONS: { PROJECT: { AUTH_SIGNING_KEYS_READ: 'auth_signing_keys_read' } },
}))

vi.mock('@/hooks/misc/useDeploymentMode', () => ({
  useDeploymentMode: mockUseDeploymentMode,
}))

vi.mock('@/components/layouts/DefaultLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/layouts/ProjectSettingsLayout/SettingsLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/layouts/JWTKeys/JWTKeysLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/interfaces/JwtSecrets/jwt-secret-keys-table', () => ({
  JWTSecretKeysTable: () => <div>JWTSecretKeysTable</div>,
}))

vi.mock('@/components/interfaces/JwtSecrets/SelfHostedJWTSigningKeys', () => ({
  SelfHostedJWTSigningKeys: () => <div>SelfHostedJWTSigningKeys</div>,
}))

describe('/project/[ref]/settings/jwt', () => {
  beforeEach(() => {
    mockIsPlatform.value = true
    mockUseAsyncCheckPermissions.mockReturnValue({ can: true, isSuccess: true })
    mockUseDeploymentMode.mockReturnValue({
      isPlatform: true,
      isCli: false,
      isSelfHosted: false,
    })
  })

  it('renders the JWT signing keys table on platform', () => {
    render(<JWTSigningKeysPage dehydratedState={{}} />)

    expect(screen.getByText('JWTSecretKeysTable')).toBeInTheDocument()
    expect(screen.queryByText('LocalSetupGuide')).not.toBeInTheDocument()
  })

  it.each([
    { mode: 'CLI', isCli: true, isSelfHosted: false },
    { mode: 'Docker', isCli: false, isSelfHosted: true },
  ])(
    'renders public verification metadata on self-hosted ($mode mode)',
    ({ isCli, isSelfHosted }) => {
      mockIsPlatform.value = false
      mockUseDeploymentMode.mockReturnValue({ isPlatform: false, isCli, isSelfHosted })

      render(<JWTSigningKeysPage dehydratedState={{}} />)

      expect(screen.queryByText('JWTSecretKeysTable')).not.toBeInTheDocument()
      expect(screen.getByText('SelfHostedJWTSigningKeys')).toBeInTheDocument()
    }
  )
  it('does not reveal signing metadata without read permission', () => {
    mockIsPlatform.value = false
    mockUseAsyncCheckPermissions.mockReturnValue({ can: false, isSuccess: true })
    render(<JWTSigningKeysPage dehydratedState={{}} />)
    expect(screen.queryByText('SelfHostedJWTSigningKeys')).not.toBeInTheDocument()
  })
})
