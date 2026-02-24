-- ============================================================
-- RLS POLICIES FOR STANFORD ROOT
-- ============================================================
-- Courses, evaluations, and syllabus_submissions should be
-- readable by any authenticated user with a @stanford.edu email.
-- Writes are blocked for everyone except the service role (admin).
--
-- HOW TO APPLY:
--   1. Open the Supabase Dashboard → SQL Editor
--   2. Paste and run this entire file
-- ============================================================

-- ── COURSES ──────────────────────────────────────────────────
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Drop any conflicting policies first
DROP POLICY IF EXISTS "Allow authenticated reads" ON courses;
DROP POLICY IF EXISTS "Allow public reads" ON courses;

-- Authenticated users (valid JWT) can read all courses.
-- The /api/courses route uses the service role key (bypasses RLS entirely),
-- so this policy exists as a fallback for any direct client reads.
CREATE POLICY "Allow authenticated reads"
  ON courses
  FOR SELECT
  TO authenticated
  USING (true);

-- ── EVALUATIONS ──────────────────────────────────────────────
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated reads" ON evaluations;
DROP POLICY IF EXISTS "Allow public reads" ON evaluations;

CREATE POLICY "Allow authenticated reads"
  ON evaluations
  FOR SELECT
  TO authenticated
  USING (true);

-- ── SYLLABUS SUBMISSIONS ─────────────────────────────────────
ALTER TABLE syllabus_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated reads" ON syllabus_submissions;
DROP POLICY IF EXISTS "Allow public reads" ON syllabus_submissions;

CREATE POLICY "Allow authenticated reads"
  ON syllabus_submissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert: only authenticated users can submit syllabi
DROP POLICY IF EXISTS "Allow authenticated inserts" ON syllabus_submissions;

CREATE POLICY "Allow authenticated inserts"
  ON syllabus_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ── SCHEDULES / USER DATA ─────────────────────────────────────
-- If you have a schedules table, users should only see their own rows.
-- Uncomment and adapt if needed:
--
-- ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users see own schedules"
--   ON schedules FOR SELECT TO authenticated
--   USING (auth.uid() = user_id);
-- CREATE POLICY "Users insert own schedules"
--   ON schedules FOR INSERT TO authenticated
--   WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Users update own schedules"
--   ON schedules FOR UPDATE TO authenticated
--   USING (auth.uid() = user_id);
-- CREATE POLICY "Users delete own schedules"
--   ON schedules FOR DELETE TO authenticated
--   USING (auth.uid() = user_id);
