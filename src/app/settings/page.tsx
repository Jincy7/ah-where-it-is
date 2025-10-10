import { createClient } from '@/lib/supabase/server'
import { getLocations } from '@/lib/db'
import { LocationManager } from '@/components/locations/location-manager'
import { BulkQrCodeButton } from '@/components/containers/bulk-qr-code-button'
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

      {/* Tools Section */}
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">도구</h2>
            <p className="text-sm text-muted-foreground">
              보관함 관리에 필요한 도구들
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BulkQrCodeButton />
          </div>
        </div>
      </div>

      <LocationManager locations={locations} />
    </div>
  )
}
