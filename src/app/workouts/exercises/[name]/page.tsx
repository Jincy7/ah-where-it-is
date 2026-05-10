import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ExerciseStats } from '@/components/workouts/exercise-stats'
import { Button } from '@/components/ui/button'
import { getExerciseStats } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'

export default async function WorkoutExerciseStatsPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { name } = await params
  const exerciseName = decodeURIComponent(name)
  const stats = await getExerciseStats(user.id, exerciseName)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">종목 통계</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {exerciseName}
          </h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/workouts">운동으로 돌아가기</Link>
        </Button>
      </div>

      <ExerciseStats stats={stats} />
    </div>
  )
}
