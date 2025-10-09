'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    // Validation
    if (!email || !password || !confirmPassword) {
      toast.error('모든 필드를 입력해주세요')
      return
    }

    if (password.length < 6) {
      toast.error('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }

    if (password !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) {
        toast.error('회원가입 실패: ' + error.message)
        setLoading(false)
        return
      }

      if (data.user) {
        // Check if email confirmation is required
        if (data.user.identities && data.user.identities.length === 0) {
          toast.error('이미 가입된 이메일입니다')
          setLoading(false)
          return
        }

        // For local development, Supabase auto-confirms
        // In production with email confirmation enabled, show different message
        if (data.session) {
          toast.success('회원가입이 완료되었습니다!')
          router.push('/')
          router.refresh()
        } else {
          toast.success('회원가입이 완료되었습니다! 이메일을 확인해주세요.')
          router.push('/login')
        }
      }
    } catch (error) {
      toast.error('회원가입 중 오류가 발생했습니다')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
          autoComplete="new-password"
          minLength={6}
        />
        <p className="text-xs text-muted-foreground">최소 6자 이상</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">비밀번호 확인</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          required
          autoComplete="new-password"
          minLength={6}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            가입 중...
          </>
        ) : (
          '회원가입'
        )}
      </Button>
    </form>
  )
}
