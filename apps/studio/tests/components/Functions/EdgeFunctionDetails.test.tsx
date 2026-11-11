import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { components } from 'api-types'
import { HttpResponse } from 'msw'
import { Toaster } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import z from 'zod'

import { EdgeFunctionDetails } from '@/components/interfaces/Functions/EdgeFunctionDetails/EdgeFunctionDetails'
import { customRender } from '@/tests/lib/custom-render'
import { addAPIMock, type APIErrorBody } from '@/tests/lib/msw'

// Use the same route boundary as the existing platform details tests.
vi.mock('common', async (importOriginal) => ({
  ...(await importOriginal<typeof import('common')>()),
  useParams: () => ({ ref: 'default', functionSlug: 'hello' }),
}))

type FunctionResponse = components['schemas']['FunctionSlugResponse_Output']

function mockFunction(verifyJWT: boolean) {
  let saved: FunctionResponse = {
    id: 'fn-id',
    slug: 'hello',
    name: 'hello',
    status: 'ACTIVE',
    version: 1,
    created_at: 1,
    updated_at: 1,
    verify_jwt: verifyJWT,
  }
  const updates: unknown[] = []

  addAPIMock({
    method: 'get',
    path: '/v1/projects/:ref/functions/:function_slug',
    response: () => HttpResponse.json<FunctionResponse>(saved),
  })
  addAPIMock({
    method: 'patch',
    path: '/v1/projects/:ref/functions/:function_slug',
    response: async ({ request }) => {
      const payload = z
        .object({ name: z.string(), verify_jwt: z.boolean() })
        .parse(await request.json())
      updates.push(payload)
      saved = { ...saved, ...payload }
      return HttpResponse.json<FunctionResponse>(saved)
    },
  })
  addAPIMock({ method: 'get', path: '/v1/projects/:ref/api-keys', response: [] })
  addAPIMock({
    method: 'get',
    path: '/platform/projects/:ref/settings',
    response: {
      app_config: {
        endpoint: 'default.supabase.co',
        db_schema: 'public',
        storage_endpoint: 'default.supabase.co',
      },
      cloud_provider: 'AWS',
      db_dns_name: 'db.default.supabase.co',
      db_host: 'db.default.supabase.co',
      db_name: 'postgres',
      db_port: 5432,
      db_user: 'postgres',
      inserted_at: '2026-01-01T00:00:00.000Z',
      name: 'Production',
      ref: 'default',
      region: 'us-east-1',
      ssl_enforced: false,
      status: 'ACTIVE_HEALTHY',
    },
  })
  return updates
}

describe('self-hosted EdgeFunctionDetails', () => {
  it.each([true, false])(
    'saves a change from verify_jwt=%s with the native form',
    async (initial) => {
      const updates = mockFunction(initial)
      const user = userEvent.setup()
      customRender(<EdgeFunctionDetails />)

      await screen.findByDisplayValue('hello')
      const toggle = screen.getByRole('switch', { name: 'Verify JWT with legacy secret' })
      expect(toggle).toHaveAttribute('aria-checked', String(initial))
      const save = screen.getByRole('button', { name: 'Save changes' })
      expect(save).toBeDisabled()

      await user.click(toggle)
      fireEvent.click(save)

      await waitFor(() => expect(updates).toEqual([{ name: 'hello', verify_jwt: !initial }]))
      await waitFor(() => expect(save).toBeDisabled())
      expect(toggle).toHaveAttribute('aria-checked', String(!initial))

      // Cancel restores the newly saved baseline, including keyboard changes.
      toggle.focus()
      await user.keyboard(' ')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(toggle).toHaveAttribute('aria-checked', String(!initial))
      expect(save).toBeDisabled()
      expect(updates).toHaveLength(1)
    }
  )

  it('keeps the unsaved choice available for retry when the API rejects the update', async () => {
    mockFunction(true)
    addAPIMock({
      method: 'patch',
      path: '/v1/projects/:ref/functions/:function_slug',
      response: () =>
        HttpResponse.json<APIErrorBody>({ message: 'Update unavailable' }, { status: 503 }),
    })
    const user = userEvent.setup()
    customRender(
      <>
        <EdgeFunctionDetails />
        <Toaster />
      </>
    )
    await screen.findByDisplayValue('hello')
    const toggle = screen.getByRole('switch', { name: 'Verify JWT with legacy secret' })
    await user.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText(/Failed to update edge function/)).toBeVisible()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})
