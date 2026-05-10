import { Badge } from '@/components/ui/badge'
import type { WeeklyWorkoutStats } from '@/lib/db'

interface WeeklySummaryProps {
  stats: WeeklyWorkoutStats
}

export function WeeklySummary({ stats }: WeeklySummaryProps) {
  const label =
    stats.difference > 0
      ? `지난주보다 ${stats.difference}회 더 했어요`
      : stats.difference < 0
        ? `지난주보다 ${Math.abs(stats.difference)}회 적어요`
        : '지난주와 같아요'

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/35 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">이번 주 운동</p>
        <p className="text-2xl font-bold">{stats.currentWeek}회</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">지난주 {stats.previousWeek}회</Badge>
        <Badge>{label}</Badge>
      </div>
    </div>
  )
}
