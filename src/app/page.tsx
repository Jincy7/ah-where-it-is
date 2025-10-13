import { createClient } from '@/lib/supabase/server'
import { getContainers, getLocations } from '@/lib/db'
import { ContainersPageClient } from '@/components/containers/containers-page-client'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If not authenticated, redirect to login
  if (!user) {
    redirect('/login')
  }

  const [containers, locations] = await Promise.all([
    getContainers(user.id),
    getLocations(user.id),
  ])

  return <ContainersPageClient initialContainers={containers} locations={locations} />
}
