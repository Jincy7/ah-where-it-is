import Link from 'next/link'
import { Archive, ArrowRight, Dumbbell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function LifeLogHome() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">오늘의 생활 기록</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          잊기 쉬운 것들을 바로 남겨요
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
              <Archive className="size-5" />
            </div>
            <CardTitle>보관함</CardTitle>
            <CardDescription>물건 위치와 보관함을 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full justify-between">
              <Link href="/storage">
                보관함 열기
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary">
              <Dumbbell className="size-5" />
            </div>
            <CardTitle>운동</CardTitle>
            <CardDescription>오늘 한 운동을 세트별로 기록합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full justify-between">
              <Link href="/workouts">
                운동 기록
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
