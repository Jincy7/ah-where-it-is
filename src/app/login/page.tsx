import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/auth/login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function LoginPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If user is already logged in, redirect to home
  if (user) {
    redirect('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">아 그거 어딨지</h1>
          <p className="text-lg text-muted-foreground">보관함 관리 시스템</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>로그인</CardTitle>
            <CardDescription>
              계정 정보를 입력하여 로그인하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LoginForm />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  또는
                </span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                계정이 없으신가요?{' '}
                <Link href="/signup" className="font-medium text-primary hover:underline">
                  회원가입
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          물건을 잃어버리지 않도록 도와드립니다
        </p>
      </div>
    </div>
  )
}
