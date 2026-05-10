import { createClient } from '@/lib/supabase/server'
import {
  completeWorkoutSession,
  deleteWorkoutSession,
  getWorkoutSessionDetails,
} from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
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
    const session = await getWorkoutSessionDetails(id, user.id)

    if (!session) {
      return NextResponse.json({ error: 'Workout session not found' }, { status: 404 })
    }

    return NextResponse.json(session)
  } catch (error) {
    console.error('Error in GET /api/workouts/sessions/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to fetch workout session' },
      { status: 500 }
    )
  }
}

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
    const body = await request.json().catch(() => ({}))

    if (body.status !== 'completed' && body.action !== 'complete') {
      return NextResponse.json(
        { error: 'Unsupported workout session update' },
        { status: 400 }
      )
    }

    const session = await completeWorkoutSession(id, user.id)
    return NextResponse.json(session)
  } catch (error) {
    console.error('Error in PATCH /api/workouts/sessions/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to update workout session' },
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
    await deleteWorkoutSession(id, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/workouts/sessions/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to delete workout session' },
      { status: 500 }
    )
  }
}
