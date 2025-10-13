import { createClient } from '@/lib/supabase/server'
import { getContainer, getItems } from '@/lib/db'
import { Badge } from '@/components/ui/badge'
import { Package, MapPin } from 'lucide-react'
import { ContainerActionsMenu } from '@/components/containers/container-actions-menu'
import { ContainerImage } from '@/components/containers/image-modal'
import { ContainerTabs } from '@/components/containers/container-tabs'
import { notFound, redirect } from 'next/navigation'

export default async function ContainerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { id } = await params
  const container = await getContainer(id)

  if (!container) {
    notFound()
  }

  if (container.user_id !== user.id) {
    notFound()
  }

  // Parse search params for filtering
  const resolvedSearchParams = await searchParams
  const search = typeof resolvedSearchParams.search === 'string' ? resolvedSearchParams.search : undefined
  const dateFrom = typeof resolvedSearchParams.dateFrom === 'string' ? resolvedSearchParams.dateFrom : undefined
  const dateTo = typeof resolvedSearchParams.dateTo === 'string' ? resolvedSearchParams.dateTo : undefined

  const items = await getItems(id, {
    searchQuery: search,
    dateFrom,
    dateTo,
  })

  return (
    <div className="space-y-6">
      {/* Container Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{container.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {container.location && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {container.location.name}
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <Package className="h-3 w-3" />
              {container.items_count}개 물품
            </Badge>
          </div>
        </div>
        <ContainerActionsMenu
          containerId={container.id}
          containerName={container.name}
        />
      </div>

      {/* Container Photo */}
      {container.internal_photo_url && (
        <ContainerImage
          src={container.internal_photo_url}
          alt={container.name}
        />
      )}

      {/* Items Section with Tabs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">물품 관리</h2>
          <p className="text-sm text-muted-foreground">
            총 {items.length}개
          </p>
        </div>
        <ContainerTabs containerId={container.id} items={items} />
      </div>
    </div>
  )
}
