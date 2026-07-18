-- Adds the notes table backing the Dashboard's per-day / per-hour notes
-- feature. Follows the same per-user ownership pattern as the Settings
-- tables (programs/fixed_costs/bill_cycles).

create table if not exists public.notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_date date not null,
  hour smallint check (hour between 0 and 23), -- null = whole-day note
  body text not null,
  created_at timestamptz default now()
);

alter table public.notes enable row level security;

create policy "owner_all_notes" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists idx_notes_user_date on public.notes (user_id, note_date);
