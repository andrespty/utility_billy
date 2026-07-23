"""
Automated daily sync: pulls the last DAYS_BACK days of Talgov usage data and
upserts it directly into Supabase's energy_readings table.

Meant to run unattended (e.g. via a scheduled GitHub Actions workflow) — no
CLI flags, just call sync_recent_days(), same style as main.py.

Required environment variables:
  TALGOV_EMAIL, TALGOV_PASSWORD, ACCOUNT_NUMBER  (used by auth.get_credentials(),
                                                    via download_usage_day)
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_USER_ID   (the fixed UUID that owns all this data)
"""

import csv
import os
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from supabase import create_client

from download_data import download_usage_days

DAYS_BACK = 2


def parse_hour_start(time_period: str) -> Optional[int]:
    """Convert a "Time period" cell like "1:00 AM-1:59 AM" into the 24-hour
    start hour (0-23) it represents. Mirrors app/src/lib/csv.js's
    parseHourStart exactly, so automated and manual uploads produce
    identical rows."""
    if not time_period:
        return None

    start_part = time_period.split("-")[0].strip()  # e.g. "1:00 AM"
    match = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)", start_part, re.IGNORECASE)
    if not match:
        return None

    hour_str, _minute_str, meridiem = match.groups()
    hour = int(hour_str)
    meridiem = meridiem.upper()

    if meridiem == "AM":
        if hour == 12:
            hour = 0
    else:  # PM
        if hour != 12:
            hour += 12

    return hour


def parse_day_csv(csv_path: Path, reading_date: str, user_id: str) -> list[dict]:
    """Read one usage_day_*.csv export into rows shaped for energy_readings.
    Mirrors app/src/lib/csv.js's toReadingRow exactly."""
    rows = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw_row in reader:
            hour_start = parse_hour_start(raw_row.get("Time period"))
            try:
                consumption = float(raw_row.get("Consumption", ""))
            except (TypeError, ValueError):
                consumption = None

            if hour_start is None or consumption is None:
                continue

            rows.append(
                {
                    "service": (raw_row.get("Service") or "").strip() or None,
                    "reading_date": reading_date,
                    "hour_start": hour_start,
                    "time_period": (raw_row.get("Time period") or "").strip() or None,
                    "consumption": consumption,
                    "consumption_unit": (raw_row.get("Consumption unit") or "").strip()
                    or "KWH",
                    "meter_serial": (raw_row.get("Meter serial number") or "").strip()
                    or None,
                    "user_id": user_id,
                }
            )
    return rows


def get_supabase_client():
    url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role_key:
        sys.exit("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.")
    return create_client(url, service_role_key)


def sync_recent_days() -> None:
    user_id = os.getenv("SUPABASE_USER_ID")
    if not user_id:
        sys.exit("Missing SUPABASE_USER_ID in the environment.")
 
    supabase = get_supabase_client()
    today = date.today()
    target_dates = [today - timedelta(days=1), today - timedelta(days=2)]
 
    all_rows: list[dict] = []
    days_processed = 0
    days_skipped: list[str] = []
 
    with tempfile.TemporaryDirectory() as tmp:
        # tmp_dir = Path(tmp)
        tmp_dir = Path("scraper/debug_output")
        tmp_dir.mkdir(parents=True, exist_ok=True)
        download_usage_days(headless=True, output_dir=tmp_dir)
 
        for target_date in target_dates:
            csv_path = tmp_dir / f"usage_day_{target_date.isoformat()}.csv"
            if not csv_path.exists():
                print(f"No export produced for {target_date.isoformat()} — skipping.")
                days_skipped.append(target_date.isoformat())
                continue
 
            rows = parse_day_csv(csv_path, target_date.isoformat(), user_id)
            if not rows:
                print(f"No usable rows parsed for {target_date.isoformat()} — skipping.")
                days_skipped.append(target_date.isoformat())
                continue
 
            all_rows.extend(rows)
            days_processed += 1
 
    if all_rows:
        print(f"\nUpserting {len(all_rows)} rows into energy_readings...")
        supabase.table("energy_readings").upsert(
            all_rows,
            on_conflict="user_id,service,reading_date,hour_start",
        ).execute()
    else:
        print("\nNo rows to upsert this run.")
 
    print(
        f"\nDone. Days processed: {days_processed}. "
        f"Days skipped: {days_skipped if days_skipped else 'none'}."
    )
 


if __name__ == "__main__":
    sync_recent_days()