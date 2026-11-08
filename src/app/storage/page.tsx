import { redirect } from 'next/navigation'
import { StorageWorkspace } from '@/components/storage-workspace/storage-workspace'
import { createClient } from '@/lib/supabase/server'

export default async function StoragePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <StorageWorkspace />
}
