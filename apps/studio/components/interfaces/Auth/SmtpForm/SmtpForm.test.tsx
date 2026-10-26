import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { describe, expect, test, vi } from 'vitest'

import { SmtpForm } from './SmtpForm'
import type { components } from '@/data/api'
import { customRender } from '@/tests/lib/custom-render'
import { addAPIMock } from '@/tests/lib/msw'

type AuthConfigResponse = components['schemas']['GoTrueConfigResponse']

vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>()
  return { ...actual, IS_PLATFORM: true }
})

vi.mock('@/hooks/misc/useSelectedProject', () => ({
  useSelectedProjectQuery: () => ({ data: { ref: 'default', inserted_at: null } }),
}))

vi.mock('@/hooks/misc/useCheckPermissions', () => ({
  useAsyncCheckPermissions: () => ({ can: true, isLoading: false, isSuccess: true }),
}))

const SMTP_CONFIGURED_CONFIG = {
  SMTP_ADMIN_EMAIL: 'admin@example.com',
  SMTP_SENDER_NAME: 'Example',
  SMTP_USER: 'smtp-user',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PASS: 'stored-password-marker',
  SMTP_PORT: '587',
  SMTP_MAX_FREQUENCY: 60,
}

function mockAuthConfig(
  overrides: Partial<AuthConfigResponse> & { SMTP_EGRESS_STATUS?: string; SMTP_EGRESS_DETAIL?: string }
) {
  addAPIMock({
    method: 'get',
    path: '/platform/auth/:ref/config',
    response: () => HttpResponse.json<AuthConfigResponse>({ ...overrides } as AuthConfigResponse),
  })
}

describe('SmtpForm', () => {

  test.each([
    ['blocked', 'Outbound access to this mail server is closed'],
    ['unknown', 'Could not check outbound access to this mail server'],
  ])('shows the %s egress result without confusing unknown with blocked', async (status, title) => {
    mockAuthConfig({
      ...SMTP_CONFIGURED_CONFIG,
      SMTP_EGRESS_STATUS: status,
      SMTP_EGRESS_DETAIL: 'Region connectivity check result',
    })
    customRender(<SmtpForm />)
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(screen.getByText('Region connectivity check result')).toBeInTheDocument()
  })

  test('does not warn when the region can reach the SMTP server', async () => {
    mockAuthConfig({
      ...SMTP_CONFIGURED_CONFIG,
      SMTP_EGRESS_STATUS: 'open',
      SMTP_EGRESS_DETAIL: 'SMTP server is reachable',
    })
    customRender(<SmtpForm />)
    await screen.findByText('Stored password is hidden. Enter a new password to replace it.')
    expect(screen.queryByText('SMTP server is reachable')).not.toBeInTheDocument()
  })

  test('shows a hidden-password placeholder when a password is already saved', async () => {
    mockAuthConfig(SMTP_CONFIGURED_CONFIG)

    customRender(<SmtpForm />)

    expect(
      await screen.findByText('Stored password is hidden. Enter a new password to replace it.')
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••••••••••')).toBeInTheDocument()
  })

  test('does not show the hidden-password copy or placeholder for a fresh, never-configured setup', async () => {
    mockAuthConfig({})

    customRender(<SmtpForm />)

    await userEvent.click(await screen.findByLabelText('Toggle SMTP'))

    expect(await screen.findByText('Password for your SMTP server.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('••••••••••••••••')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Stored password is hidden. Enter a new password to replace it.')
    ).not.toBeInTheDocument()
  })
})
