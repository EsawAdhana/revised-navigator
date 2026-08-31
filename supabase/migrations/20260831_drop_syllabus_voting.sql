-- The syllabus feedback feature is gone: the "Is the syllabus available?" thumbs
-- vote, the community-submitted link list, and the per-link up/down votes were all
-- removed from the app (syllabus-voting.tsx and syllabus-store.ts deleted), so
-- nothing reads or writes these three tables any more.
--
-- Held 2 rows total at drop time (both in syllabus_votes, one +1 and one -1, from
-- Jun-Jul 2026); syllabus_submissions and syllabus_submission_votes were empty.
--
-- Order matters and is deliberate: syllabus_submission_votes.submission_id carries
-- a foreign key to syllabus_submissions.id, so the child goes first. No CASCADE --
-- if some object outside this feature still depends on these tables, this should
-- fail loudly rather than drop that object too. Owned indexes, constraints and RLS
-- policies go with their table automatically.
--
-- Wrapped in a transaction because without one these three statements commit
-- independently: a dependency error on the last table would leave the first two
-- already dropped, which is a worse state than either finishing or not starting.
-- Tested against a local replica -- an unrelated view on syllabus_votes now rolls
-- the whole thing back instead of destroying two tables on the way to the error.

BEGIN;

DROP TABLE IF EXISTS public.syllabus_submission_votes;
DROP TABLE IF EXISTS public.syllabus_submissions;
DROP TABLE IF EXISTS public.syllabus_votes;

COMMIT;
