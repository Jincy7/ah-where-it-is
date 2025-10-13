'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ItemList } from '@/components/items/item-list'
import { BulkItemForm } from '@/components/items/bulk-item-form'
import { Item } from '@/lib/db'
import { List, PackagePlus } from 'lucide-react'

interface ContainerTabsProps {
  containerId: string
  items: Item[]
}

export function ContainerTabs({ containerId, items }: ContainerTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'list'

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'list') {
      params.delete('tab')
    } else {
      params.set('tab', value)
    }
    const queryString = params.toString()
    const newUrl = queryString
      ? `?${queryString}`
      : window.location.pathname
    router.push(newUrl, { scroll: false })
  }

  function handleBulkFormSuccess() {
    // Switch to list tab and refresh
    const params = new URLSearchParams(searchParams.toString())
    params.delete('tab')
    const queryString = params.toString()
    const newUrl = queryString
      ? `?${queryString}`
      : window.location.pathname
    router.push(newUrl)
    router.refresh()
  }

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="list" className="gap-2">
          <List className="h-4 w-4" />
          <span className="hidden sm:inline">물품 목록</span>
          <span className="sm:hidden">목록</span>
        </TabsTrigger>
        <TabsTrigger value="register" className="gap-2">
          <PackagePlus className="h-4 w-4" />
          <span className="hidden sm:inline">물품 등록</span>
          <span className="sm:hidden">등록</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="mt-6">
        <ItemList items={items} />
      </TabsContent>
      <TabsContent value="register" className="mt-6">
        <BulkItemForm
          containerId={containerId}
          onSuccess={handleBulkFormSuccess}
        />
      </TabsContent>
    </Tabs>
  )
}
