import { createClient } from '@/lib/supabase/server'
import { getAllContainersForMove } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const containers = await getAllContainersForMove()

    return NextResponse.json(containers)
  } catch (error) {
    console.error('Error in GET /api/containers/move-list:', error)
    return NextResponse.json(
      { error: 'Failed to fetch containers' },
      { status: 500 }
    )
  }
}
