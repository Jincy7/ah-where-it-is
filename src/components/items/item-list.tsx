'use client'

import { useState, useEffect, useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Item } from '@/lib/db'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { ItemForm } from './item-form'
import { ItemRow } from './item-row'
import { ItemFilters } from './item-filters'
import { PackageOpen, Loader2, SearchX } from 'lucide-react'

interface ItemListProps {
  containerId: string
  items: Item[]
}

export type OptimisticItem = Item & { optimistic?: boolean; deleted?: boolean }

type OptimisticAction = { type: 'add' | 'delete'; item: OptimisticItem }

export function ItemList({ containerId, items: initialItems }: ItemListProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
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

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [isFiltering, setIsFiltering] = useState(false)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Trigger re-fetch when filters change
  useEffect(() => {
    setIsFiltering(true)
    startTransition(() => {
      // Build query params
      const params = new URLSearchParams()
      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
      if (dateFrom) params.set('dateFrom', dateFrom.toISOString())
      if (dateTo) params.set('dateTo', dateTo.toISOString())

      // Update URL with query params - this will trigger server component re-fetch
      const queryString = params.toString()
      const newUrl = queryString ? `?${queryString}` : window.location.pathname
      router.push(newUrl, { scroll: false })
      setIsFiltering(false)
    })
  }, [debouncedSearchQuery, dateFrom, dateTo, router])

  async function handleAddItem(item: OptimisticItem) {
    startTransition(() => {
      setOptimisticItems({ type: 'add', item })
      router.refresh()
    })
  }

  async function handleDeleteItem(item: OptimisticItem) {
    startTransition(() => {
      setOptimisticItems({ type: 'delete', item })
      router.refresh()
    })
  }

  function handleMoveItem() {
    // Refresh the page to show updated item list after move
    router.refresh()
  }

  function handleClearFilters() {
    setSearchQuery('')
    setDateFrom(undefined)
    setDateTo(undefined)
    setDebouncedSearchQuery('')
  }

  // Calculate active filter count
  const activeFilterCount =
    (debouncedSearchQuery ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)

  const visibleItems = items.filter((item) => !item.deleted)
  const isSearching = searchQuery !== debouncedSearchQuery || isFiltering
  const hasActiveFilters = activeFilterCount > 0
  const hasNoResults = visibleItems.length === 0 && hasActiveFilters

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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <ItemFilters
            searchQuery={searchQuery}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onSearchChange={setSearchQuery}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onClearFilters={handleClearFilters}
            activeFilterCount={activeFilterCount}
          />
        </CardContent>
      </Card>

      {/* Result Count and Loading Indicator */}
      {(hasActiveFilters || isSearching) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>검색 중...</span>
            </>
          ) : (
            <span>
              {visibleItems.length}개의 물품을 찾았습니다
            </span>
          )}
        </div>
      )}

      {/* Items Table */}
      {visibleItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            {hasNoResults ? (
              <SearchX className="h-10 w-10 text-muted-foreground" />
            ) : (
              <PackageOpen className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
          <h3 className="mt-4 text-lg font-semibold">
            {hasNoResults ? '검색 결과가 없습니다' : '물품이 없습니다'}
          </h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            {hasNoResults
              ? '다른 검색어나 필터 조건을 시도해보세요.'
              : '위의 폼을 사용해서 첫 번째 물품을 추가해보세요.'}
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
                <TableHead className="w-[140px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onDelete={handleDeleteItem}
                  onMove={handleMoveItem}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
