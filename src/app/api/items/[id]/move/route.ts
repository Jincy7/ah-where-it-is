import { createClient } from '@/lib/supabase/server'
import { moveItemToContainer } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { newContainerId } = await request.json()

    if (!newContainerId) {
      return NextResponse.json(
        { error: 'New container ID is required' },
        { status: 400 }
      )
    }

    const movedItem = await moveItemToContainer(id, newContainerId)

    return NextResponse.json(movedItem)
  } catch (error) {
    console.error('Error in PATCH /api/items/[id]/move:', error)
    const message = error instanceof Error ? error.message : 'Failed to move item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
