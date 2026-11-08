'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return <main className={pathname === '/storage' ? 'min-h-0' : 'container mx-auto p-4 pb-20 md:pb-4'}>{children}</main>
}
