"""
End-to-end sync: log into Talgov, download hourly usage for a trailing
window of days (covers Talgov's ~2-day data-availability lag), and upsert
straight into Supabase — no manual CSV download/upload through the app
needed. Safe to re-run: everything upserts on
(user_id, service, reading_date, hour_start), same as the app's Upload page.

Usage:
    python sync.py                  # last 5 days (today back to 4 days ago)
    python sync.py --days 10
    python sync.py --headless
"""

import argparse
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

from download_data import download_usage_days
from csv_to_readings import parse_reading_rows
from supabase_sync import get_supabase_client, upsert_readings

DEFAULT_OUTPUT_DIR = Path(__file__).parent / "data" / "daily"


def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="Sync recent Talgov usage data into Supabase.")
    parser.add_argument(
        "--days", type=int, default=5, help="How many trailing days to sync (default 5)."
    )
    parser.add_argument("--headless", action="store_true", help="Run the browser headless.")
    parser.add_argument(
        "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Where to save downloaded CSVs."
    )
    args = parser.parse_args()

    today = date.today()
    dates = sorted(today - timedelta(days=i) for i in range(args.days))

    print(f"Downloading {len(dates)} day(s) from Talgov: {dates[0].isoformat()} to {dates[-1].isoformat()}")
    exported_files = download_usage_days(dates, headless=args.headless, output_dir=args.output_dir)

    if not exported_files:
        print("No files exported (no data available yet for any of these days). Nothing to sync.")
        return

    print("Signing in to Supabase...")
    client = get_supabase_client()

    total_rows = 0
    for csv_path in exported_files:
        # Filenames look like "usage_day_2026-07-16.csv"
        reading_date = csv_path.stem.split("_")[-1]
        rows = parse_reading_rows(csv_path, reading_date)
        if not rows:
            print(f"  {csv_path.name}: no valid rows parsed, skipping.")
            continue
        count = upsert_readings(client, rows)
        total_rows += count
        print(f"  {csv_path.name}: upserted {count} readings for {reading_date}.")

    print(f"\nDone. Synced {total_rows} readings across {len(exported_files)} day(s).")


if __name__ == "__main__":
    main()
