import { createClient } from '@/lib/supabase/server'
import {
  deleteContainer,
  deleteContainerImage,
  getContainer,
  updateContainer,
  uploadContainerImage,
  replaceContainerImage,
} from '@/lib/db'
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

    // Get container to check ownership
    const container = await getContainer(id)

    if (!container) {
      return NextResponse.json({ error: 'Container not found' }, { status: 404 })
    }

    if (container.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const name = formData.get('name') as string
    const location_id = formData.get('location_id') as string | null
    const photo = formData.get('photo') as File | null
    const removePhoto = formData.get('remove_photo') === 'true'

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    let photoUrl = container.internal_photo_url

    // Handle photo updates
    if (removePhoto && photoUrl) {
      // Remove existing photo
      try {
        await deleteContainerImage(photoUrl)
        photoUrl = null
      } catch (error) {
        console.error('Error deleting image:', error)
      }
    } else if (photo) {
      // Replace or upload new photo
      try {
        if (photoUrl) {
          const result = await replaceContainerImage(photo, user.id, id, photoUrl)
          photoUrl = result.publicUrl
        } else {
          const result = await uploadContainerImage(photo, user.id, id)
          photoUrl = result.publicUrl
        }
      } catch (error) {
        console.error('Error uploading image:', error)
        return NextResponse.json(
          { error: 'Failed to upload image' },
          { status: 500 }
        )
      }
    }

    // Update container
    const updatedContainer = await updateContainer(id, {
      name,
      location_id: location_id || null,
      internal_photo_url: photoUrl,
    })

    return NextResponse.json(updatedContainer)
  } catch (error) {
    console.error('Error in PATCH /api/containers/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update container' },
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

    // Get container to check ownership and photo
    const container = await getContainer(id)

    if (!container) {
      return NextResponse.json({ error: 'Container not found' }, { status: 404 })
    }

    if (container.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete photo from storage if exists
    if (container.internal_photo_url) {
      try {
        await deleteContainerImage(container.internal_photo_url)
      } catch (error) {
        console.error('Error deleting container image:', error)
        // Continue with container deletion even if image deletion fails
      }
    }

    // Delete container (items will be cascade deleted)
    await deleteContainer(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/containers/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to delete container' },
      { status: 500 }
    )
  }
}
