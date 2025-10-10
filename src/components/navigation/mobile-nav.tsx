'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, Home, Settings, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

// Icon mapping
const iconMap = {
  home: Home,
  search: Search,
  settings: Settings,
} as const

interface NavLink {
  href: string
  label: string
  icon: keyof typeof iconMap
}

interface MobileNavProps {
  navLinks: NavLink[]
}

export function MobileNav({ navLinks }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
          <span className="sr-only">메뉴 열기</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>메뉴</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-2 mt-6">
          {navLinks.map((link) => {
            const Icon = iconMap[link.icon]
            return (
              <Button
                key={link.href}
                variant="ghost"
                size="lg"
                asChild
                className="justify-start gap-3"
                onClick={() => setOpen(false)}
              >
                <Link href={link.href}>
                  <Icon className="h-5 w-5" />
                  {link.label}
                </Link>
              </Button>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
