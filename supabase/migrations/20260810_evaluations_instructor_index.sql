-- The instructor page looks evaluations up by name (/api/instructors/[slug]).
-- Without this index that filter is a sequential scan over every row, and the
-- large questions/comments JSONB columns push cold runs past the statement
-- timeout on the free-tier instance.
--
-- Plain (non-CONCURRENT) build: the table is ~24k rows, so the write lock lasts
-- well under a second, and CONCURRENTLY cannot run inside the transaction the
-- Supabase SQL editor may wrap around it.
CREATE INDEX IF NOT EXISTS evaluations_instructor_idx
  ON evaluations (instructor);
