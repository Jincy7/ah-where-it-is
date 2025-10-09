import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

/**
 * Creates a Supabase client for client-side operations.
 * Uses browser storage for authentication state management.
 *
 * @returns A configured Supabase client for browser usage
 *
 * @example
 * ```ts
 * 'use client'
 *
 * import { createClient } from '@/lib/supabase/client'
 *
 * const supabase = createClient()
 * const { data: user } = await supabase.auth.getUser()
 * ```
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
