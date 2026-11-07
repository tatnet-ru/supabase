import { describe, expect, it } from 'vitest'

import { getAvatarUrl } from './Users.utils'

const avatar = (value: unknown) =>
  getAvatarUrl({ id: 'user-1', providers: [], raw_user_meta_data: { avatar_url: value } })

describe('getAvatarUrl', () => {
  it('resizes GitHub avatars while preserving other query parameters', () => {
    expect(avatar('https://avatars.githubusercontent.com/u/1?v=4&s=400')).toBe(
      'https://avatars.githubusercontent.com/u/1?v=4&s=24'
    )
  })

  it('preserves Google avatar sizing', () => {
    expect(avatar('https://lh3.googleusercontent.com/a/user?sz=80')).toBe(
      'https://lh3.googleusercontent.com/a/user?sz=80'
    )
  })

  it.each([
    'https://avatars.githubusercontent.com.evil.example/avatar.png',
    'https://lh3.googleusercontent.com.evil.example/avatar.png',
    'https://avatars.githubusercontent.com@evil.example/avatar.png',
    'https://avatars.githubusercontent.com:444/avatar.png',
    'https://untrusted@avatars.githubusercontent.com/u/1',
  ])('rejects URLs outside the permitted avatar origins: %s', (url) => {
    expect(avatar(url)).toBeUndefined()
  })

  it.each([
    'http://avatars.githubusercontent.com/u/1',
    'data:image/svg+xml,<svg/>',
    'javascript:alert(1)',
    'https://avatars.githubusercontent.com:invalid/u/1',
    { url: 'https://avatars.githubusercontent.com/u/1' },
    undefined,
  ])('rejects invalid avatar metadata: %j', (value) => {
    expect(avatar(value)).toBeUndefined()
  })
})
