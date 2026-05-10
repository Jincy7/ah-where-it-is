import { notFound, redirect } from 'next/navigation'
import { SessionDetail } from '@/components/workouts/session-detail'
import { getWorkoutSessionDetails } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export default async function WorkoutSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { id } = await params
  const session = await getWorkoutSessionDetails(id, user.id)

  if (!session) {
    notFound()
  }

  return <SessionDetail session={session} />
}
