import { createClient } from '@/lib/supabase/server'
import { createItem, getContainer } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, container_id } = body

    if (!name || !container_id) {
      return NextResponse.json(
        { error: 'Name and container_id are required' },
        { status: 400 }
      )
    }

    // Verify container ownership
    const container = await getContainer(container_id)
    if (!container || container.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Container not found or access denied' },
        { status: 404 }
      )
    }

    // Create item
    const item = await createItem({
      container_id,
      name,
      description: description || null,
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('Error in POST /api/items:', error)
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    )
  }
}
