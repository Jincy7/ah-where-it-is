import { createClient } from '@/lib/supabase/server'
import { getContainer } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'

export default async function EditContainerPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { id } = await params
  const container = await getContainer(id)
  if (!container || container.user_id !== user.id) notFound()
  redirect(`/storage?container=${encodeURIComponent(id)}&mode=manual&panel=edit-container`)
}
