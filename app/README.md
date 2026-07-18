# Energy Tracker

A small React app for tracking home electricity consumption from manually-downloaded
utility CSV exports. Free to host, single-user, backed by a free Supabase project.

## How it works

- You download the hourly usage CSV from your utility's website (no API available).
- You log into this site and upload that CSV through the Upload tab.
- The app parses it and stores each hourly reading in a Supabase (Postgres) table.
- The Dashboard tab charts daily totals and your typical hour-by-hour usage pattern.
- The Upload tab shows a calendar of which days you have data for (gray = none,
  yellow = partial, green = a full 24 hours), so gaps are easy to spot.
- Re-uploading a day you've already uploaded overwrites that day's rows (safe to redo).
- The Settings tab lets you define rate programs, fixed costs, and billing cycles.
- The Billing tab estimates the cost of each cycle using whichever program is
  marked default, plus your fixed costs, and lets you record the actual bill
  amount to compare against the estimate.

## 1. Create a Supabase project (free)

1. Go to https://supabase.com, sign up, and create a new project.
2. In the project dashboard, open **SQL Editor > New query**, paste the contents of
   `supabase/schema.sql` from this repo, and run it. This creates the two tables
   (`energy_readings`, `upload_log`) with row-level security enabled.
3. Go to **Authentication > Users > Add user** and create a single account for
   yourself (email + password). This is the only account you'll use to log in —
   there's no public sign-up form in the app on purpose.
4. Go to **Project Settings > API** and copy the **Project URL** and **anon public**
   key — you'll need both in step 3 below.

## 2. Run locally

```bash
cd app
npm install
cp .env.example .env
# edit .env and paste in your Supabase Project URL + anon key
npm run dev
```

Visit the local URL it prints, log in with the account you created in Supabase, and
try uploading a sample CSV.

## 3. Deploy for free (Vercel)

1. Push this project to a GitHub repo (make it **private** — it's your household
   consumption data).
2. Go to https://vercel.com, sign in with GitHub, and import the repo.
3. In the Vercel project's **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (same values as your local `.env`)
4. Deploy. Vercel gives you a free `*.vercel.app` URL — that's your site.

Netlify or Cloudflare Pages work the same way if you'd rather use those.

## CSV format expected

The app expects the utility export's columns to be:

```
Service, Time period, Consumption, Consumption unit, Meter serial number, Register serial number, Counter time frame
```

Since the export has no date column, the Upload page tries to guess the date from
the filename (looks for a `YYYY-MM-DD` or `MM-DD-YYYY` pattern) and always shows a
date field for you to confirm or correct before saving.

## Notes on security

- The app has no public sign-up — only the one account you create in the Supabase
  dashboard can log in.
- Every row is scoped to the user who created it (`user_id` column + row-level
  security policies keyed on `auth.uid()`), not just "any signed-in session." So
  even if a second account existed, it wouldn't see your data.
- Keep the GitHub repo private, since env vars aren't checked into it but the
  overall project structure/schema reveals what kind of data it holds.

## Upgrading an existing database to per-user data

If you already ran the original `schema.sql` and have data in Supabase, don't
re-run `schema.sql` — it will conflict with what's there. Instead push the
follow-up migration that adds `user_id` scoping without losing anything:

```bash
cd app
npx supabase db push
```

This applies `supabase/migrations/20260717120000_add_user_scoping.sql`, which adds
a `user_id` column to both tables, backfills existing rows with your account's id,
and swaps the RLS policies from "any authenticated session" to "only the owning
user." A fresh project run through `schema.sql` already has this built in.

## Adding the Settings tables

`npx supabase db push` also applies `supabase/migrations/20260717130000_add_settings_tables.sql`,
which creates `programs`, `fixed_costs`, and `bill_cycles` (all owned per-user, same
pattern as above). Run it once and the Settings tab is ready to use — a fresh
project via `schema.sql` already includes these tables.

### What each Settings section stores

- **Rate programs** (up to 3): a name, and either a flat `$/kWh` rate, or an
  on-peak/off-peak time-of-use rate with separate hour windows for weekdays vs
  weekends. One program is marked **default** — that's the one the Billing tab
  uses. The first program you create becomes the default automatically; use
  "Set default" on any other program to switch.
- **Fixed costs**: a flat list of name + amount charges (service fee, delivery,
  taxes) that apply to every bill regardless of consumption.
- **Bill cycles**: a manually maintained list of start/end date pairs. The one
  containing today's date is flagged "Current" in the list.

## Adding the billing calculation fields

`npx supabase db push` also applies `supabase/migrations/20260717140000_add_billing_fields.sql`,
which adds `is_default` to `programs` and `actual_amount` to `bill_cycles`. Run
it, then set a default program in Settings before checking the Billing tab.

## How the Billing tab calculates an estimate

For each cycle, it pulls every hourly reading between the cycle's start and end
dates and prices it using the default program:

- **Fixed-rate programs**: total kWh × the flat rate.
- **Time-of-use programs**: each hour is classified on-peak or off-peak based on
  its weekday/weekend window, then priced at that rate. On-peak and off-peak
  totals are shown separately.

Your fixed costs total is added on top for the estimated total. If any day in
the cycle is missing data or has fewer than 24 hours recorded, a warning shows
so you know the estimate may be low. You can optionally enter the actual dollar
amount from your real bill for each cycle — the app shows the difference from
the estimate once you save it.

## Adding the notes table

`npx supabase db push` also applies `supabase/migrations/20260718000000_add_notes_table.sql`,
which creates `notes` (owned per-user, same pattern as above). Run it once and
you can start attaching notes from the Dashboard — a fresh project via
`schema.sql` already includes this table.

Click any bar on the Dashboard's daily consumption chart to open that day's
notes. Each note is either a whole-day note or tied to a specific hour, so you
can record context like "cooked with the oven" or "AC set to 80" alongside the
usage that explains it. Days with at least one note show a small marker under
their bar; notes can be added or deleted but not edited.
