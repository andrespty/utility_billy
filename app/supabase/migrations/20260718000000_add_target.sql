-- Adds the table backing the Target Bill feature on the Settings tab: a
-- single global dollar target + on/off toggle, per user, same ownership
-- pattern as the other settings tables.

create table public.target_settings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  enabled boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint target_settings_one_per_user unique (user_id)
);

alter table public.target_settings enable row level security;

create policy "owner_all_target_settings" on public.target_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
