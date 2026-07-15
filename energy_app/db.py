"""SQLite persistence for the energy app.

One source of truth: `readings` table at hourly grain. Everything else
(cycles, holidays, user settings) is small config data.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable

import pandas as pd

DB_PATH = Path(__file__).resolve().parent / "energy.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    date        TEXT NOT NULL,
    hour        INTEGER NOT NULL,
    kwh         REAL NOT NULL,
    source_file TEXT,
    loaded_at   TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (date, hour)
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cycles (
    start_date TEXT PRIMARY KEY,
    note       TEXT
);

CREATE TABLE IF NOT EXISTS holidays (
    date TEXT PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS fixed_fees (
    label  TEXT PRIMARY KEY,
    amount REAL NOT NULL
);
"""

DEFAULT_SETTINGS = {
    "rate_plan":       "standard",   # 'standard' | 'nights_weekends'
    "customer_charge": "9.96",
    "monthly_target":  "100",
}


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create tables if needed and seed defaults."""
    with connect() as conn:
        conn.executescript(SCHEMA)
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v)
            )


# ---------------------------------------------------------------------------
# Readings
# ---------------------------------------------------------------------------

def upsert_readings(df: pd.DataFrame, source_file: str | None = None) -> tuple[int, int]:
    """
    Insert or replace hourly rows. Returns (rows_written, rows_replaced).
    Expects columns: date (YYYY-MM-DD str or date), hour (int 0-23), kwh (float).
    """
    if df.empty:
        return (0, 0)

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df["hour"] = df["hour"].astype(int)
    df["kwh"]  = df["kwh"].astype(float)

    with connect() as conn:
        # Count how many of these keys already exist
        keys = list(zip(df["date"], df["hour"]))
        existing = 0
        if keys:
            q = "SELECT COUNT(*) FROM readings WHERE (date, hour) IN (VALUES " + \
                ",".join(["(?, ?)"] * len(keys)) + ")"
            flat = [x for pair in keys for x in pair]
            existing = conn.execute(q, flat).fetchone()[0]

        rows = [(r["date"], r["hour"], r["kwh"], source_file) for _, r in df.iterrows()]
        conn.executemany(
            "INSERT OR REPLACE INTO readings(date, hour, kwh, source_file) VALUES (?, ?, ?, ?)",
            rows,
        )
        return (len(rows), existing)


def load_readings(start: str | None = None, end: str | None = None) -> pd.DataFrame:
    """Return readings between [start, end] inclusive as a DataFrame."""
    q = "SELECT date, hour, kwh FROM readings"
    params: list = []
    if start and end:
        q += " WHERE date BETWEEN ? AND ?"
        params = [start, end]
    elif start:
        q += " WHERE date >= ?"
        params = [start]
    elif end:
        q += " WHERE date <= ?"
        params = [end]
    q += " ORDER BY date, hour"

    with connect() as conn:
        df = pd.read_sql(q, conn, params=params)
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"]).dt.date
    return df


def db_stats() -> dict:
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*), MIN(date), MAX(date), COUNT(DISTINCT date) FROM readings"
        ).fetchone()
    n, mn, mx, days = row
    return {"rows": n or 0, "min_date": mn, "max_date": mx, "days": days or 0}


def delete_range(start: str, end: str) -> int:
    with connect() as conn:
        cur = conn.execute("DELETE FROM readings WHERE date BETWEEN ? AND ?", (start, end))
        return cur.rowcount


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def get_setting(key: str, default: str | None = None) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def set_setting(key: str, value: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def get_all_settings() -> dict[str, str]:
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return dict(rows)


# ---------------------------------------------------------------------------
# Cycles
# ---------------------------------------------------------------------------

def add_cycle(start_date: str, note: str = "") -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO cycles(start_date, note) VALUES (?, ?)",
            (start_date, note),
        )


def delete_cycle(start_date: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM cycles WHERE start_date = ?", (start_date,))


def get_cycles() -> list[dict]:
    """Return cycles ordered newest → oldest."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT start_date, note FROM cycles ORDER BY start_date DESC"
        ).fetchall()
    return [{"start_date": r[0], "note": r[1] or ""} for r in rows]


# ---------------------------------------------------------------------------
# Holidays
# ---------------------------------------------------------------------------

def add_holiday(date_str: str, name: str = "") -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO holidays(date, name) VALUES (?, ?)",
            (date_str, name),
        )


def delete_holiday(date_str: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM holidays WHERE date = ?", (date_str,))


def get_holidays() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT date, name FROM holidays ORDER BY date DESC"
        ).fetchall()
    return [{"date": r[0], "name": r[1] or ""} for r in rows]


def get_holiday_set() -> set[str]:
    """Just the dates as YYYY-MM-DD strings — fast lookup for rate calc."""
    with connect() as conn:
        rows = conn.execute("SELECT date FROM holidays").fetchall()
    return {r[0] for r in rows}


# ---------------------------------------------------------------------------
# Fixed fees (extras on top of the base customer charge)
# ---------------------------------------------------------------------------

def add_fixed_fee(label: str, amount: float) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO fixed_fees(label, amount) VALUES (?, ?) "
            "ON CONFLICT(label) DO UPDATE SET amount = excluded.amount",
            (label, float(amount)),
        )


def delete_fixed_fee(label: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM fixed_fees WHERE label = ?", (label,))


def get_fixed_fees() -> list[dict]:
    with connect() as conn:
        rows = conn.execute("SELECT label, amount FROM fixed_fees ORDER BY label").fetchall()
    return [{"label": r[0], "amount": float(r[1])} for r in rows]


def get_total_fixed_monthly() -> float:
    """Base customer charge + all additional fixed fees."""
    base = float(get_setting("customer_charge", "9.96") or 0)
    extras = sum(f["amount"] for f in get_fixed_fees())
    return base + extras
