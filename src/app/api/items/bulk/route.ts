import { createClient } from '@/lib/supabase/server'
import { createBulkItems, getContainer } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

interface BulkItemData {
  name: string
  quantity: number
  description?: string
}

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
    const { items, container_id } = body as {
      items: BulkItemData[]
      container_id: string
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (!container_id) {
      return NextResponse.json(
        { error: 'container_id is required' },
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

    // Validate each item
    for (const item of items) {
      if (!item.name || item.name.trim() === '') {
        return NextResponse.json(
          { error: 'All items must have a name' },
          { status: 400 }
        )
      }
      if (!item.quantity || item.quantity < 1) {
        return NextResponse.json(
          { error: 'All items must have a valid quantity (>= 1)' },
          { status: 400 }
        )
      }
    }

    // Expand items based on quantity
    const expandedItems = items.flatMap((item) => {
      return Array.from({ length: item.quantity }, () => ({
        container_id,
        name: item.name,
        description: item.description || null,
      }))
    })

    // Create all items in bulk
    const createdItems = await createBulkItems(expandedItems)

    return NextResponse.json({
      items: createdItems,
      count: createdItems.length,
    })
  } catch (error) {
    console.error('Error in POST /api/items/bulk:', error)
    return NextResponse.json(
      { error: 'Failed to create items' },
      { status: 500 }
    )
  }
}
