import { createClient } from '@/lib/supabase/server'
import { addWorkoutCardioEntry } from '@/lib/db'
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
    const { session_id, name, duration_minutes } = body

    if (!session_id || !name || !duration_minutes) {
      return NextResponse.json(
        { error: 'session_id, name, and duration_minutes are required' },
        { status: 400 }
      )
    }

    const cardio = await addWorkoutCardioEntry(session_id, user.id, {
      name,
      duration_minutes: Number(duration_minutes),
    })

    return NextResponse.json(cardio)
  } catch (error) {
    console.error('Error in POST /api/workouts/cardio:', error)
    return NextResponse.json(
      { error: 'Failed to add cardio entry' },
      { status: 500 }
    )
  }
}
