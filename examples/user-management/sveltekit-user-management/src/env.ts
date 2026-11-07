import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: { public: true },
	PUBLIC_SUPABASE_PUBLISHABLE_KEY: { public: true }
})
