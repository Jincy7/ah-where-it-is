-- Migration: Workout Logging
-- Description: Adds private workout sessions, favorites, set records, cardio entries, and RLS policies.
-- Date: 2026-05-10

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT workout_sessions_completed_at_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status = 'active' AND completed_at IS NULL)
  )
);

CREATE TABLE exercise_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  body_part text NOT NULL CHECK (body_part IN ('chest','back','shoulders','lower_body','arms','core')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT exercise_favorites_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES workout_sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_favorite_id uuid REFERENCES exercise_favorites(id) ON DELETE SET NULL,
  name text NOT NULL,
  body_part text NOT NULL CHECK (body_part IN ('chest','back','shoulders','lower_body','arms','core')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT workout_exercises_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE workout_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid REFERENCES workout_exercises(id) ON DELETE CASCADE NOT NULL,
  weight numeric(6,2) NOT NULL CHECK (weight >= 0),
  reps integer NOT NULL CHECK (reps > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE workout_cardio_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES workout_sessions(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT workout_cardio_entries_name_not_empty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE workout_sessions IS 'User-owned workout sessions for active and completed workout logs';
COMMENT ON TABLE exercise_favorites IS 'User-owned exercise favorites grouped by large body part';
COMMENT ON TABLE workout_exercises IS 'Exercises recorded inside a workout session';
COMMENT ON TABLE workout_sets IS 'Weight/reps sets recorded for a workout exercise';
COMMENT ON TABLE workout_cardio_entries IS 'Time-based cardio entries recorded in a workout session';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_workout_sessions_user_id ON workout_sessions(user_id);
CREATE INDEX idx_workout_sessions_user_date ON workout_sessions(user_id, session_date DESC);
CREATE INDEX idx_workout_sessions_status ON workout_sessions(user_id, status);

CREATE INDEX idx_exercise_favorites_user_id ON exercise_favorites(user_id);
CREATE INDEX idx_exercise_favorites_body_part ON exercise_favorites(user_id, body_part);
CREATE UNIQUE INDEX idx_exercise_favorites_unique_name_body_part
  ON exercise_favorites(user_id, body_part, lower(trim(name)));

CREATE INDEX idx_workout_exercises_session_id ON workout_exercises(session_id);
CREATE INDEX idx_workout_exercises_favorite_id ON workout_exercises(exercise_favorite_id);
CREATE INDEX idx_workout_exercises_name ON workout_exercises(name);

CREATE INDEX idx_workout_sets_exercise_id ON workout_sets(workout_exercise_id);
CREATE INDEX idx_workout_sets_sort_order ON workout_sets(workout_exercise_id, sort_order);

CREATE INDEX idx_workout_cardio_entries_session_id ON workout_cardio_entries(session_id);
CREATE INDEX idx_workout_cardio_entries_sort_order ON workout_cardio_entries(session_id, sort_order);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_workout_sessions_updated_at
  BEFORE UPDATE ON workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exercise_favorites_updated_at
  BEFORE UPDATE ON exercise_favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workout_exercises_updated_at
  BEFORE UPDATE ON workout_exercises
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workout_sets_updated_at
  BEFORE UPDATE ON workout_sets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workout_cardio_entries_updated_at
  BEFORE UPDATE ON workout_cardio_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_cardio_entries ENABLE ROW LEVEL SECURITY;

-- Workout sessions: direct user ownership.
CREATE POLICY "workout_sessions_select_own" ON workout_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "workout_sessions_insert_own" ON workout_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workout_sessions_update_own" ON workout_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workout_sessions_delete_own" ON workout_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Exercise favorites: direct user ownership.
CREATE POLICY "exercise_favorites_select_own" ON exercise_favorites
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "exercise_favorites_insert_own" ON exercise_favorites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "exercise_favorites_update_own" ON exercise_favorites
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "exercise_favorites_delete_own" ON exercise_favorites
  FOR DELETE
  USING (auth.uid() = user_id);

-- Workout exercises: ownership through parent session.
CREATE POLICY "workout_exercises_select_own" ON workout_exercises
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_exercises.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises_insert_own" ON workout_exercises
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_exercises.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises_update_own" ON workout_exercises
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_exercises.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_exercises.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises_delete_own" ON workout_exercises
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_exercises.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

-- Workout sets: ownership through exercise -> session.
CREATE POLICY "workout_sets_select_own" ON workout_sets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workout_sessions ON workout_sessions.id = workout_exercises.session_id
      WHERE workout_exercises.id = workout_sets.workout_exercise_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_sets_insert_own" ON workout_sets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workout_sessions ON workout_sessions.id = workout_exercises.session_id
      WHERE workout_exercises.id = workout_sets.workout_exercise_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_sets_update_own" ON workout_sets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workout_sessions ON workout_sessions.id = workout_exercises.session_id
      WHERE workout_exercises.id = workout_sets.workout_exercise_id
      AND workout_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workout_sessions ON workout_sessions.id = workout_exercises.session_id
      WHERE workout_exercises.id = workout_sets.workout_exercise_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_sets_delete_own" ON workout_sets
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workout_exercises
      JOIN workout_sessions ON workout_sessions.id = workout_exercises.session_id
      WHERE workout_exercises.id = workout_sets.workout_exercise_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

-- Workout cardio entries: ownership through parent session.
CREATE POLICY "workout_cardio_entries_select_own" ON workout_cardio_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_cardio_entries.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_cardio_entries_insert_own" ON workout_cardio_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_cardio_entries.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_cardio_entries_update_own" ON workout_cardio_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_cardio_entries.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_cardio_entries.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "workout_cardio_entries_delete_own" ON workout_cardio_entries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE workout_sessions.id = workout_cardio_entries.session_id
      AND workout_sessions.user_id = auth.uid()
    )
  );
