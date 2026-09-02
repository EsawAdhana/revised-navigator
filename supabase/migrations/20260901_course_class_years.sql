-- Who actually takes a course, by class level, from Carta (carta-beta.stanford.edu).
--
-- One row per course_id and no term column, because Carta's
-- /api/courses/{uuid}/graphs/ takes no term parameter: it returns a single
-- distribution accumulated over every term it holds. There is nothing per-term
-- to store, so a course either has one pooled breakdown or none.
--
-- Carta publishes nothing below ~15 students, so an absent row means either the
-- course is not in Carta's index (15% of our catalog) or it is under that floor.

CREATE TABLE IF NOT EXISTS course_class_years (
  course_id text PRIMARY KEY,
  levels jsonb NOT NULL,
  total integer NOT NULL,
  carta_uuid text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE course_class_years IS
  'Carta class-level enrollment breakdown per course, pooled over all terms Carta holds. '
  'Stanford-login-only data: read it through /api/class-years, which gates on the session, '
  'never from the public catalog dump.';
COMMENT ON COLUMN course_class_years.levels IS
  'Object keyed by Carta''s own 11 level labels (frosh, soph, junior, senior, ug 5yr, coterm, '
  'professional, masters allYr, phd or doctoral, nonmatriculated, other) -> student count. '
  'Keys are stored verbatim so a Carta relabelling shows up as a new key rather than as '
  'silently reassigned counts.';
COMMENT ON COLUMN course_class_years.total IS
  'Sum of levels. Stored rather than derived because it is the denominator every percentage '
  'on the chart uses, and Carta''s own outcomes.ENRL disagrees with this sum on ~14% of '
  'courses -- the levels are what the chart draws, so the levels are what it must divide by.';

ALTER TABLE course_class_years ENABLE ROW LEVEL SECURITY;

-- Mirrors the evaluations table: the anon key reads, and the API route is what
-- enforces Stanford-only access (see src/app/api/class-years/route.ts).
DROP POLICY IF EXISTS "course_class_years anon read" ON course_class_years;
CREATE POLICY "course_class_years anon read" ON course_class_years
  FOR SELECT TO anon USING (true);
