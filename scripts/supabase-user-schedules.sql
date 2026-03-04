-- Run this in the Supabase SQL Editor to create the user schedules table.
-- Table: user_schedules — stores AES-GCM encrypted schedule data per user.
-- The payload is encrypted client-side (schedule-crypto.ts); only ciphertext
-- and IV are stored here. The server never sees plaintext course selections.

create table if not exists public.user_schedules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_schedules enable row level security;

-- Users can read only their own row
create policy "Users can select own schedule"
  on public.user_schedules
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can insert their own row
create policy "Users can insert own schedule"
  on public.user_schedules
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can update their own row
create policy "Users can update own schedule"
  on public.user_schedules
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at current on every upsert
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_schedules_updated_at
  before update on public.user_schedules
  for each row execute function public.set_updated_at();
