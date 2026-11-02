import { notFound } from 'next/navigation'

import supabase from '../../../utils/supabase'

// do not cache this page
export const revalidate = 0

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
