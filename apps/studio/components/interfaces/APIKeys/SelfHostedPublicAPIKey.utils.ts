import type { APIKeysData } from '@/data/api-keys/api-keys-query'

export function getPublicAPIKey(apiKeys: APIKeysData) {
  const publishableKey = apiKeys.find((key) => key.type === 'publishable' && key.api_key.trim())
  const anonKey = apiKeys.find(
    (key) => key.type === 'legacy' && key.name === 'anon' && key.api_key.trim()
  )
  const key = publishableKey ?? anonKey
  if (!key) return undefined

  // Some self-hosted deployments pass their publishable key as SUPABASE_ANON_KEY.
  const isPublishable = key.type === 'publishable' || key.api_key.startsWith('sb_publishable_')
  return { value: key.api_key, label: isPublishable ? 'Publishable key' : 'Legacy anon key' }
}
