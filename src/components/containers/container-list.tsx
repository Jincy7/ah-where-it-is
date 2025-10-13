'use client'

import Image from 'next/image'
import { ContainerWithDetails } from '@/lib/db'
import { ContainerListItem } from './container-list-item'

interface ContainerListProps {
  containers: ContainerWithDetails[]
}

export function ContainerList({ containers }: ContainerListProps) {
  if (containers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <Image
          src="/agu-container.png"
          alt="보관함이 없습니다"
          width={320}
          height={320}
          className="h-40 w-40"
        />
        <h3 className="mt-4 text-lg font-semibold">보관함이 없습니다</h3>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">
          첫 번째 보관함을 만들어서 물품을 정리해보세요.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {containers.map((container) => (
        <ContainerListItem key={container.id} container={container} />
      ))}
    </div>
  )
}
