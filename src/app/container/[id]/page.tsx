import { createClient } from '@/lib/supabase/server'
import { getContainer, getItems } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { Pencil, QrCode, Package, MapPin } from 'lucide-react'
import { DeleteButton } from '@/components/containers/delete-button'
import { ItemList } from '@/components/items/item-list'
import { notFound, redirect } from 'next/navigation'

export default async function ContainerDetailPage({
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
  const container = await getContainer(id)

  if (!container) {
    notFound()
  }

  if (container.user_id !== user.id) {
    notFound()
  }

  const items = await getItems(id)

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
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/container/${container.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              수정
            </Link>
          </Button>
          <DeleteButton
            containerId={container.id}
            containerName={container.name}
          />
          <Button variant="outline">
            <QrCode className="mr-2 h-4 w-4" />
            QR 출력
          </Button>
        </div>
      </div>

      {/* Container Photo */}
      {container.internal_photo_url && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
          <Image
            src={container.internal_photo_url}
            alt={container.name}
            fill
            className="object-cover"
            priority
          />
        </div>
      )}

      {/* Items Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">물품 목록</h2>
          <p className="text-sm text-muted-foreground">
            총 {items.length}개
          </p>
        </div>
        <ItemList containerId={container.id} items={items} />
      </div>
    </div>
  )
}
