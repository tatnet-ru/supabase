import { notFound } from 'next/navigation'

import supabase from '../../../utils/supabase'

// cache this page for 1 minute
export const revalidate = 60

export async function generateStaticParams() {
  const { data: posts } = await supabase.from('posts').select('id')

  return (posts ?? []).map(({ id }) => ({
    id: String(id),
  }))
}

export default async function Post({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: post } = await supabase.from('posts').select().match({ id }).single()

  if (!post) {
    notFound()
  }

  return <pre>{JSON.stringify(post, null, 2)}</pre>
}
