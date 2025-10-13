'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function ContainerFAB() {
  return (
    <Button
      asChild
      size="lg"
      className="fixed bottom-20 right-6 z-40 h-14 w-14 rounded-full shadow-lg transition-all hover:scale-105 md:bottom-6 md:h-auto md:w-auto md:rounded-md md:px-6"
    >
      <Link href="/container/new">
        <Plus className="h-6 w-6 md:mr-2" />
        <span className="hidden md:inline">새 보관함</span>
      </Link>
    </Button>
  )
}
