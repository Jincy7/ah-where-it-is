import { createClient } from '@/lib/supabase/server'
import { addWorkoutExercise, type BodyPart } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

const bodyParts: BodyPart[] = ['chest', 'back', 'shoulders', 'lower_body', 'arms', 'core']

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
    const { session_id, name, body_part, exercise_favorite_id } = body

    if (!session_id || !name || !bodyParts.includes(body_part)) {
      return NextResponse.json(
        { error: 'session_id, name, and body_part are required' },
        { status: 400 }
      )
    }

    const exercise = await addWorkoutExercise(session_id, user.id, {
      name,
      body_part,
      exercise_favorite_id: exercise_favorite_id || null,
    })

    return NextResponse.json(exercise)
  } catch (error) {
    console.error('Error in POST /api/workouts/exercises:', error)
    return NextResponse.json(
      { error: 'Failed to add workout exercise' },
      { status: 500 }
    )
  }
}
