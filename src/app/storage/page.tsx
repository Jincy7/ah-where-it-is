import { redirect } from 'next/navigation'
import { ContainersPageClient } from '@/components/containers/containers-page-client'
import { getContainers, getLocations } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export default async function StoragePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [containers, locations] = await Promise.all([
    getContainers(user.id),
    getLocations(user.id),
  ])

  return <ContainersPageClient initialContainers={containers} locations={locations} />
}
