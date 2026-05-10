'use client'

import { useEffect, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RestTimerProps {
  startSignal: number
  durationSeconds?: number
  className?: string
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function RestTimer({
  startSignal,
  durationSeconds = 90,
  className,
}: RestTimerProps) {
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

  function toggleTimer() {
    if (remaining <= 0) {
      setRemaining(durationSeconds)
      setIsRunning(true)
      return
    }

    setIsRunning((value) => !value)
  }

  return (
    <div
      className={cn(
        'fixed inset-x-3 bottom-[4.75rem] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 md:bottom-4',
        className
      )}
    >
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
            setIsRunning(false)
          }}
          aria-label="타이머 리셋"
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={toggleTimer}
          aria-label={isRunning ? '타이머 일시정지' : '타이머 재생'}
        >
          {isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
      </div>
    </div>
  )
}
