import { createClient } from '@/lib/supabase/server'
import { createWorkoutSession } from '@/lib/db'
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

    const body = await request.json().catch(() => ({}))
    const session = await createWorkoutSession(user.id, body.session_date)

    return NextResponse.json(session)
  } catch (error) {
    console.error('Error in POST /api/workouts/sessions:', error)
    return NextResponse.json(
      { error: 'Failed to create workout session' },
      { status: 500 }
    )
  }
}
