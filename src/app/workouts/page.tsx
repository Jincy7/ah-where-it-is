import { redirect } from 'next/navigation'
import { WorkoutPageClient } from '@/components/workouts/workout-page-client'
import {
  getActiveWorkoutSession,
  getExerciseFavorites,
  getWeeklyWorkoutStats,
  getWorkoutHistory,
} from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export default async function WorkoutsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [activeSession, favorites, weeklyStats, history] = await Promise.all([
    getActiveWorkoutSession(user.id),
    getExerciseFavorites(user.id),
    getWeeklyWorkoutStats(user.id),
    getWorkoutHistory(user.id),
  ])

  return (
    <WorkoutPageClient
      initialActiveSession={activeSession}
      initialFavorites={favorites}
      weeklyStats={weeklyStats}
      history={history}
    />
  )
}
