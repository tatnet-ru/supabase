import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { cookies } from 'next/headers'

import Country from '../country'
import { getCountryById } from '@/queries/get-country-by-id'
import createSupabaseServer from '@/utils/supabase-server'

export default async function CountryPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, cookieStore] = await Promise.all([params, cookies()])
  const countryId = Number(id)
  const queryClient = new QueryClient()
  const supabase = createSupabaseServer(cookieStore)

  await prefetchQuery(queryClient, getCountryById(supabase, countryId))

  return (
    // Neat! Serialization is now as easy as passing props.
    // HydrationBoundary is a Client Component, so hydration will happen there.
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Country id={countryId} />
    </HydrationBoundary>
  )
}
