'use client'

import { useState } from 'react'
import { Activity, Dumbbell } from 'lucide-react'
import { CompleteWorkoutDialog } from '@/components/workouts/complete-workout-dialog'
import { ExerciseCard } from '@/components/workouts/exercise-card'
import { ExercisePicker } from '@/components/workouts/exercise-picker'
import { RestTimer } from '@/components/workouts/rest-timer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type {
  BodyPart,
  ExerciseFavorite,
  WorkoutCardioEntry,
  WorkoutExerciseWithSets,
  WorkoutSessionDetails,
  WorkoutSet,
} from '@/lib/db'

interface ActiveWorkoutPanelProps {
  session: WorkoutSessionDetails
  favorites: ExerciseFavorite[]
  onSessionChange: (session: WorkoutSessionDetails | null) => void
  onFavoriteCreated: (favorite: ExerciseFavorite) => void
}

interface AddExercisePayload {
  name: string
  body_part: BodyPart
  exercise_favorite_id?: string | null
}

export function ActiveWorkoutPanel({
  session,
  favorites,
  onSessionChange,
  onFavoriteCreated,
}: ActiveWorkoutPanelProps) {
  const [timerSignal, setTimerSignal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function refreshSession() {
    const response = await fetch(`/api/workouts/sessions/${session.id}`)
    if (!response.ok) {
      throw new Error('Failed to refresh workout')
    }
    const nextSession = (await response.json()) as WorkoutSessionDetails
    onSessionChange(nextSession)
    return nextSession
  }

  async function addExercise(payload: AddExercisePayload) {
    setError(null)
    try {
      const response = await fetch('/api/workouts/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, ...payload }),
      })

      if (!response.ok) {
        throw new Error('Failed to add exercise')
      }

      const exercise = (await response.json()) as WorkoutExerciseWithSets
      if (exercise.exercise_favorite_id) {
        onFavoriteCreated({
          id: exercise.exercise_favorite_id,
          user_id: session.user_id,
          name: exercise.name,
          body_part: exercise.body_part,
          created_at: exercise.created_at,
          updated_at: exercise.updated_at,
        })
      }
      await refreshSession()
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function addCardio(name: string, durationMinutes: number) {
    setError(null)
    try {
      const response = await fetch('/api/workouts/cardio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          name,
          duration_minutes: durationMinutes,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to add cardio')
      }

      await refreshSession()
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function addSet(exercise: WorkoutExerciseWithSets, weight: number, reps: number) {
    setError(null)
    try {
      const response = await fetch('/api/workouts/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workout_exercise_id: exercise.id,
          weight,
          reps,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to add set')
      }

      const set = (await response.json()) as WorkoutSet
      onSessionChange({
        ...session,
        exercises: session.exercises.map((item) =>
          item.id === exercise.id ? { ...item, sets: [...item.sets, set] } : item
        ),
      })
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function updateSet(setId: string, weight: number, reps: number) {
    setError(null)
    try {
      const response = await fetch(`/api/workouts/sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight, reps }),
      })

      if (!response.ok) {
        throw new Error('Failed to update set')
      }

      const updatedSet = (await response.json()) as WorkoutSet
      onSessionChange({
        ...session,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => (set.id === setId ? updatedSet : set)),
        })),
      })
      setTimerSignal((value) => value + 1)
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function deleteSet(setId: string) {
    setError(null)
    try {
      const response = await fetch(`/api/workouts/sets/${setId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete set')
      }

      onSessionChange({
        ...session,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.filter((set) => set.id !== setId),
        })),
      })
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function completeWorkout() {
    setError(null)
    const response = await fetch(`/api/workouts/sessions/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    })

    if (!response.ok) {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
      return
    }

    onSessionChange(null)
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-lg">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Dumbbell className="size-5" />
                운동 이어하기
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {session.session_date} 기록 중
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {session.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            onAddSet={addSet}
            onUpdateSet={updateSet}
            onDeleteSet={deleteSet}
          />
        ))}

        <Card className="rounded-lg">
          <CardContent className="space-y-4 pt-4">
            <ExercisePicker
              sessionId={session.id}
              favorites={favorites}
              onAddExercise={addExercise}
              onAddCardio={addCardio}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {session.cardio_entries.length > 0 && (
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4" />
                유산소
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {session.cardio_entries.map((entry: WorkoutCardioEntry) => (
                <Badge key={entry.id} variant="secondary">
                  {entry.name} {entry.duration_minutes}분
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}

        <CompleteWorkoutDialog session={session} onComplete={completeWorkout}>
          <Button className="h-12 w-full">완료</Button>
        </CompleteWorkoutDialog>
      </div>

      <RestTimer startSignal={timerSignal} />
    </div>
  )
}
