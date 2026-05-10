import { createClient } from '@/lib/supabase/server'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/supabase'

export type BodyPart = 'chest' | 'back' | 'shoulders' | 'lower_body' | 'arms' | 'core'

export type WorkoutSession = Tables<'workout_sessions'>
export type WorkoutSessionInsert = TablesInsert<'workout_sessions'>
export type WorkoutSessionUpdate = TablesUpdate<'workout_sessions'>
export type ExerciseFavorite = Tables<'exercise_favorites'>
export type ExerciseFavoriteInsert = TablesInsert<'exercise_favorites'>
export type WorkoutExercise = Tables<'workout_exercises'>
export type WorkoutExerciseUpdate = TablesUpdate<'workout_exercises'>
export type WorkoutSet = Tables<'workout_sets'>
export type WorkoutCardioEntry = Tables<'workout_cardio_entries'>

export type WorkoutExerciseWithSets = WorkoutExercise & {
  sets: WorkoutSet[]
}

export type WorkoutSessionDetails = WorkoutSession & {
  exercises: WorkoutExerciseWithSets[]
  cardio_entries: WorkoutCardioEntry[]
}

export interface AddWorkoutExerciseInput {
  name: string
  body_part: BodyPart
  exercise_favorite_id?: string | null
}

export interface AddWorkoutSetInput {
  weight: number
  reps: number
}

export interface AddWorkoutCardioInput {
  name: string
  duration_minutes: number
}

export interface WeeklyWorkoutStats {
  currentWeek: number
  previousWeek: number
  difference: number
}

export interface ExerciseStatsSet {
  weight: number
  reps: number
  sessionDate: string
}

export interface ExerciseStatsComparison {
  status: 'increased' | 'decreased' | 'unchanged'
  latestSessionDate: string
  previousSessionDate: string
  latestBestSet: ExerciseStatsSet
  previousBestSet: ExerciseStatsSet
}

export interface ExerciseStats {
  exerciseName: string
  sessionsLogged: number
  highestSet: ExerciseStatsSet | null
  recentComparison: ExerciseStatsComparison | null
}

const workoutSessionDetailsSelect = `
  *,
  exercises:workout_exercises(
    *,
    sets:workout_sets(*)
  ),
  cardio_entries:workout_cardio_entries(*)
`

function normalizeSessionDetails(session: WorkoutSessionDetails): WorkoutSessionDetails {
  return {
    ...session,
    exercises: [...(session.exercises || [])]
      .map((exercise) => ({
        ...exercise,
        sets: [...(exercise.sets || [])].sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
    cardio_entries: [...(session.cardio_entries || [])].sort(
      (a, b) => a.sort_order - b.sort_order
    ),
  }
}

function todayIsoDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10)
  }

  return `${year}-${month}-${day}`
}

function dateOnlyToUtcDate(dateOnly: string) {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDaysToDateOnly(dateOnly: string, days: number) {
  const date = dateOnlyToUtcDate(dateOnly)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfWeekDateOnly(dateOnly: string) {
  const date = dateOnlyToUtcDate(dateOnly)
  return addDaysToDateOnly(dateOnly, -date.getUTCDay())
}

function compareSets(a: ExerciseStatsSet, b: ExerciseStatsSet) {
  if (a.weight !== b.weight) {
    return a.weight - b.weight
  }
  return a.reps - b.reps
}

function bestSetForSession(
  sets: WorkoutSet[],
  sessionDate: string
): ExerciseStatsSet | null {
  const best = sets.reduce<WorkoutSet | null>((current, next) => {
    if (!current) {
      return next
    }
    if (Number(next.weight) > Number(current.weight)) {
      return next
    }
    if (Number(next.weight) === Number(current.weight) && next.reps > current.reps) {
      return next
    }
    return current
  }, null)

  if (!best) {
    return null
  }

  return {
    weight: Number(best.weight),
    reps: best.reps,
    sessionDate,
  }
}

async function assertSessionOwner(sessionId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw new Error('Workout session not found or access denied')
  }
}

async function assertWorkoutExerciseOwner(
  workoutExerciseId: string,
  userId: string
): Promise<WorkoutExercise> {
  const supabase = await createClient()
  const { data: exercise, error: exerciseError } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('id', workoutExerciseId)
    .single()

  if (exerciseError || !exercise) {
    throw new Error('Workout exercise not found or access denied')
  }

  await assertSessionOwner(exercise.session_id, userId)
  return exercise
}

async function assertWorkoutSetOwner(setId: string, userId: string): Promise<WorkoutSet> {
  const supabase = await createClient()
  const { data: set, error } = await supabase
    .from('workout_sets')
    .select('*')
    .eq('id', setId)
    .single()

  if (error || !set) {
    throw new Error('Workout set not found or access denied')
  }

  await assertWorkoutExerciseOwner(set.workout_exercise_id, userId)
  return set
}

async function assertCardioOwner(
  cardioId: string,
  userId: string
): Promise<WorkoutCardioEntry> {
  const supabase = await createClient()
  const { data: cardio, error } = await supabase
    .from('workout_cardio_entries')
    .select('*')
    .eq('id', cardioId)
    .single()

  if (error || !cardio) {
    throw new Error('Cardio entry not found or access denied')
  }

  await assertSessionOwner(cardio.session_id, userId)
  return cardio
}

export async function getActiveWorkoutSession(
  userId: string
): Promise<WorkoutSessionDetails | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_sessions')
      .select(workoutSessionDetailsSelect)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to fetch active workout session: ${error.message}`)
    }

    return data ? normalizeSessionDetails(data as unknown as WorkoutSessionDetails) : null
  } catch (error) {
    console.error('Error in getActiveWorkoutSession:', error)
    throw error
  }
}

export async function getWorkoutSessionDetails(
  sessionId: string,
  userId: string
): Promise<WorkoutSessionDetails | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_sessions')
      .select(workoutSessionDetailsSelect)
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to fetch workout session details: ${error.message}`)
    }

    return data ? normalizeSessionDetails(data as unknown as WorkoutSessionDetails) : null
  } catch (error) {
    console.error('Error in getWorkoutSessionDetails:', error)
    throw error
  }
}

export async function createWorkoutSession(
  userId: string,
  sessionDate = todayIsoDate()
): Promise<WorkoutSessionDetails> {
  try {
    const activeSession = await getActiveWorkoutSession(userId)
    if (activeSession) {
      return activeSession
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_sessions')
      .insert({
        user_id: userId,
        session_date: sessionDate,
        status: 'active',
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to create workout session: ${error?.message || 'No data returned'}`)
    }

    const session = await getWorkoutSessionDetails(data.id, userId)
    if (!session) {
      throw new Error('Failed to load created workout session')
    }

    return session
  } catch (error) {
    console.error('Error in createWorkoutSession:', error)
    throw error
  }
}

export async function completeWorkoutSession(
  sessionId: string,
  userId: string
): Promise<WorkoutSessionDetails> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('workout_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to complete workout session: ${error.message}`)
    }

    const session = await getWorkoutSessionDetails(sessionId, userId)
    if (!session) {
      throw new Error('Failed to load completed workout session')
    }

    return session
  } catch (error) {
    console.error('Error in completeWorkoutSession:', error)
    throw error
  }
}

export async function deleteWorkoutSession(sessionId: string, userId: string): Promise<void> {
  try {
    await assertSessionOwner(sessionId, userId)
    const supabase = await createClient()
    const { error } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to delete workout session: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteWorkoutSession:', error)
    throw error
  }
}

export async function getExerciseFavorites(userId: string): Promise<ExerciseFavorite[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('exercise_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('body_part', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch exercise favorites: ${error.message}`)
    }

    return data || []
  } catch (error) {
    console.error('Error in getExerciseFavorites:', error)
    throw error
  }
}

export async function createExerciseFavorite(
  userId: string,
  name: string,
  bodyPart: BodyPart
): Promise<ExerciseFavorite> {
  try {
    const normalizedName = name.trim()
    if (!normalizedName) {
      throw new Error('Exercise name is required')
    }

    const supabase = await createClient()
    const { data: existing, error: existingError } = await supabase
      .from('exercise_favorites')
      .select('*')
      .eq('user_id', userId)
      .eq('body_part', bodyPart)
      .ilike('name', normalizedName)
      .maybeSingle()

    if (existingError) {
      throw new Error(`Failed to check exercise favorite: ${existingError.message}`)
    }

    if (existing) {
      return existing
    }

    const { data, error } = await supabase
      .from('exercise_favorites')
      .insert({
        user_id: userId,
        name: normalizedName,
        body_part: bodyPart,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to create exercise favorite: ${error?.message || 'No data returned'}`)
    }

    return data
  } catch (error) {
    console.error('Error in createExerciseFavorite:', error)
    throw error
  }
}

export async function addWorkoutExercise(
  sessionId: string,
  userId: string,
  input: AddWorkoutExerciseInput
): Promise<WorkoutExerciseWithSets> {
  try {
    const session = await getWorkoutSessionDetails(sessionId, userId)
    if (!session) {
      throw new Error('Workout session not found or access denied')
    }

    const favorite = input.exercise_favorite_id
      ? null
      : await createExerciseFavorite(userId, input.name, input.body_part)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_exercises')
      .insert({
        session_id: sessionId,
        exercise_favorite_id: input.exercise_favorite_id || favorite?.id || null,
        name: input.name.trim(),
        body_part: input.body_part,
        sort_order: session.exercises.length,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to add workout exercise: ${error?.message || 'No data returned'}`)
    }

    return { ...data, sets: [] }
  } catch (error) {
    console.error('Error in addWorkoutExercise:', error)
    throw error
  }
}

export async function updateWorkoutExercise(
  id: string,
  userId: string,
  input: Partial<Pick<WorkoutExerciseUpdate, 'name' | 'body_part'>>
): Promise<WorkoutExerciseWithSets> {
  try {
    await assertWorkoutExerciseOwner(id, userId)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_exercises')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, sets:workout_sets(*)')
      .single()

    if (error || !data) {
      throw new Error(`Failed to update workout exercise: ${error?.message || 'No data returned'}`)
    }

    const exercise = data as unknown as WorkoutExerciseWithSets
    return {
      ...exercise,
      sets: [...(exercise.sets || [])].sort((a, b) => a.sort_order - b.sort_order),
    }
  } catch (error) {
    console.error('Error in updateWorkoutExercise:', error)
    throw error
  }
}

export async function deleteWorkoutExercise(id: string, userId: string): Promise<void> {
  try {
    await assertWorkoutExerciseOwner(id, userId)
    const supabase = await createClient()
    const { error } = await supabase.from('workout_exercises').delete().eq('id', id)

    if (error) {
      throw new Error(`Failed to delete workout exercise: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteWorkoutExercise:', error)
    throw error
  }
}

export async function addWorkoutSet(
  workoutExerciseId: string,
  userId: string,
  input: AddWorkoutSetInput
): Promise<WorkoutSet> {
  try {
    await assertWorkoutExerciseOwner(workoutExerciseId, userId)
    const supabase = await createClient()
    const { count, error: countError } = await supabase
      .from('workout_sets')
      .select('*', { count: 'exact', head: true })
      .eq('workout_exercise_id', workoutExerciseId)

    if (countError) {
      throw new Error(`Failed to count workout sets: ${countError.message}`)
    }

    const { data, error } = await supabase
      .from('workout_sets')
      .insert({
        workout_exercise_id: workoutExerciseId,
        weight: input.weight,
        reps: input.reps,
        sort_order: count || 0,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to add workout set: ${error?.message || 'No data returned'}`)
    }

    return data
  } catch (error) {
    console.error('Error in addWorkoutSet:', error)
    throw error
  }
}

export async function updateWorkoutSet(
  id: string,
  userId: string,
  input: Partial<AddWorkoutSetInput>
): Promise<WorkoutSet> {
  try {
    await assertWorkoutSetOwner(id, userId)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_sets')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to update workout set: ${error?.message || 'No data returned'}`)
    }

    return data
  } catch (error) {
    console.error('Error in updateWorkoutSet:', error)
    throw error
  }
}

export async function deleteWorkoutSet(id: string, userId: string): Promise<void> {
  try {
    await assertWorkoutSetOwner(id, userId)
    const supabase = await createClient()
    const { error } = await supabase.from('workout_sets').delete().eq('id', id)

    if (error) {
      throw new Error(`Failed to delete workout set: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteWorkoutSet:', error)
    throw error
  }
}

export async function addWorkoutCardioEntry(
  sessionId: string,
  userId: string,
  input: AddWorkoutCardioInput
): Promise<WorkoutCardioEntry> {
  try {
    const session = await getWorkoutSessionDetails(sessionId, userId)
    if (!session) {
      throw new Error('Workout session not found or access denied')
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_cardio_entries')
      .insert({
        session_id: sessionId,
        name: input.name.trim(),
        duration_minutes: input.duration_minutes,
        sort_order: session.cardio_entries.length,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to add cardio entry: ${error?.message || 'No data returned'}`)
    }

    return data
  } catch (error) {
    console.error('Error in addWorkoutCardioEntry:', error)
    throw error
  }
}

export async function updateWorkoutCardioEntry(
  id: string,
  userId: string,
  input: Partial<AddWorkoutCardioInput>
): Promise<WorkoutCardioEntry> {
  try {
    await assertCardioOwner(id, userId)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_cardio_entries')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to update cardio entry: ${error?.message || 'No data returned'}`)
    }

    return data
  } catch (error) {
    console.error('Error in updateWorkoutCardioEntry:', error)
    throw error
  }
}

export async function deleteWorkoutCardioEntry(id: string, userId: string): Promise<void> {
  try {
    await assertCardioOwner(id, userId)
    const supabase = await createClient()
    const { error } = await supabase.from('workout_cardio_entries').delete().eq('id', id)

    if (error) {
      throw new Error(`Failed to delete cardio entry: ${error.message}`)
    }
  } catch (error) {
    console.error('Error in deleteWorkoutCardioEntry:', error)
    throw error
  }
}

export async function getWorkoutHistory(userId: string): Promise<WorkoutSessionDetails[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_sessions')
      .select(workoutSessionDetailsSelect)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch workout history: ${error.message}`)
    }

    return ((data || []) as unknown as WorkoutSessionDetails[]).map(normalizeSessionDetails)
  } catch (error) {
    console.error('Error in getWorkoutHistory:', error)
    throw error
  }
}

export async function getExerciseStats(
  userId: string,
  exerciseName: string
): Promise<ExerciseStats> {
  try {
    const history = await getWorkoutHistory(userId)
    const matchingSessions = history
      .map((session) => {
        const matchingExercises = session.exercises.filter(
          (exercise) => exercise.name === exerciseName
        )
        const sets = matchingExercises.flatMap((exercise) => exercise.sets)
        return {
          sessionDate: session.session_date,
          sets,
        }
      })
      .filter((session) => session.sets.length > 0)

    const bestSets = matchingSessions
      .map((session) => bestSetForSession(session.sets, session.sessionDate))
      .filter((set): set is ExerciseStatsSet => Boolean(set))

    const highestSet = bestSets.reduce<ExerciseStatsSet | null>((current, next) => {
      if (!current || compareSets(next, current) > 0) {
        return next
      }
      return current
    }, null)

    const [latestBestSet, previousBestSet] = bestSets
    let recentComparison: ExerciseStatsComparison | null = null

    if (latestBestSet && previousBestSet) {
      const comparison = compareSets(latestBestSet, previousBestSet)
      recentComparison = {
        status: comparison > 0 ? 'increased' : comparison < 0 ? 'decreased' : 'unchanged',
        latestSessionDate: latestBestSet.sessionDate,
        previousSessionDate: previousBestSet.sessionDate,
        latestBestSet,
        previousBestSet,
      }
    }

    return {
      exerciseName,
      sessionsLogged: matchingSessions.length,
      highestSet,
      recentComparison,
    }
  } catch (error) {
    console.error('Error in getExerciseStats:', error)
    throw error
  }
}

export async function getWeeklyWorkoutStats(userId: string): Promise<WeeklyWorkoutStats> {
  try {
    const currentWeekStart = startOfWeekDateOnly(todayIsoDate())
    const nextWeekStart = addDaysToDateOnly(currentWeekStart, 7)
    const previousWeekStart = addDaysToDateOnly(currentWeekStart, -7)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('workout_sessions')
      .select('id, session_date')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('session_date', previousWeekStart)
      .lt('session_date', nextWeekStart)

    if (error) {
      throw new Error(`Failed to fetch weekly workout stats: ${error.message}`)
    }

    const currentWeek = (data || []).filter(
      (session) =>
        session.session_date >= currentWeekStart && session.session_date < nextWeekStart
    ).length
    const previousWeek = (data || []).filter(
      (session) =>
        session.session_date >= previousWeekStart &&
        session.session_date < currentWeekStart
    ).length

    return {
      currentWeek,
      previousWeek,
      difference: currentWeek - previousWeek,
    }
  } catch (error) {
    console.error('Error in getWeeklyWorkoutStats:', error)
    throw error
  }
}
