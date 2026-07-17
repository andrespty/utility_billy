-- Scopes energy_readings and upload_log to the owning user instead of
-- "any authenticated session". Safe to run once against your existing
-- database via `npx supabase db push`.

-- 1. Add the column (nullable first so we can backfill existing rows).
alter table public.energy_readings add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.upload_log add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Backfill existing rows with your account's id. Since this app is
-- single-user, we just take the first (only) user in auth.users.
update public.energy_readings
set user_id = (select id from auth.users order by created_at asc limit 1)
where user_id is null;

update public.upload_log
set user_id = (select id from auth.users order by created_at asc limit 1)
where user_id is null;

-- 3. Lock the column down: required, and defaults to whoever is signed in
-- when a row is inserted (so the app doesn't need to send it explicitly).
alter table public.energy_readings alter column user_id set not null;
alter table public.energy_readings alter column user_id set default auth.uid();

alter table public.upload_log alter column user_id set not null;
alter table public.upload_log alter column user_id set default auth.uid();

-- 4. Replace the old unique constraints with per-user versions.
alter table public.energy_readings drop constraint if exists energy_readings_service_reading_date_hour_start_key;
alter table public.energy_readings add constraint energy_readings_user_service_date_hour_key
  unique (user_id, service, reading_date, hour_start);

alter table public.upload_log drop constraint if exists upload_log_filename_key;
alter table public.upload_log add constraint upload_log_user_filename_key
  unique (user_id, filename);

-- 5. Replace RLS policies: "any signed-in session" -> "only the owning user".
drop policy if exists "authenticated_read_readings" on public.energy_readings;
drop policy if exists "authenticated_write_readings" on public.energy_readings;
drop policy if exists "authenticated_update_readings" on public.energy_readings;

create policy "owner_read_readings" on public.energy_readings
  for select using (user_id = auth.uid());

create policy "owner_write_readings" on public.energy_readings
  for insert with check (user_id = auth.uid());

create policy "owner_update_readings" on public.energy_readings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "authenticated_all_upload_log" on public.upload_log;

create policy "owner_all_upload_log" on public.upload_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 6. Index for the per-user, per-date-range queries the dashboard runs.
create index if not exists idx_energy_readings_user_date on public.energy_readings (user_id, reading_date);
