import { createClient } from '@/lib/supabase/server'
import { addWorkoutSet } from '@/lib/db'
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
    const { workout_exercise_id, weight, reps } = body

    if (!workout_exercise_id || weight === undefined || reps === undefined) {
      return NextResponse.json(
        { error: 'workout_exercise_id, weight, and reps are required' },
        { status: 400 }
      )
    }

    const set = await addWorkoutSet(workout_exercise_id, user.id, {
      weight: Number(weight),
      reps: Number(reps),
    })

    return NextResponse.json(set)
  } catch (error) {
    console.error('Error in POST /api/workouts/sets:', error)
    return NextResponse.json(
      { error: 'Failed to add workout set' },
      { status: 500 }
    )
  }
}
