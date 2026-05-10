'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Bike, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import type { BodyPart, ExerciseFavorite } from '@/lib/db'

const bodyPartTabs: { value: BodyPart; label: string }[] = [
  { value: 'chest', label: '가슴' },
  { value: 'back', label: '등' },
  { value: 'shoulders', label: '어깨' },
  { value: 'lower_body', label: '하체' },
  { value: 'arms', label: '팔' },
  { value: 'core', label: '코어' },
]

interface ExercisePickerProps {
  sessionId: string
  favorites: ExerciseFavorite[]
  onAddExercise: (payload: {
    name: string
    body_part: BodyPart
    exercise_favorite_id?: string | null
  }) => Promise<void>
  onAddCardio: (name: string, durationMinutes: number) => Promise<void>
}

export function ExercisePicker({
  sessionId,
  favorites,
  onAddExercise,
  onAddCardio,
}: ExercisePickerProps) {
  const [selectedBodyPart, setSelectedBodyPart] = useState<BodyPart>('chest')
  const [exerciseName, setExerciseName] = useState('')
  const [cardioName, setCardioName] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('20')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const favoritesByBodyPart = useMemo(() => {
    return bodyPartTabs.reduce<Record<BodyPart, ExerciseFavorite[]>>(
      (groups, tab) => {
        groups[tab.value] = favorites.filter(
          (favorite) => favorite.body_part === tab.value
        )
        return groups
      },
      {
        chest: [],
        back: [],
        shoulders: [],
        lower_body: [],
        arms: [],
        core: [],
      }
    )
  }, [favorites])

  async function submitExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = exerciseName.trim()
    if (!name) {
      return
    }

    setIsSubmitting(true)
    await onAddExercise({ name, body_part: selectedBodyPart })
    setExerciseName('')
    setIsSubmitting(false)
  }

  async function submitCardio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = cardioName.trim()
    const minutes = Number(durationMinutes)
    if (!name || !minutes || minutes < 1) {
      return
    }

    setIsSubmitting(true)
    await onAddCardio(name, minutes)
    setCardioName('')
    setDurationMinutes('20')
    setIsSubmitting(false)
  }

  return (
    <div className="space-y-4" data-session-id={sessionId}>
      <Tabs
        value={selectedBodyPart}
        onValueChange={(value) => setSelectedBodyPart(value as BodyPart)}
      >
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
          {bodyPartTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="h-10">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {bodyPartTabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {favoritesByBodyPart[tab.value].length > 0 ? (
                favoritesByBodyPart[tab.value].map((favorite) => (
                  <Button
                    key={favorite.id}
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() =>
                      onAddExercise({
                        name: favorite.name,
                        body_part: tab.value,
                        exercise_favorite_id: favorite.id,
                      })
                    }
                  >
                    {favorite.name}
                  </Button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  자주 하는 종목을 직접 추가해 주세요.
                </p>
              )}
            </div>

            <form onSubmit={submitExercise} className="flex gap-2">
              <Input
                value={exerciseName}
                onChange={(event) => setExerciseName(event.target.value)}
                placeholder={`${tab.label} 종목 이름`}
                className="h-11"
              />
              <Button type="submit" disabled={isSubmitting} className="h-11 gap-2">
                <Plus className="size-4" />
                종목 추가
              </Button>
            </form>
          </TabsContent>
        ))}
      </Tabs>

      <form
        onSubmit={submitCardio}
        className="grid gap-2 rounded-lg border bg-muted/35 p-3 sm:grid-cols-[1fr_8rem_auto]"
      >
        <div className="space-y-1">
          <Label htmlFor="cardio-name" className="gap-2">
            <Bike className="size-4" />
            유산소
          </Label>
          <Input
            id="cardio-name"
            value={cardioName}
            onChange={(event) => setCardioName(event.target.value)}
            placeholder="러닝, 자전거"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cardio-duration">시간</Label>
          <Input
            id="cardio-duration"
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            placeholder="분"
          />
        </div>
        <Button type="submit" disabled={isSubmitting} className="self-end">
          추가
        </Button>
      </form>
    </div>
  )
}
