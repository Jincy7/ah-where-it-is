import { createClient } from '@/lib/supabase/server'
import { deleteItem, getItem, updateItem, getContainer } from '@/lib/db'
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

    // Get item and verify ownership
    const item = await getItem(id)
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const container = await getContainer(item.container_id)
    if (!container || container.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, quantity, description } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (quantity !== undefined && quantity < 1) {
      return NextResponse.json(
        { error: 'Quantity must be at least 1' },
        { status: 400 }
      )
    }

    // Update item
    const updatedItem = await updateItem(id, {
      name,
      quantity,
      description: description || null,
    })

    return NextResponse.json(updatedItem)
  } catch (error) {
    console.error('Error in PATCH /api/items/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Get item and verify ownership
    const item = await getItem(id)
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const container = await getContainer(item.container_id)
    if (!container || container.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete item
    await deleteItem(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/items/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    )
  }
}
