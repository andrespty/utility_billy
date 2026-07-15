"""Parse uploaded TalGov CSV/XLSX files into readings rows.

Two formats we support:

1. HOURLY DAILY export (what download_usage.py fetches):
     Time period,Consumption,Consumption unit,...
     12:00 AM-12:59 AM,0.42,KWH,...
     1:00 AM-1:59 AM,0.38,KWH,...
   Filename embeds the date: usage_day_2026-07-14.csv

2. DAILY MONTHLY export (original file you uploaded):
     Time period,Consumption,...
     Jul 1 2026,47.01,KWH,...
   → treated as one row per day (hour = None), so we skip it for the
     hourly DB. Weekly exports are also skipped for the same reason.
"""

from __future__ import annotations

import io
import re
from datetime import datetime
from pathlib import Path
from typing import IO

import pandas as pd


class ParseSkip(Exception):
    """Raised when the file is a valid TalGov export but not hourly."""


def _read(source: str | Path | IO) -> pd.DataFrame:
    if isinstance(source, (str, Path)):
        return pd.read_csv(source, encoding="utf-8-sig")
    # Streamlit UploadedFile / BytesIO
    data = source.read()
    return pd.read_csv(io.BytesIO(data), encoding="utf-8-sig")


def _detect_date_from_name(name: str) -> str | None:
    """Extract YYYY-MM-DD from filenames like usage_day_2026-07-14.csv."""
    m = re.search(r"(\d{4}-\d{2}-\d{2})", name)
    return m.group(1) if m else None


def parse_hourly(source, filename: str) -> pd.DataFrame:
    """
    Return DataFrame with columns [date, hour, kwh] ready for db.upsert_readings.
    Raises ParseSkip if this isn't an hourly file we can use.
    """
    df = _read(source)
    df.columns = [c.strip() for c in df.columns]

    if "Time period" not in df.columns or "Consumption" not in df.columns:
        raise ParseSkip(f"missing expected columns (got {list(df.columns)})")

    sample = str(df["Time period"].iloc[0])

    # Hourly rows look like "12:00 AM-12:59 AM"
    if re.match(r"^\d{1,2}:\d{2}\s*[AP]M-\d{1,2}:\d{2}\s*[AP]M$", sample.strip()):
        date_str = _detect_date_from_name(filename)
        if not date_str:
            raise ParseSkip("hourly file but filename has no YYYY-MM-DD")

        start = df["Time period"].astype(str).str.split("-").str[0].str.strip()
        hours = pd.to_datetime(start, format="%I:%M %p").dt.hour
        kwh = pd.to_numeric(df["Consumption"], errors="coerce")

        out = pd.DataFrame({"date": date_str, "hour": hours, "kwh": kwh})
        out = out.dropna(subset=["kwh"])
        return out

    # Daily rows look like "Jul 1 2026" — not hourly, skip
    if re.match(r"^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}$", sample.strip()):
        raise ParseSkip("daily (per-day) export, not hourly")

    raise ParseSkip(f"unrecognized Time period format: {sample!r}")
