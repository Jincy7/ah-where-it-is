'use client'

import { ReactNode, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { WorkoutSessionDetails } from '@/lib/db'

interface CompleteWorkoutDialogProps {
  session: WorkoutSessionDetails
  children: ReactNode
  onComplete: () => Promise<void>
}

export function CompleteWorkoutDialog({
  session,
  children,
  onComplete,
}: CompleteWorkoutDialogProps) {
  const [open, setOpen] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const setCount = session.exercises.reduce(
    (total, exercise) => total + exercise.sets.length,
    0
  )

  async function complete() {
    setIsCompleting(true)
    await onComplete()
    setIsCompleting(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>운동 완료</DialogTitle>
          <DialogDescription>
            오늘 기록을 마치면 진행 중인 운동에서 사라지고 기록에 남습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 rounded-lg bg-muted/35 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">종목</span>
            <span className="font-medium">{session.exercises.length}개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">세트</span>
            <span className="font-medium">{setCount}개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">유산소</span>
            <span className="font-medium">{session.cardio_entries.length}개</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            계속 기록
          </Button>
          <Button onClick={complete} disabled={isCompleting}>
            {isCompleting ? '저장 중...' : '완료'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
