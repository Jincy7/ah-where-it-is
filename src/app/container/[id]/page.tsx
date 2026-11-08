import { createClient } from '@/lib/supabase/server'
import { getContainer } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'

export default async function ContainerDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { id } = await params
  const container = await getContainer(id)
  if (!container || container.user_id !== user.id) notFound()
  const old = await searchParams
  const query = new URLSearchParams({ container: id, mode: 'manual' })
  if (old.tab === 'register') query.set('panel', 'register')
  if (typeof old.search === 'string') {
    query.set('q', old.search)
    query.set('scope', id)
  }
  redirect(`/storage?${query}`)
}
