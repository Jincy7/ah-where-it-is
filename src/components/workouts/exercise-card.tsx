'use client'

import { Plus } from 'lucide-react'
import { SetRow } from '@/components/workouts/set-row'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { WorkoutExerciseWithSets } from '@/lib/db'

interface ExerciseCardProps {
  exercise: WorkoutExerciseWithSets
  onAddSet: (
    exercise: WorkoutExerciseWithSets,
    weight: number,
    reps: number
  ) => Promise<void>
  onUpdateSet: (setId: string, weight: number, reps: number) => Promise<void>
  onDeleteSet: (setId: string) => Promise<void>
}

export function ExerciseCard({
  exercise,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
}: ExerciseCardProps) {
  const lastSet = exercise.sets.at(-1)
  const nextWeight = lastSet ? Number(lastSet.weight) : 20
  const nextReps = lastSet ? lastSet.reps : 10

  return (
    <Card className="rounded-lg py-4">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="flex items-center justify-between gap-3 text-lg">
          <span>{exercise.name}</span>
          <span className="text-sm font-medium text-muted-foreground">
            {exercise.sets.length}세트
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div className="space-y-2">
          {exercise.sets.map((set, index) => (
            <SetRow
              key={set.id}
              index={index}
              set={set}
              onSave={onUpdateSet}
              onDelete={onDeleteSet}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full gap-2"
          onClick={() => onAddSet(exercise, nextWeight, nextReps)}
        >
          <Plus className="size-4" />
          세트 추가
        </Button>
      </CardContent>
    </Card>
  )
}
