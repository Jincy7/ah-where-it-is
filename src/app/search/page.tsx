import { createClient } from '@/lib/supabase/server'
import { searchAllItems } from '@/lib/db/items'
import { redirect } from 'next/navigation'
import { SearchResults } from '@/components/search/search-results'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const resolvedSearchParams = await searchParams
  const searchQuery = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : ''

  // Only search if there's a query
  const items = searchQuery.trim() ? await searchAllItems(searchQuery) : []

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">물품 검색</h1>
        <p className="text-muted-foreground">
          모든 보관함에서 물품을 검색하세요
        </p>
      </div>

      <SearchResults initialQuery={searchQuery} initialItems={items} />
    </div>
  )
}
