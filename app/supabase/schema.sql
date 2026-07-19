-- Full schema for a FRESH Supabase project (already-scoped per user).
-- If you're setting this up for the first time, run this whole file.
--
-- If you already applied an earlier version of this file and now have
-- data in place, don't re-run this — instead apply, in order:
--   supabase/migrations/20260717120000_add_user_scoping.sql
--   supabase/migrations/20260717130000_add_settings_tables.sql
--   supabase/migrations/20260717140000_add_billing_fields.sql
--   supabase/migrations/20260718000000_add_notes_table.sql
--   supabase/migrations/20260718000000_add_target.sql
-- which upgrade an existing database without losing data.

create table if not exists public.energy_readings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  service text not null,
  reading_date date not null,
  hour_start smallint not null check (hour_start between 0 and 23),
  time_period text,
  consumption numeric not null,
  consumption_unit text default 'KWH',
  meter_serial text,
  created_at timestamptz default now(),
  unique (user_id, service, reading_date, hour_start)
);

create table if not exists public.upload_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename text not null,
  extracted_date date,
  row_count integer,
  uploaded_at timestamptz default now(),
  unique (user_id, filename)
);

alter table public.energy_readings enable row level security;
alter table public.upload_log enable row level security;

-- Each row is only visible to / writable by the user who owns it.

create policy "owner_read_readings" on public.energy_readings
  for select using (user_id = auth.uid());

create policy "owner_write_readings" on public.energy_readings
  for insert with check (user_id = auth.uid());

create policy "owner_update_readings" on public.energy_readings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "owner_all_upload_log" on public.upload_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Helpful index for the per-user, date-range queries the dashboard runs.
create index if not exists idx_energy_readings_user_date on public.energy_readings (user_id, reading_date);

-- Settings: rate programs, fixed costs, and manually-entered billing cycles.

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

  -- the program the Billing tab uses to price out a cycle; at most one per user
  is_default boolean not null default false,

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
  -- optional: the real bill total, to compare against the app's estimate
  actual_amount numeric,
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

-- Enforce at most one default program per user.
create unique index if not exists idx_programs_one_default_per_user
  on public.programs (user_id)
  where is_default;

-- Target Bill: a single global dollar target + on/off toggle, per user.

create table if not exists public.target_settings (
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

-- Notes: free-text notes attached to a day, or a specific hour within a day.

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
