'use client'

import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { WorkoutSet } from '@/lib/db'

interface SetRowProps {
  index: number
  set: WorkoutSet
  onSave: (setId: string, weight: number, reps: number) => Promise<void>
  onDelete: (setId: string) => Promise<void>
}

export function SetRow({ index, set, onSave, onDelete }: SetRowProps) {
  const [weight, setWeight] = useState(String(Number(set.weight)))
  const [reps, setReps] = useState(String(set.reps))
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    const nextWeight = Number(weight)
    const nextReps = Number(reps)
    if (Number.isNaN(nextWeight) || Number.isNaN(nextReps) || nextReps < 1) {
      return
    }

    setIsSaving(true)
    await onSave(set.id, nextWeight, nextReps)
    setIsSaving(false)
  }

  return (
    <div className="grid min-h-11 grid-cols-[2.5rem_1fr_1fr_auto_auto] items-center gap-2 rounded-md border bg-background px-2 py-2">
      <span className="text-sm font-semibold text-muted-foreground">{index + 1}</span>
      <Input
        aria-label="weight"
        type="number"
        min={0}
        step="0.5"
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
        className="h-10"
      />
      <Input
        aria-label="reps"
        type="number"
        min={1}
        value={reps}
        onChange={(event) => setReps(event.target.value)}
        className="h-10"
      />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={save}
        disabled={isSaving}
        aria-label="세트 저장"
      >
        <Check className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => onDelete(set.id)}
        aria-label="세트 삭제"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
