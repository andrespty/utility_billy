"""
Download weekly + daily usage export files from the Talgov Usage page for
the week that contains a given date.

Workflow:
  1. Log in (reuses login() from main.py).
  2. Go to the Usage page for the given account.
  3. Switch to "Week" view, set the date, refresh, export to Excel.
  4. Read the displayed date range (e.g. "Jul 12, 2026 - Jul 18, 2026") to
     figure out exactly which 7 days are in that week.
  5. For each of those days: switch to "Day" view, set that date, refresh,
     export to Excel.

Usage:
    python download_usage.py --date 2026-07-14
    python download_usage.py --date 2026-07-14 --account AP0332524/100382291 --headless
"""

import argparse
import sys
from datetime import datetime, date
from pathlib import Path

from playwright.sync_api import sync_playwright

import usage as usage_mod
from main import login, get_credentials, OUTPUT_DIR

DEFAULT_ACCOUNT_PATH = "AP0332524/100382291"
BASE_URL = "https://selfservice.talgov.com"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--date",
        required=True,
        help="Any date within the target week, format YYYY-MM-DD",
    )
    parser.add_argument(
        "--account",
        default=DEFAULT_ACCOUNT_PATH,
        help=f"Account path segment, e.g. '{DEFAULT_ACCOUNT_PATH}' (default: %(default)s)",
    )
    parser.add_argument("--headless", action="store_true", help="Run Chromium without a visible window")
    parser.add_argument(
        "--output-dir",
        default=str(OUTPUT_DIR / "usage_exports"),
        help="Directory to save downloaded Excel files into (default: %(default)s)",
    )
    return parser.parse_args()



def main() -> None:
    args = parse_args()

    try:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    except ValueError:
        sys.exit(f"--date must be in YYYY-MM-DD format, got: {args.date!r}")

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    email, password = get_credentials()
    usage_url = f"{BASE_URL}/usage/{args.account}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        login(page, email, password)

        print(f"Navigating to usage page: {usage_url}")
        page.goto(usage_url, wait_until="domcontentloaded")
        page.wait_for_selector("iti-usage-page", state="visible", timeout=30_000)
        usage_mod.dismiss_alert_modal(page)

        # --- Weekly export -------------------------------------------------
        print("Switching to Week view...")
        usage_mod.select_graph_type(page, "week")

        print(f"Setting date to {target_date.isoformat()}...")
        usage_mod.open_date_picker(page)
        usage_mod.set_date(page, target_date)

        print("Refreshing data...")
        usage_mod.click_refresh(page)

        header_text = usage_mod.get_date_range_text(page)
        week_start, week_end = usage_mod.parse_week_range(header_text)
        print(f"Week range shown on page: {week_start} - {week_end}")

        weekly_file = out_dir / f"usage_week_{week_start.isoformat()}_{week_end.isoformat()}.csv"
        print(f"Exporting weekly data to {weekly_file}...")
        usage_mod.export_excel(page, weekly_file)

        # --- Daily exports for each day in that week ------------------------
        usage_mod.select_graph_type(page, "day")
        today = date.today()
        for day in usage_mod.daterange(week_start, week_end):
            # Case 1: current week — skip days that haven't happened yet
            if day > today:
                print(f"\nSkipping {day.isoformat()} (future date, no data yet).")
                continue

            print(f"\nSwitching to Day view for {day.isoformat()}...")
            usage_mod.open_date_picker(page)
            usage_mod.set_date(page, day)

            print("Refreshing data...")
            usage_mod.click_refresh(page)
            
            # Case 2: past day with no reading on file
            if usage_mod.has_no_data(page):
                print(f"No data for {day.isoformat()} — skipping export.")
                continue

            daily_file = out_dir / f"usage_day_{day.isoformat()}.csv"
            print(f"Exporting daily data to {daily_file}...")
            usage_mod.export_excel(page, daily_file)

        context.close()
        browser.close()

    print(f"\nDone. Files saved in: {out_dir}")


if __name__ == "__main__":
    main()
