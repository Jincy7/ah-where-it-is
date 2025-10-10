import { createClient } from '@/lib/supabase/server'
import { createContainer, uploadContainerImage, getContainers } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const containers = await getContainers(user.id)

    return NextResponse.json(containers)
  } catch (error) {
    console.error('Error in GET /api/containers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch containers' },
      { status: 500 }
    )
  }
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

    const formData = await request.formData()
    const name = formData.get('name') as string
    const location_id = formData.get('location_id') as string | null
    const photo = formData.get('photo') as File | null

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    let photoUrl: string | undefined

    // Generate temporary container ID for file naming
    const tempContainerId = crypto.randomUUID()

    // Upload photo if provided
    if (photo) {
      try {
        const result = await uploadContainerImage(photo, user.id, tempContainerId)
        photoUrl = result.publicUrl
      } catch (error) {
        console.error('Error uploading image:', error)
        return NextResponse.json(
          { error: 'Failed to upload image' },
          { status: 500 }
        )
      }
    }

    // Create container
    const container = await createContainer({
      user_id: user.id,
      name,
      location_id: location_id || null,
      internal_photo_url: photoUrl || null,
    })

    return NextResponse.json(container)
  } catch (error) {
    console.error('Error in POST /api/containers:', error)
    return NextResponse.json(
      { error: 'Failed to create container' },
      { status: 500 }
    )
  }
}
