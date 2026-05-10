import { createClient } from '@/lib/supabase/server'
import { deleteWorkoutExercise, updateWorkoutExercise, type BodyPart } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

const bodyParts: BodyPart[] = ['chest', 'back', 'shoulders', 'lower_body', 'arms', 'core']

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
    const update: { name?: string; body_part?: BodyPart } = {}

    if (typeof body.name === 'string') {
      update.name = body.name
    }
    if (body.body_part && bodyParts.includes(body.body_part)) {
      update.body_part = body.body_part
    }

    const exercise = await updateWorkoutExercise(id, user.id, update)
    return NextResponse.json(exercise)
  } catch (error) {
    console.error('Error in PATCH /api/workouts/exercises/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update workout exercise' },
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
    await deleteWorkoutExercise(id, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/workouts/exercises/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to delete workout exercise' },
      { status: 500 }
    )
  }
}
