import { createClient } from '@/lib/supabase/server'
import { getContainer, getLocations } from '@/lib/db'
import { ContainerForm } from '@/components/containers/container-form'
import { notFound, redirect } from 'next/navigation'

export default async function EditContainerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { id } = await params
  const [container, locations] = await Promise.all([
    getContainer(id),
    getLocations(user.id),
  ])

  if (!container) {
    notFound()
  }

  if (container.user_id !== user.id) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">보관함 수정</h1>
        <p className="text-muted-foreground">
          {container.name} 보관함의 정보를 수정하세요
        </p>
      </div>

      <ContainerForm
        mode="edit"
        defaultValues={container}
        containerId={container.id}
        locations={locations}
      />
    </div>
  )
}
