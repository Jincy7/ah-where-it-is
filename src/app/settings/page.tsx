import { createClient } from '@/lib/supabase/server'
import { getLocations } from '@/lib/db'
import { LocationManager } from '@/components/locations/location-manager'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If not authenticated, redirect to login
  if (!user) {
    redirect('/login')
  }

  const locations = await getLocations(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">설정</h1>
        <p className="text-muted-foreground">위치 정보를 관리하세요</p>
      </div>

      <LocationManager locations={locations} />
    </div>
  )
}
