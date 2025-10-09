import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLocation, updateLocation, deleteLocation } from '@/lib/db'

/**
 * GET /api/locations/[id]
 * Get a single location by ID
 */
export async function GET(
  request: Request,
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
    const location = await getLocation(id)

    if (!location) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (location.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(location)
  } catch (error) {
    console.error('Error fetching location:', error)
    return NextResponse.json(
      { error: 'Failed to fetch location' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/locations/[id]
 * Update a location
 */
export async function PATCH(
  request: Request,
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

    // Verify location exists and user owns it
    const existingLocation = await getLocation(id)
    if (!existingLocation) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      )
    }

    if (existingLocation.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description } = body

    if (name !== undefined && (!name || typeof name !== 'string')) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const updatedLocation = await updateLocation(id, {
      name,
      description: description === '' ? null : description,
    })

    return NextResponse.json(updatedLocation)
  } catch (error) {
    console.error('Error updating location:', error)
    return NextResponse.json(
      { error: 'Failed to update location' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/locations/[id]
 * Delete a location
 */
export async function DELETE(
  request: Request,
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

    // Verify location exists and user owns it
    const existingLocation = await getLocation(id)
    if (!existingLocation) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      )
    }

    if (existingLocation.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deleteLocation(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting location:', error)
    return NextResponse.json(
      { error: 'Failed to delete location' },
      { status: 500 }
    )
  }
}
