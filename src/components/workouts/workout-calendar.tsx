'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WorkoutSessionDetails } from '@/lib/db'

interface WorkoutCalendarProps {
  sessions: WorkoutSessionDetails[]
}

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseDateOnly(dateOnly: string) {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function buildCalendarDays(month: Date) {
  const firstDay = monthStart(month)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function WorkoutCalendar({ sessions }: WorkoutCalendarProps) {
  const completedDateKeys = useMemo(
    () => new Set(sessions.map((session) => session.session_date)),
    [sessions]
  )
  const initialMonth = sessions[0]
    ? monthStart(parseDateOnly(sessions[0].session_date))
    : monthStart(new Date())
  const [visibleMonth, setVisibleMonth] = useState(initialMonth)
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth])
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(visibleMonth)

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
      <div className="rounded-lg border p-3">
        <div className="mb-4 flex h-8 items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
            aria-label="이전 달"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm font-medium">{monthLabel}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            aria-label="다음 달"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-y-2">
          {weekdays.map((weekday) => (
            <div
              key={weekday}
              className="flex h-8 items-center justify-center text-sm text-muted-foreground"
            >
              {weekday}
            </div>
          ))}

          {calendarDays.map((date) => {
            const key = dateKey(date)
            const isCurrentMonth = date.getMonth() === visibleMonth.getMonth()
            const isCompleted = completedDateKeys.has(key)

            return (
              <div key={key} className="flex h-14 items-center justify-center">
                <div
                  className={cn(
                    'flex size-12 flex-col items-center justify-center rounded-md text-base leading-none',
                    !isCurrentMonth && 'text-muted-foreground',
                    isCompleted && 'bg-primary/10 font-semibold text-primary'
                  )}
                >
                  <span>{date.getDate()}</span>
                  {isCompleted && (
                    <Check className="mt-1 size-3.5 text-primary" aria-hidden="true" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
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
