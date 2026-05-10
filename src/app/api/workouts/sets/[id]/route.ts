import { createClient } from '@/lib/supabase/server'
import { deleteWorkoutSet, updateWorkoutSet } from '@/lib/db'
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
    const set = await updateWorkoutSet(id, user.id, {
      weight: body.weight === undefined ? undefined : Number(body.weight),
      reps: body.reps === undefined ? undefined : Number(body.reps),
    })

    return NextResponse.json(set)
  } catch (error) {
    console.error('Error in PATCH /api/workouts/sets/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update workout set' },
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
    await deleteWorkoutSet(id, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/workouts/sets/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to delete workout set' },
      { status: 500 }
    )
  }
}
