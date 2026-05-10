import { createClient } from '@/lib/supabase/server'
import { LifeLogHome } from '@/components/life-log/life-log-home'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If not authenticated, redirect to login
  if (!user) {
    redirect('/login')
  }

  return <LifeLogHome />
}
