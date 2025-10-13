'use client'

import { ContainerWithDetails } from '@/lib/db'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight, MapPin, Package } from 'lucide-react'

interface ContainerListItemProps {
  container: ContainerWithDetails
}

export function ContainerListItem({ container }: ContainerListItemProps) {
  return (
    <Link
      href={`/container/${container.id}`}
      className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-all hover:bg-accent hover:shadow-md"
    >
      {/* Thumbnail */}
      <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {container.internal_photo_url ? (
          <Image
            src={container.internal_photo_url}
            alt={container.name}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-6 w-6 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-foreground">
          {container.name}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {container.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{container.location.name}</span>
            </div>
          )}
          <Badge variant="secondary" className="text-xs">
            {container.items_count}개 물품
          </Badge>
        </div>
      </div>

      {/* Arrow Icon */}
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
    </Link>
  )
}
