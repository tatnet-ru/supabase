import { expect, test } from '@playwright/test'

// Browser plugin not available. Run real Chromium against the production bundle.
test('guest sign-in, task create/complete/delete and sign-out', async ({ page }, testInfo) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'fixture@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
  let rows = [
    {
      id: 1,
      user_id: user.id,
      task: 'Fixture task',
      is_complete: false,
      inserted_at: user.created_at,
    },
  ]
  const calls: string[] = []
  const unexpected: string[] = []
  page.on('pageerror', (error) => unexpected.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource.*400/.test(message.text()))
      unexpected.push(message.text())
  })
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    calls.push(method + ' ' + url.pathname)
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.pathname === '/auth/v1/token') {
      const body = request.postDataJSON()
      if (body.password !== 'fixture-password')
        return json({ code: 'invalid_credentials', message: 'Fixture invalid credentials' }, 400)
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const access_token =
        encode({ alg: 'HS256', typ: 'JWT' }) +
        '.' +
        encode({
          sub: user.id,
          aud: 'authenticated',
          role: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }) +
        '.fixture-signature'
      return json({
        access_token,
        refresh_token: 'fixture-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        user,
      })
    }
    if (url.pathname === '/auth/v1/user') return json(user)
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/rest/v1/todos') {
      if (method === 'GET') return json(rows)
      if (method === 'POST') {
        const body = request.postDataJSON()
        const row = { ...body, id: 2, is_complete: false, inserted_at: user.created_at }
        rows.push(row)
        return json(row, 201)
      }
      const id = Number(url.searchParams.get('id')?.replace('eq.', ''))
      if (method === 'PATCH') {
        const row = rows.find((row) => row.id === id)!
        Object.assign(row, request.postDataJSON())
        return json(row)
      }
      if (method === 'DELETE') {
        rows = rows.filter((row) => row.id !== id)
        return route.fulfill({ status: 204 })
      }
    }
    unexpected.push('Unexpected API call: ' + method + ' ' + url.pathname)
    return json({ message: 'Unexpected fixture request' }, 500)
  })
  await page.goto('/')
  await expect(page).toHaveTitle('Supabase Todo List Example')
  await expect(page.getByLabel('Email:')).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('guest-screen.png') })
  await testInfo.attach('guest-screen', {
    path: testInfo.outputPath('guest-screen.png'),
    contentType: 'image/png',
  })
  await page.getByLabel('Email:').fill(user.email)
  await page.getByLabel('Password:').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByText('Fixture invalid credentials')).toBeVisible()
  await page.getByLabel('Password:').fill('fixture-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Todo List.' })).toBeVisible()
  await expect(page.getByText('Fixture task', { exact: true })).toBeVisible()
  await page.getByPlaceholder('make coffee').fill('  New fixture task  ')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const added = page.getByRole('listitem').filter({ hasText: 'New fixture task' })
  await expect(added).toBeVisible()
  await expect(page.getByPlaceholder('make coffee')).toHaveValue('')
  await added.getByRole('checkbox').check()
  await expect(added.getByRole('checkbox')).toBeChecked()
  await expect.poll(() => rows.find((row) => row.id === 2)?.is_complete).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('task-screen.png') })
  await testInfo.attach('task-screen', {
    path: testInfo.outputPath('task-screen.png'),
    contentType: 'image/png',
  })
  await added.getByRole('button').click()
  await expect(added).toHaveCount(0)
  expect(rows).toHaveLength(1)
  await page.getByRole('button', { name: 'Logout', exact: true }).click()
  await expect(page.getByLabel('Email:')).toBeVisible()
  expect(calls).toContain('POST /rest/v1/todos')
  expect(calls).toContain('PATCH /rest/v1/todos')
  expect(calls).toContain('DELETE /rest/v1/todos')
  expect(calls).toContain('POST /auth/v1/logout')
  expect(unexpected).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
})
