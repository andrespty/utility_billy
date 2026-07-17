-- Adds the tables backing the Settings tab: rate programs, fixed costs,
-- and manually-entered billing cycles. All three follow the same
-- per-user ownership pattern as energy_readings/upload_log.

create table if not exists public.programs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('fixed', 'time_of_use')),

  -- used when type = 'fixed'
  fixed_rate numeric,

  -- used when type = 'time_of_use'
  on_peak_rate numeric,
  off_peak_rate numeric,
  -- on-peak hour window (0-23), separate for weekdays vs weekends.
  -- leave both null for a day-type to mean "off-peak all day" on those days.
  weekday_on_peak_start smallint check (weekday_on_peak_start between 0 and 23),
  weekday_on_peak_end smallint check (weekday_on_peak_end between 0 and 23),
  weekend_on_peak_start smallint check (weekend_on_peak_start between 0 and 23),
  weekend_on_peak_end smallint check (weekend_on_peak_end between 0 and 23),

  created_at timestamptz default now(),

  constraint programs_rate_fields_match_type check (
    (type = 'fixed' and fixed_rate is not null)
    or
    (type = 'time_of_use' and on_peak_rate is not null and off_peak_rate is not null)
  )
);

create table if not exists public.fixed_costs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null,
  created_at timestamptz default now()
);

create table if not exists public.bill_cycles (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  created_at timestamptz default now(),
  constraint bill_cycles_end_after_start check (end_date >= start_date)
);

alter table public.programs enable row level security;
alter table public.fixed_costs enable row level security;
alter table public.bill_cycles enable row level security;

create policy "owner_all_programs" on public.programs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner_all_fixed_costs" on public.fixed_costs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner_all_bill_cycles" on public.bill_cycles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists idx_bill_cycles_user_start on public.bill_cycles (user_id, start_date);
