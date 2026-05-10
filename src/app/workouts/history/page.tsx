import Link from 'next/link'
import { redirect } from 'next/navigation'
import { WeeklySummary } from '@/components/workouts/weekly-summary'
import { WorkoutCalendar } from '@/components/workouts/workout-calendar'
import { Button } from '@/components/ui/button'
import { getWeeklyWorkoutStats, getWorkoutHistory } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export default async function WorkoutHistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [history, weeklyStats] = await Promise.all([
    getWorkoutHistory(user.id),
    getWeeklyWorkoutStats(user.id),
  ])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">운동 기록</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            캘린더
          </h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/workouts">운동으로 돌아가기</Link>
        </Button>
      </div>

      <WeeklySummary stats={weeklyStats} />
      <WorkoutCalendar sessions={history} />
    </div>
  )
}
