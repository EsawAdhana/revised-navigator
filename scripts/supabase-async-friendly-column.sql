-- Add async_friendly flag to courses table (non-destructive).
-- True when median in-person attendance is <50% across evaluations.
-- Populated by: node scripts/populate-course-metrics.js

alter table public.courses
  add column if not exists async_friendly boolean;

comment on column public.courses.async_friendly is 'True when median in-person attendance <50% (from evaluations)';

create index if not exists idx_courses_async_friendly on public.courses(async_friendly) where async_friendly is not null;
