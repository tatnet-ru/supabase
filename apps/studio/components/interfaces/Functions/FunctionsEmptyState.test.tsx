import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FunctionsEmptyState } from './FunctionsEmptyState'
import { customRender as render } from '@/tests/lib/custom-render'

const {
  mockIsPlatform,
  mockWritableFunctions,
  mockUseDeploymentMode,
  mockUseTrack,
  mockUseIsFeatureEnabled,
} = vi.hoisted(() => ({
  mockIsPlatform: { value: true },
  mockWritableFunctions: { value: true },
  mockUseDeploymentMode: vi.fn(),
  mockUseTrack: vi.fn(),
  mockUseIsFeatureEnabled: vi.fn(),
}))

vi.mock('@/lib/constants', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/constants')
  return {
    ...actual,
    get EDGE_FUNCTIONS_WRITABLE() {
      return mockWritableFunctions.value
    },
    get IS_PLATFORM() {
      return mockIsPlatform.value
    },
  }
})

vi.mock('@/hooks/misc/useDeploymentMode', () => ({
  useDeploymentMode: mockUseDeploymentMode,
}))

vi.mock('@/lib/telemetry/track', () => ({
  useTrack: mockUseTrack,
}))

vi.mock('@/hooks/misc/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: mockUseIsFeatureEnabled,
}))

describe('FunctionsEmptyState', () => {
  beforeEach(() => {
    mockWritableFunctions.value = true
    mockIsPlatform.value = true
    mockUseDeploymentMode.mockReturnValue({
      isPlatform: true,
      isCli: false,
      isSelfHosted: false,
    })
    mockUseTrack.mockReturnValue(vi.fn())
    mockUseIsFeatureEnabled.mockReturnValue(false)
  })

  it('renders the templates section on platform', () => {
    render(<FunctionsEmptyState />)

    expect(screen.getByText('Start with a template')).toBeInTheDocument()
  })

  it('renders templates and the manual card on self-hosted when functions are writable', () => {
    mockIsPlatform.value = false
    mockUseDeploymentMode.mockReturnValue({
      isPlatform: false,
      isCli: false,
      isSelfHosted: true,
    })

    render(<FunctionsEmptyState />)

    expect(screen.getByText('Start with a template')).toBeInTheDocument()
    expect(screen.getByText('Self-Hosted')).toBeInTheDocument()
  })

  it('renders templates on CLI mode when functions are writable', () => {
    mockIsPlatform.value = false
    mockUseDeploymentMode.mockReturnValue({
      isPlatform: false,
      isCli: true,
      isSelfHosted: false,
    })

    render(<FunctionsEmptyState />)

    expect(screen.getByText('Start with a template')).toBeInTheDocument()
  })

  it('hides templates when the writable-functions override is disabled', () => {
    mockIsPlatform.value = false
    mockWritableFunctions.value = false
    mockUseDeploymentMode.mockReturnValue({ isPlatform: false, isCli: false, isSelfHosted: true })
    render(<FunctionsEmptyState />)
    expect(screen.queryByText('Start with a template')).not.toBeInTheDocument()
    expect(screen.getByText('Self-Hosted')).toBeInTheDocument()
  })
})
