'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Dumbbell, TrendingUp } from 'lucide-react'
import { ActiveWorkoutPanel } from '@/components/workouts/active-workout-panel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type {
  ExerciseFavorite,
  WeeklyWorkoutStats,
  WorkoutSessionDetails,
} from '@/lib/db'

interface WorkoutPageClientProps {
  initialActiveSession: WorkoutSessionDetails | null
  initialFavorites: ExerciseFavorite[]
  weeklyStats: WeeklyWorkoutStats
  history: WorkoutSessionDetails[]
}

export function WorkoutPageClient({
  initialActiveSession,
  initialFavorites,
  weeklyStats,
  history,
}: WorkoutPageClientProps) {
  const [activeSession, setActiveSession] = useState(initialActiveSession)
  const [favorites, setFavorites] = useState(initialFavorites)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exerciseNames = useMemo(() => {
    const names = new Set<string>()
    history.forEach((session) => {
      session.exercises.forEach((exercise) => names.add(exercise.name))
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [history])

  async function startWorkout() {
    setIsStarting(true)
    setError(null)

    try {
      const response = await fetch('/api/workouts/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error('Failed to start workout')
      }

      const session = (await response.json()) as WorkoutSessionDetails
      setActiveSession(session)
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setIsStarting(false)
    }
  }

  function addFavoriteIfNeeded(favorite: ExerciseFavorite) {
    setFavorites((current) => {
      if (current.some((item) => item.id === favorite.id)) {
        return current
      }
      return [...current, favorite].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    })
  }

  return (
    <div
      className={`mx-auto flex w-full max-w-4xl flex-col gap-6 ${activeSession ? 'pb-22' : ''}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">운동 기록</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            오늘 운동을 바로 남겨요
          </h1>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/workouts/history">
            <CalendarDays className="size-4" />
            기록 보기
          </Link>
        </Button>
      </div>

      {activeSession ? (
        <ActiveWorkoutPanel
          session={activeSession}
          favorites={favorites}
          onSessionChange={setActiveSession}
          onFavoriteCreated={addFavoriteIfNeeded}
        />
      ) : (
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Dumbbell className="size-5" />
            </div>
            <CardTitle>아직 진행 중인 운동이 없어요</CardTitle>
            <CardDescription>
              오늘 운동을 시작하면 세트와 유산소 기록이 바로 저장됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              onClick={startWorkout}
              disabled={isStarting}
            >
              {isStarting ? '시작하는 중...' : '오늘 운동 시작'}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4" />
              이번 주
            </CardTitle>
            <CardDescription>
              이번 주 {weeklyStats.currentWeek}회, 지난주 {weeklyStats.previousWeek}회
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {weeklyStats.difference > 0 ? '+' : ''}
              {weeklyStats.difference}
            </p>
            <p className="text-sm text-muted-foreground">지난주 대비 운동 횟수</p>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" />
              종목 통계
            </CardTitle>
            <CardDescription>기록이 쌓인 종목을 바로 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {exerciseNames.length > 0 ? (
              exerciseNames.slice(0, 8).map((name) => (
                <Button key={name} asChild variant="secondary" size="sm">
                  <Link href={`/workouts/exercises/${encodeURIComponent(name)}`}>
                    {name}
                  </Link>
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                아직 기록한 운동이 없어요
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
