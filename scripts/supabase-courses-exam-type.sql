-- Add exam_type column to courses table.
-- Run in Supabase Dashboard → SQL Editor.
-- Populated by: node scripts/update-exam-types.js
-- Values: 'no_exam' | 'take_home' | 'has_exam'

alter table public.courses
  add column if not exists exam_type text default null;

comment on column public.courses.exam_type is 'Precomputed from course + eval text: no_exam, take_home, has_exam';
