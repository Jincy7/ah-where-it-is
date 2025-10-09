import { createClient } from '@/lib/supabase/server'
import { getContainers } from '@/lib/db'
import { ContainerList } from '@/components/containers/container-list'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If not authenticated, redirect to login
  if (!user) {
    redirect('/login')
  }

  const containers = await getContainers(user.id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">보관함</h1>
          <p className="text-muted-foreground">
            {containers.length}개의 보관함
          </p>
        </div>
        <Button asChild>
          <Link href="/container/new">
            <Plus className="mr-2 h-4 w-4" />
            새 보관함
          </Link>
        </Button>
      </div>

      {/* Container List */}
      <ContainerList containers={containers} />
    </div>
  )
}
