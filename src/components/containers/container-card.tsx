'use client'

import { ContainerWithDetails } from '@/lib/db'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, Pencil, Package } from 'lucide-react'
import { DeleteButton } from './delete-button'

interface ContainerCardProps {
  container: ContainerWithDetails
}

export function ContainerCard({ container }: ContainerCardProps) {
  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-lg">
      {/* Photo Section */}
      {container.internal_photo_url ? (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <Image
            src={container.internal_photo_url}
            alt={container.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      ) : (
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <div className="flex h-full items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground/50" />
          </div>
        </div>
      )}

      {/* Content Section */}
      <CardHeader>
        <CardTitle className="line-clamp-1">{container.name}</CardTitle>
        <CardDescription className="flex items-center gap-2">
          {container.location && (
            <Badge variant="secondary" className="text-xs">
              {container.location.name}
            </Badge>
          )}
          <span className="text-xs">
            {container.items_count}개 물품
          </span>
        </CardDescription>
      </CardHeader>

      {/* Actions */}
      <CardFooter className="flex gap-2">
        <Button variant="default" size="sm" asChild className="flex-1">
          <Link href={`/container/${container.id}`}>
            <Eye className="mr-2 h-4 w-4" />
            보기
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/container/${container.id}/edit`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
        <DeleteButton containerId={container.id} containerName={container.name} />
      </CardFooter>
    </Card>
  )
}
