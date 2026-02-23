-- Add final_exam column to courses table.
-- Run in Supabase Dashboard → SQL Editor.
-- Stores scraped final exam info from Explore Courses: { date, time, location }.

alter table public.courses
  add column if not exists final_exam jsonb default null;

comment on column public.courses.final_exam is 'Final exam info from Explore Courses: { date?, time?, location? }';
