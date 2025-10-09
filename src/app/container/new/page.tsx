import { createClient } from '@/lib/supabase/server'
import { getLocations } from '@/lib/db'
import { ContainerForm } from '@/components/containers/container-form'
import { redirect } from 'next/navigation'

export default async function NewContainerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const locations = await getLocations(user.id)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">새 보관함 만들기</h1>
        <p className="text-muted-foreground">
          물품을 보관할 새로운 보관함을 만드세요
        </p>
      </div>

      <ContainerForm mode="create" locations={locations} />
    </div>
  )
}
