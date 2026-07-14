# Talgov Self-Service Login Automation

Automates logging into `selfservice.talgov.com` via Chromium (Playwright) and
navigating to a specific usage page, saving the resulting HTML and a
screenshot locally.

## Setup

1. Create a virtual environment and install dependencies:

   ```bash
   python -m venv venv
   source venv/bin/activate        # on Windows: venv\Scripts\activate
   pip install -r requirements.txt
   playwright install chromium
   ```

2. Create your credentials file:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and fill in your real `TALGOV_EMAIL` and
   `TALGOV_PASSWORD`. **`.env` is gitignored — never commit it.**

## Run

```bash
python main.py
```

By default the browser runs in headed mode (visible window) so you can see
what's happening and intervene if the site presents an MFA/2FA challenge
that the script doesn't handle automatically. To run without a visible
window once you've confirmed it works end-to-end:

```bash
python main.py --headless
```

## What it does

1. Opens the Talgov / Azure AD B2C login URL.
2. Waits for the login form (it's injected client-side via a Handlebars
   template, so the script waits for the actual `#signInName` / `#password`
   fields rather than just page load).
3. Fills in your email and password and submits the form.
4. Waits for the redirect to `https://selfservice.talgov.com/home`.
5. Navigates to `https://selfservice.talgov.com/usage/AP0332524/100382291`.
6. Saves the page's HTML (`output/usage_page.html`) and a full-page
   screenshot (`output/usage_page.png`).

If login doesn't complete within the timeout (e.g. wrong password, or an
MFA prompt the script can't answer), it saves a screenshot/HTML snapshot of
whatever state the page was in to `output/login_error.*` so you can see why.

## Downloading weekly + daily usage exports

`download_usage.py` automates the Usage page workflow: switch to Week view,
set a date, refresh, export to Excel — then repeat in Day view for every day
in that week.

```bash
python download_usage.py --date 2026-07-14
```

This will:

1. Log in (same flow as `main.py`).
2. Go to the Usage page for the account (default `AP0332524/100382291`,
   override with `--account`).
3. Switch to **Week** view, set the date to `2026-07-14`, click **Refresh
   data**, and export to `output/usage_exports/usage_week_<start>_<end>.xlsx`.
4. Read the date range shown on the page (e.g. "Jul 12, 2026 - Jul 18,
   2026") to determine the exact 7 days in that week — this way it doesn't
   have to guess whether Talgov's weeks start on Sunday or Monday.
5. For each of those 7 days, switch to **Day** view, set that date, refresh,
   and export to `output/usage_exports/usage_day_<date>.xlsx`.

Options:

```bash
python download_usage.py --date 2026-07-14 --account AP0332524/100382291 --headless --output-dir ./exports
```

Run it headed (the default) the first time so you can watch it click
through the date picker and confirm it's landing on the right week/day
before trusting `--headless` runs.

### How the date picker is handled

The date field (`#datepicker-1`) is a Kendo masked date input. The script
clicks it, selects all, and types the date as digits (`MMDDYYYY`), which
Kendo auto-advances through the month/day/year segments, then presses Enter
to commit and Escape to close the calendar popup. If Talgov changes this
widget, `usage.py`'s `set_date()` is the one place to fix it — it already
has a fallback selector in case the `#datepicker-1` ID changes between
sessions.

## Notes / limitations

- If Talgov's login requires MFA (SMS/email code, authenticator app, etc.),
  this script does **not** handle that automatically — you'd need to run it
  headed and enter the code manually in the opened browser window, or extend
  the script to pause and wait for you to do so.
- The account/service point in `TARGET_URL` (`AP0332524/100382291`) is
  hardcoded in `main.py` — change the `TARGET_URL` constant if you need a
  different account.
- Selectors (`#signInName`, `#password`, `#next`) are based on the current
  Azure AD B2C login page markup. If Talgov changes their login provider or
  template, these may need updating.
