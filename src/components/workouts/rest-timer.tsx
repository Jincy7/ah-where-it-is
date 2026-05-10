'use client'

import { useEffect, useState } from 'react'
import { RotateCcw, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RestTimerProps {
  startSignal: number
  durationSeconds?: number
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function RestTimer({ startSignal, durationSeconds = 90 }: RestTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    if (startSignal > 0) {
      setRemaining(durationSeconds)
      setIsRunning(true)
    }
  }, [durationSeconds, startSignal])

  useEffect(() => {
    if (!isRunning) {
      return
    }

    const interval = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(interval)
          setIsRunning(false)
          return 0
        }
        return value - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [isRunning])

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/35 p-3">
      <div>
        <p className="text-sm font-medium text-muted-foreground">휴식 타이머</p>
        <p className="text-3xl font-bold tabular-nums">{formatSeconds(remaining)}</p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={() => {
            setRemaining(durationSeconds)
            setIsRunning(true)
          }}
          aria-label="타이머 리셋"
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => setIsRunning(false)}
          aria-label="타이머 정지"
        >
          <Square className="size-4" />
        </Button>
      </div>
    </div>
  )
}
