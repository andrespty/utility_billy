"""
Python port of app/src/lib/csv.js's row-parsing logic, so the scraper can
upsert straight into Supabase's energy_readings table using the exact same
column mapping the app's browser Upload page uses. Keep this in sync with
csv.js's parseHourStart()/toReadingRow() if the vendor CSV format changes.

Expected columns: Service, Time period, Consumption, Consumption unit,
Meter serial number, Register serial number, Counter time frame
"""

import csv
import re
from pathlib import Path
from typing import Optional

_TIME_RE = re.compile(r"(\d{1,2}):(\d{2})\s*(AM|PM)", re.IGNORECASE)


def parse_hour_start(time_period: str) -> Optional[int]:
    """Convert a "Time period" cell like "1:00 AM-1:59 AM" into the 24-hour
    start hour (0-23) it represents. Returns None if unparseable."""
    if not time_period:
        return None

    start_part = time_period.split("-")[0].strip()  # "1:00 AM"
    match = _TIME_RE.match(start_part)
    if not match:
        return None

    hour = int(match.group(1))
    meridiem = match.group(3).upper()
    if meridiem == "AM":
        if hour == 12:
            hour = 0
    else:  # PM
        if hour != 12:
            hour += 12

    return hour


def _clean(value) -> Optional[str]:
    value = (value or "").strip()
    return value or None


def parse_reading_rows(csv_path: Path, reading_date: str) -> list[dict]:
    """Read one exported daily-usage CSV into a list of dicts shaped for the
    energy_readings table. Rows with an unparseable time or consumption are
    skipped, same as toReadingRow() does in the app."""
    rows = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            hour_start = parse_hour_start(_clean(raw.get("Time period")))
            try:
                consumption = float(raw.get("Consumption"))
            except (TypeError, ValueError):
                consumption = None

            if hour_start is None or consumption is None:
                continue

            rows.append(
                {
                    "service": _clean(raw.get("Service")),
                    "reading_date": reading_date,
                    "hour_start": hour_start,
                    "time_period": _clean(raw.get("Time period")),
                    "consumption": consumption,
                    "consumption_unit": _clean(raw.get("Consumption unit")) or "KWH",
                    "meter_serial": _clean(raw.get("Meter serial number")),
                }
            )

    return rows
