'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ItemWithContainer } from '@/lib/db/items'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Loader2, Package } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

interface SearchResultsProps {
  initialQuery: string
  initialItems: ItemWithContainer[]
}

export function SearchResults({ initialQuery, initialItems }: SearchResultsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(initialQuery)
  const [isSearching, setIsSearching] = useState(false)
  const [, startTransition] = useTransition()

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Update URL when debounced query changes
  useEffect(() => {
    setIsSearching(true)
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (debouncedSearchQuery.trim()) {
        params.set('q', debouncedSearchQuery.trim())
      } else {
        params.delete('q')
      }

      const queryString = params.toString()
      const newUrl = queryString ? `/search?${queryString}` : '/search'
      router.push(newUrl, { scroll: false })
      setIsSearching(false)
    })
  }, [debouncedSearchQuery, router, searchParams])

  const hasQuery = debouncedSearchQuery.trim().length > 0
  const hasResults = initialItems.length > 0
  const showLoading = searchQuery !== debouncedSearchQuery || isSearching

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="물품명 또는 설명으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-base h-12"
              autoFocus
            />
          </div>
        </CardContent>
      </Card>

      {/* Search Status */}
      {hasQuery && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {showLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>검색 중...</span>
            </>
          ) : (
            <span>
              {hasResults
                ? `${initialItems.length}개의 물품을 찾았습니다`
                : '검색 결과가 없습니다'}
            </span>
          )}
        </div>
      )}

      {/* Results */}
      {!hasQuery ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Image
            src="/agu-search.png"
            alt="검색어를 입력하세요"
            width={320}
            height={320}
            className="h-40 w-40"
          />
          <h3 className="mt-4 text-lg font-semibold">검색어를 입력하세요</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            물품명 또는 설명으로 검색할 수 있습니다
          </p>
        </div>
      ) : !hasResults ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Image
            src="/agu-search.png"
            alt="검색 결과가 없습니다"
            width={320}
            height={320}
            className="h-40 w-40"
          />
          <h3 className="mt-4 text-lg font-semibold">검색 결과가 없습니다</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            다른 검색어를 시도해보세요
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">물품명</TableHead>
                  <TableHead className="w-[40%]">설명</TableHead>
                  <TableHead className="w-[25%]">보관함</TableHead>
                  <TableHead className="w-[20%]">등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/container/${item.container_id}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Package className="h-4 w-4" />
                        {item.container_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {initialItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <Link
                        href={`/container/${item.container_id}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Package className="h-4 w-4" />
                        {item.container_name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
