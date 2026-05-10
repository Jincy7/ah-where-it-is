import Link from 'next/link'
import { Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { WorkoutSessionDetails } from '@/lib/db'

interface SessionDetailProps {
  session: WorkoutSessionDetails
}

export function SessionDetail({ session }: SessionDetailProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">운동 상세</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {session.session_date}
          </h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/workouts/history">기록으로 돌아가기</Link>
        </Button>
      </div>

      {session.exercises.map((exercise) => (
        <details
          key={exercise.id}
          open
          className="rounded-lg border bg-card text-card-foreground shadow-sm"
        >
          <summary className="cursor-pointer list-none px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{exercise.name}</span>
              <Badge variant="secondary">{exercise.sets.length}세트</Badge>
            </div>
          </summary>
          <div className="space-y-2 border-t px-4 py-3">
            {exercise.sets.map((set, index) => (
              <div
                key={set.id}
                className="grid grid-cols-[3rem_1fr_1fr] rounded-md bg-muted/35 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <span>{Number(set.weight)}kg</span>
                <span>{set.reps}회</span>
              </div>
            ))}
          </div>
        </details>
      ))}

      {session.cardio_entries.length > 0 && (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              유산소
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {session.cardio_entries.map((entry) => (
              <Badge key={entry.id} variant="secondary">
                {entry.name} {entry.duration_minutes}분
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
