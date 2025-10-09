'use client'

import { ContainerWithDetails } from '@/lib/db'
import { ContainerCard } from './container-card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { PackagePlus } from 'lucide-react'

interface ContainerListProps {
  containers: ContainerWithDetails[]
}

export function ContainerList({ containers }: ContainerListProps) {
  if (containers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <PackagePlus className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">보관함이 없습니다</h3>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">
          첫 번째 보관함을 만들어서 물품을 정리해보세요.
        </p>
        <Button asChild>
          <Link href="/container/new">
            <PackagePlus className="mr-2 h-4 w-4" />
            새 보관함 만들기
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {containers.map((container) => (
        <ContainerCard key={container.id} container={container} />
      ))}
    </div>
  )
}
