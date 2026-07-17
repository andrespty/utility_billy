-- Adds the two fields needed for bill calculations:
-- - programs.is_default: which program the Billing tab uses to price out a cycle
-- - bill_cycles.actual_amount: optional real bill total, to compare against the estimate

alter table public.programs add column if not exists is_default boolean not null default false;

-- Enforce at most one default program per user. The app updates rows in two
-- steps (unset old default, then set the new one), so this only ever needs
-- to reject genuinely bad states, not normal usage.
create unique index if not exists idx_programs_one_default_per_user
  on public.programs (user_id)
  where is_default;

alter table public.bill_cycles add column if not exists actual_amount numeric;
