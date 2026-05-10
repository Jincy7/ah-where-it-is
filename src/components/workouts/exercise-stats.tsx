import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ExerciseStats as ExerciseStatsData } from '@/lib/db'

interface ExerciseStatsProps {
  stats: ExerciseStatsData
}

const comparisonLabel = {
  increased: '증가',
  decreased: '감소',
  unchanged: '유지',
}

export function ExerciseStats({ stats }: ExerciseStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>최고 기록</CardTitle>
          <CardDescription>가장 높은 무게와 반복 수 기준입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.highestSet ? (
            <div className="space-y-1">
              <p className="text-3xl font-bold">
                {stats.highestSet.weight}kg / {stats.highestSet.reps}회
              </p>
              <p className="text-sm text-muted-foreground">
                {stats.highestSet.sessionDate}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">아직 세트 기록이 없어요.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>최근 비교</CardTitle>
          <CardDescription>이전 완료 세션과 최근 세션을 비교합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentComparison ? (
            <div className="space-y-3">
              <Badge>{comparisonLabel[stats.recentComparison.status]}</Badge>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {stats.recentComparison.latestSessionDate}
                  </span>
                  <span className="font-medium">
                    {stats.recentComparison.latestBestSet.weight}kg /{' '}
                    {stats.recentComparison.latestBestSet.reps}회
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {stats.recentComparison.previousSessionDate}
                  </span>
                  <span className="font-medium">
                    {stats.recentComparison.previousBestSet.weight}kg /{' '}
                    {stats.recentComparison.previousBestSet.reps}회
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              같은 종목을 두 번 이상 완료하면 비교가 나타납니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
