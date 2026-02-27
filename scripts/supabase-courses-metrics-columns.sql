-- Add evaluation-derived metrics to courses table (non-destructive).
-- Populated by: node scripts/populate-course-metrics.js
-- Enables O(n) filtering: WHERE difficulty < X AND hours < Y AND quality >= Z

alter table public.courses
  add column if not exists hours numeric,
  add column if not exists quality numeric,
  add column if not exists difficulty numeric;

comment on column public.courses.hours is 'Median hrs/wk from evaluations';
comment on column public.courses.quality is 'Overall rating (1-5) from evaluations';
comment on column public.courses.difficulty is 'hours / units (stored, not computed on read)';

create index if not exists idx_courses_hours on public.courses(hours) where hours is not null;
create index if not exists idx_courses_quality on public.courses(quality) where quality is not null;
create index if not exists idx_courses_difficulty on public.courses(difficulty) where difficulty is not null;
