'use client'

import { useOptimistic } from 'react'
import { useRouter } from 'next/navigation'
import { Item } from '@/lib/db'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { ItemForm } from './item-form'
import { ItemRow } from './item-row'
import { PackageOpen } from 'lucide-react'

interface ItemListProps {
  containerId: string
  items: Item[]
}

export type OptimisticItem = Item & { optimistic?: boolean; deleted?: boolean }

type OptimisticAction = { type: 'add' | 'delete'; item: OptimisticItem }

export function ItemList({ containerId, items: initialItems }: ItemListProps) {
  const router = useRouter()
  const [items, setOptimisticItems] = useOptimistic<OptimisticItem[], OptimisticAction>(
    initialItems,
    (state, action) => {
      if (action.type === 'add') {
        return [action.item, ...state]
      } else if (action.type === 'delete') {
        return state.map((item) =>
          item.id === action.item.id ? { ...item, deleted: true } : item
        )
      }
      return state
    }
  )

  async function handleAddItem(item: OptimisticItem) {
    setOptimisticItems({ type: 'add', item })
    router.refresh()
  }

  async function handleDeleteItem(item: OptimisticItem) {
    setOptimisticItems({ type: 'delete', item })
    router.refresh()
  }

  const visibleItems = items.filter((item) => !item.deleted)

  return (
    <div className="space-y-6">
      {/* Add Item Form */}
      <Card>
        <CardContent className="pt-6">
          <ItemForm
            containerId={containerId}
            onSuccess={handleAddItem}
          />
        </CardContent>
      </Card>

      {/* Items Table */}
      {visibleItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <PackageOpen className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">물품이 없습니다</h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            위의 폼을 사용해서 첫 번째 물품을 추가해보세요.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">물품명</TableHead>
                <TableHead className="hidden sm:table-cell">설명</TableHead>
                <TableHead className="hidden md:table-cell">등록일</TableHead>
                <TableHead className="w-[100px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onDelete={handleDeleteItem}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
