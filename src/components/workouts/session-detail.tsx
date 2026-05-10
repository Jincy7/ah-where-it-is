'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Activity, Check, Trash2 } from 'lucide-react'
import { SetRow } from '@/components/workouts/set-row'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type {
  WorkoutCardioEntry,
  WorkoutExerciseWithSets,
  WorkoutSessionDetails,
  WorkoutSet,
} from '@/lib/db'

interface SessionDetailProps {
  session: WorkoutSessionDetails
}

interface ExerciseEditorProps {
  exercise: WorkoutExerciseWithSets
  onRename: (exerciseId: string, name: string) => Promise<void>
  onDelete: (exerciseId: string) => Promise<void>
  onUpdateSet: (setId: string, weight: number, reps: number) => Promise<void>
  onDeleteSet: (setId: string) => Promise<void>
}

interface CardioEditorProps {
  entry: WorkoutCardioEntry
  onSave: (entryId: string, name: string, durationMinutes: number) => Promise<void>
  onDelete: (entryId: string) => Promise<void>
}

function ExerciseEditor({
  exercise,
  onRename,
  onDelete,
  onUpdateSet,
  onDeleteSet,
}: ExerciseEditorProps) {
  const [name, setName] = useState(exercise.name)
  const [isSaving, setIsSaving] = useState(false)

  async function saveName() {
    const nextName = name.trim()
    if (!nextName) {
      return
    }

    setIsSaving(true)
    await onRename(exercise.id, nextName)
    setIsSaving(false)
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">운동 종목</CardTitle>
          <Badge variant="secondary">{exercise.sets.length}세트</Badge>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Input
            aria-label="운동 종목 이름"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={saveName}
            disabled={isSaving}
            aria-label="운동 종목 저장"
          >
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onDelete(exercise.id)}
            aria-label="운동 종목 삭제"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {exercise.sets.length > 0 ? (
          exercise.sets.map((set, index) => (
            <SetRow
              key={set.id}
              index={index}
              set={set}
              onSave={onUpdateSet}
              onDelete={onDeleteSet}
            />
          ))
        ) : (
          <p className="rounded-md border bg-muted/35 px-3 py-3 text-sm text-muted-foreground">
            세트 기록이 없어요.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function CardioEditor({ entry, onSave, onDelete }: CardioEditorProps) {
  const [name, setName] = useState(entry.name)
  const [duration, setDuration] = useState(String(entry.duration_minutes))
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    const nextName = name.trim()
    const durationMinutes = Number(duration)
    if (!nextName || Number.isNaN(durationMinutes) || durationMinutes < 1) {
      return
    }

    setIsSaving(true)
    await onSave(entry.id, nextName, durationMinutes)
    setIsSaving(false)
  }

  return (
    <div className="grid grid-cols-[1fr_5rem_auto_auto] items-center gap-2 rounded-md border bg-background px-2 py-2">
      <Input
        aria-label="유산소 이름"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-10"
      />
      <Input
        aria-label="유산소 시간"
        type="number"
        min={1}
        value={duration}
        onChange={(event) => setDuration(event.target.value)}
        className="h-10"
      />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={save}
        disabled={isSaving}
        aria-label="유산소 저장"
      >
        <Check className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => onDelete(entry.id)}
        aria-label="유산소 삭제"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

export function SessionDetail({ session }: SessionDetailProps) {
  const router = useRouter()
  const [draftSession, setDraftSession] = useState(session)
  const [error, setError] = useState<string | null>(null)
  const [isDeletingSession, setIsDeletingSession] = useState(false)

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
      setDraftSession((current) => ({
        ...current,
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => (set.id === setId ? updatedSet : set)),
        })),
      }))
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

      setDraftSession((current) => ({
        ...current,
        exercises: current.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.filter((set) => set.id !== setId),
        })),
      }))
    } catch {
      setError('삭제하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function renameExercise(exerciseId: string, name: string) {
    setError(null)
    try {
      const response = await fetch(`/api/workouts/exercises/${exerciseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        throw new Error('Failed to rename exercise')
      }

      const updatedExercise = (await response.json()) as WorkoutExerciseWithSets
      setDraftSession((current) => ({
        ...current,
        exercises: current.exercises.map((exercise) =>
          exercise.id === exerciseId
            ? { ...updatedExercise, sets: updatedExercise.sets || exercise.sets }
            : exercise
        ),
      }))
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function deleteExercise(exerciseId: string) {
    setError(null)
    try {
      const response = await fetch(`/api/workouts/exercises/${exerciseId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete exercise')
      }

      setDraftSession((current) => ({
        ...current,
        exercises: current.exercises.filter((exercise) => exercise.id !== exerciseId),
      }))
    } catch {
      setError('삭제하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function updateCardio(entryId: string, name: string, durationMinutes: number) {
    setError(null)
    try {
      const response = await fetch(`/api/workouts/cardio/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, duration_minutes: durationMinutes }),
      })

      if (!response.ok) {
        throw new Error('Failed to update cardio entry')
      }

      const updatedEntry = (await response.json()) as WorkoutCardioEntry
      setDraftSession((current) => ({
        ...current,
        cardio_entries: current.cardio_entries.map((entry) =>
          entry.id === entryId ? updatedEntry : entry
        ),
      }))
    } catch {
      setError('저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function deleteCardio(entryId: string) {
    setError(null)
    try {
      const response = await fetch(`/api/workouts/cardio/${entryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete cardio entry')
      }

      setDraftSession((current) => ({
        ...current,
        cardio_entries: current.cardio_entries.filter((entry) => entry.id !== entryId),
      }))
    } catch {
      setError('삭제하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  async function deleteSession() {
    setError(null)
    setIsDeletingSession(true)
    try {
      const response = await fetch(`/api/workouts/sessions/${draftSession.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete workout session')
      }

      router.replace('/workouts/history')
      router.refresh()
    } catch {
      setIsDeletingSession(false)
      setError('기록을 삭제하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">운동 상세</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {draftSession.session_date}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/workouts/history">기록으로 돌아가기</Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">기록 삭제</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>운동 기록을 삭제할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  이 날짜의 운동 종목, 세트, 유산소 기록이 함께 삭제됩니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault()
                    void deleteSession()
                  }}
                  disabled={isDeletingSession}
                >
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {draftSession.exercises.map((exercise) => (
        <ExerciseEditor
          key={exercise.id}
          exercise={exercise}
          onRename={renameExercise}
          onDelete={deleteExercise}
          onUpdateSet={updateSet}
          onDeleteSet={deleteSet}
        />
      ))}

      {draftSession.cardio_entries.length > 0 && (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              유산소
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {draftSession.cardio_entries.map((entry) => (
              <CardioEditor
                key={entry.id}
                entry={entry}
                onSave={updateCardio}
                onDelete={deleteCardio}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
