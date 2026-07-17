-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
-- for your project before using the app.

create table if not exists public.energy_readings (
  id bigint generated always as identity primary key,
  service text not null,
  reading_date date not null,
  hour_start smallint not null check (hour_start between 0 and 23),
  time_period text,
  consumption numeric not null,
  consumption_unit text default 'KWH',
  meter_serial text,
  created_at timestamptz default now(),
  unique (service, reading_date, hour_start)
);

create table if not exists public.upload_log (
  id bigint generated always as identity primary key,
  filename text unique not null,
  extracted_date date,
  row_count integer,
  uploaded_at timestamptz default now()
);

alter table public.energy_readings enable row level security;
alter table public.upload_log enable row level security;

-- Single-user app: any signed-in (authenticated) user can read/write.
-- Only you will have an account, so this is effectively private to you.

create policy "authenticated_read_readings" on public.energy_readings
  for select using (auth.role() = 'authenticated');

create policy "authenticated_write_readings" on public.energy_readings
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated_update_readings" on public.energy_readings
  for update using (auth.role() = 'authenticated');

create policy "authenticated_all_upload_log" on public.upload_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Helpful index for date-range queries on the dashboard
create index if not exists idx_energy_readings_date on public.energy_readings (reading_date);
