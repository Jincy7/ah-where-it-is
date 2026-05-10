'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { NavGroup } from './nav-config'
import { navIcons } from './nav-icons'

interface DesktopNavProps {
  navGroups: readonly NavGroup[]
}

function isActiveGroup(group: NavGroup, pathname: string) {
  if (group.href === '/') {
    return pathname === '/'
  }

  if (group.href === '/storage') {
    return (
      pathname.startsWith('/storage') ||
      pathname.startsWith('/container') ||
      pathname.startsWith('/search')
    )
  }

  return pathname.startsWith(group.href)
}

export function DesktopNav({ navGroups }: DesktopNavProps) {
  const pathname = usePathname()

  return (
    <nav className="hidden items-center gap-1 px-4 md:flex">
      {navGroups.map((group) => {
        const Icon = navIcons[group.icon]
        const active = isActiveGroup(group, pathname)

        if (group.items?.length) {
          return (
            <DropdownMenu key={group.href}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={active ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <Icon className="size-4" />
                  {group.label}
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {group.items.map((item) => {
                  const ItemIcon = navIcons[item.icon]

                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'gap-2',
                          pathname === item.href && 'font-medium'
                        )}
                      >
                        <ItemIcon className="size-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }

        return (
          <Button
            key={group.href}
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            asChild
            className="gap-2"
          >
            <Link href={group.href}>
              <Icon className="size-4" />
              {group.label}
            </Link>
          </Button>
        )
      })}
    </nav>
  )
}
