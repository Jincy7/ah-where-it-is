import { createClient } from '@/lib/supabase/server'
import { deleteWorkoutCardioEntry, updateWorkoutCardioEntry } from '@/lib/db'
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
    const body = await request.json()
    const cardio = await updateWorkoutCardioEntry(id, user.id, {
      name: body.name,
      duration_minutes:
        body.duration_minutes === undefined ? undefined : Number(body.duration_minutes),
    })

    return NextResponse.json(cardio)
  } catch (error) {
    console.error('Error in PATCH /api/workouts/cardio/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update cardio entry' },
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
    await deleteWorkoutCardioEntry(id, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/workouts/cardio/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to delete cardio entry' },
      { status: 500 }
    )
  }
}
