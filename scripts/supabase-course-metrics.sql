-- DEPRECATED: Use supabase-courses-metrics-columns.sql instead.
-- Metrics are now stored on the courses table (hours, quality, difficulty).
-- This file is kept for reference only.

create table if not exists public.course_metrics (
  course_id text primary key,
  hours numeric not null,
  quality numeric not null,
  difficulty numeric not null
);

create index if not exists idx_course_metrics_difficulty on public.course_metrics(difficulty);
create index if not exists idx_course_metrics_hours on public.course_metrics(hours);
create index if not exists idx_course_metrics_quality on public.course_metrics(quality);

comment on table public.course_metrics is 'Precomputed median hours, quality, and difficulty (hours/unit) for O(n) filtering';
