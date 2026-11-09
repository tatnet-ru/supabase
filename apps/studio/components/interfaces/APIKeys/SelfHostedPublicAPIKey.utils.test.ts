import { describe, expect, it } from 'vitest'

import { getPublicAPIKey } from './SelfHostedPublicAPIKey.utils'
import type { APIKeysData } from '@/data/api-keys/api-keys-query'

const anon: APIKeysData[number] = { name: 'anon', type: 'legacy', api_key: 'anon-jwt' }
const publishable: APIKeysData[number] = {
  id: 'publishable',
  name: 'default',
  type: 'publishable',
  api_key: 'sb_publishable_public',
  inserted_at: '',
}

describe('getPublicAPIKey', () => {
  it('prefers publishable regardless of order', () => {
    for (const keys of [
      [anon, publishable],
      [publishable, anon],
    ]) {
      expect(getPublicAPIKey(keys)).toEqual({
        value: 'sb_publishable_public',
        label: 'Publishable key',
      })
    }
  })
  it('falls back to legacy anon', () => {
    expect(getPublicAPIKey([anon])).toEqual({ value: 'anon-jwt', label: 'Legacy anon key' })
  })
  it('recognizes a publishable key supplied through the anon environment variable', () => {
    expect(getPublicAPIKey([{ ...anon, api_key: 'sb_publishable_public' }])).toEqual({
      value: 'sb_publishable_public',
      label: 'Publishable key',
    })
  })
  it('ignores empty publishable keys when falling back', () => {
    expect(getPublicAPIKey([{ ...publishable, api_key: ' ' }, anon])?.value).toBe('anon-jwt')
  })
  it('never selects service role or secret keys', () => {
    expect(getPublicAPIKey([{ ...anon, name: 'service_role', api_key: 'private' }])).toBeUndefined()
    expect(
      getPublicAPIKey([
        {
          ...publishable,
          type: 'secret',
          hash: '',
          prefix: '',
          secret_jwt_template: { role: 'service_role' },
        },
      ])
    ).toBeUndefined()
  })
  it('does not use a non-legacy key merely named anon', () => {
    expect(
      getPublicAPIKey([
        {
          ...publishable,
          type: 'secret',
          name: 'anon',
          hash: '',
          prefix: '',
          secret_jwt_template: { role: 'service_role' },
        },
      ])
    ).toBeUndefined()
  })
  it('handles missing and empty public keys', () => {
    expect(getPublicAPIKey([])).toBeUndefined()
    expect(
      getPublicAPIKey([
        { ...anon, api_key: '' },
        { ...publishable, api_key: '' },
      ])
    ).toBeUndefined()
  })
})
