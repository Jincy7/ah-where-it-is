'use client'

import Link from 'next/link'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import type { WorkoutSessionDetails } from '@/lib/db'

interface WorkoutCalendarProps {
  sessions: WorkoutSessionDetails[]
}

function toDate(sessionDate: string) {
  return new Date(`${sessionDate}T00:00:00`)
}

export function WorkoutCalendar({ sessions }: WorkoutCalendarProps) {
  const completedDates = Array.from(new Set(sessions.map((session) => session.session_date))).map(
    toDate
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
      <div className="rounded-lg border">
        <Calendar
          modifiers={{ completed: completedDates }}
          modifiersClassNames={{
            completed:
              "relative bg-primary/10 text-primary font-semibold after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:text-[13px] after:font-bold after:leading-none after:text-primary after:content-['✓']",
          }}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        {sessions.length > 0 ? (
          sessions.map((session) => {
            const setCount = session.exercises.reduce(
              (total, exercise) => total + exercise.sets.length,
              0
            )
            return (
              <Button
                key={session.id}
                asChild
                variant="outline"
                className="h-auto w-full justify-between p-4"
              >
                <Link href={`/workouts/sessions/${session.id}`}>
                  <span className="font-semibold">{session.session_date}</span>
                  <span className="text-sm text-muted-foreground">
                    {session.exercises.length}종목 · {setCount}세트
                  </span>
                </Link>
              </Button>
            )
          })
        ) : (
          <div className="rounded-lg border p-6">
            <h2 className="font-semibold">아직 기록한 운동이 없어요</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              오늘 운동을 시작하면 기록과 통계가 여기에 쌓입니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
