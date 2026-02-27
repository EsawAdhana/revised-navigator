-- Run this in Supabase SQL Editor to create the app feedback table.
-- Table: app_feedback — for comments, requests, and general feedback.
--
-- The /api/feedback route requires authentication. The API maps:
--   'feedback' -> 'general', 'request' -> 'request'
--
-- MIGRATION: Drop old anon policy before running (if upgrading):
drop policy if exists "Allow anonymous insert" on public.app_feedback;

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) <= 2000),
  type text not null default 'general' check (type in ('comment', 'request', 'general')),
  created_at timestamptz not null default now()
);

alter table public.app_feedback enable row level security;

-- Allow authenticated users to insert. API enforces auth; this is defense-in-depth.
create policy "Allow authenticated insert"
  on public.app_feedback
  for insert
  to authenticated
  with check (true);

-- View feedback in Supabase Dashboard > Table Editor.
