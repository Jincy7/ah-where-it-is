import { redirect } from 'next/navigation'
export default async function SearchPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams({ mode: 'manual' })
  if (typeof params.q === 'string') query.set('q', params.q)
  redirect(`/storage?${query}`)
}
