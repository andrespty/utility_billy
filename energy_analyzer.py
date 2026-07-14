"""
Energy consumption analyzer.

Usage
-----
    python energy_analyzer.py

Folder layout (created automatically next to this script):
    data/       drop new monthly CSVs here (any filename)
    output/     master.csv + generated plots

Behavior
--------
- Scans data/ for every *.csv, parses the vendor format shown below,
  and merges rows into output/master.csv keyed by date. Newer files
  win on conflicts, so re-dropping a corrected export just overwrites.
- Days with 0 kWh are treated as "no reading yet" and dropped from
  analysis (utility exports pad the current month with zeros).
- Prints a weekday-vs-weekend comparison table per month.
- Writes three bar charts to output/:
    daily_consumption.png         one bar per day, colored by weekday/weekend
    weekday_vs_weekend.png        grouped bars, per month
    monthly_totals.png            total kWh per month

Expected CSV columns:
    Service, Time period, Consumption, Consumption unit,
    Meter serial number, Register serial number, Counter time frame
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data" / "weekly"
OUTPUT_DIR = SCRIPT_DIR / "output"
MASTER_CSV = OUTPUT_DIR / "master.csv"


def load_one(path: Path) -> pd.DataFrame:
    """Read one vendor CSV into a tidy frame: date, consumption_kwh, source_file, source_mtime."""
    df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]

    # Vendor puts a leading space in the date field ("  Jul 1 2026")
    df["date"] = pd.to_datetime(df["Time period"].str.strip(), format="%b %d %Y")
    df["consumption_kwh"] = pd.to_numeric(df["Consumption"], errors="coerce")
    df["source_file"] = path.name
    df["source_mtime"] = path.stat().st_mtime

    return df[["date", "consumption_kwh", "source_file", "source_mtime"]]


def rebuild_master() -> pd.DataFrame:
    """Merge every CSV in data/ into a single deduped frame keyed by date."""
    DATA_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    files = sorted(DATA_DIR.glob("*.csv"))
    if not files:
        print(f"No CSVs found in {DATA_DIR}. Drop your monthly exports there and rerun.")
        sys.exit(0)

    frames = []
    for f in files:
        try:
            frames.append(load_one(f))
        except Exception as e:
            print(f"  ! skipping {f.name}: {e}")

    combined = pd.concat(frames, ignore_index=True)

    # Newer file wins on duplicate dates
    combined.sort_values(["date", "source_mtime"], inplace=True)
    combined.drop_duplicates(subset="date", keep="last", inplace=True)
    combined.sort_values("date", inplace=True)
    combined.reset_index(drop=True, inplace=True)

    combined[["date", "consumption_kwh", "source_file"]].to_csv(MASTER_CSV, index=False)
    print(f"Master dataset: {len(combined)} days -> {MASTER_CSV}")
    return combined


def enrich(df: pd.DataFrame) -> pd.DataFrame:
    """Drop empty readings, tag weekday/weekend and month."""
    df = df[df["consumption_kwh"] > 0].copy()
    df["day_type"] = np.where(df["date"].dt.dayofweek >= 5, "Weekend", "Weekday")
    df["month"] = df["date"].dt.to_period("M").astype(str)
    return df


def print_comparison(df: pd.DataFrame) -> None:
    """Weekday vs weekend average kWh per month."""
    pivot = (
        df.groupby(["month", "day_type"])["consumption_kwh"]
        .agg(["mean", "sum", "count"])
        .round(2)
    )
    print("\nWeekday vs Weekend by month (kWh):")
    print(pivot.to_string())
    print()


def plot_daily(df: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(max(10, 0.25 * len(df)), 5))
    colors = df["day_type"].map({"Weekday": "#4C72B0", "Weekend": "#DD8452"})
    ax.bar(df["date"], df["consumption_kwh"], color=colors)
    ax.set_title("Daily energy consumption (kWh)")
    ax.set_ylabel("kWh")
    ax.set_xlabel("Date")
    ax.grid(axis="y", alpha=0.3)

    from matplotlib.patches import Patch
    ax.legend(handles=[
        Patch(facecolor="#4C72B0", label="Weekday"),
        Patch(facecolor="#DD8452", label="Weekend"),
    ])

    fig.autofmt_xdate()
    out = OUTPUT_DIR / "daily_consumption.png"
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)
    return out


def plot_weekday_vs_weekend(df: pd.DataFrame) -> Path:
    pivot = df.pivot_table(
        index="month", columns="day_type", values="consumption_kwh", aggfunc="mean"
    ).sort_index()

    fig, ax = plt.subplots(figsize=(max(6, 1.2 * len(pivot)), 5))
    x = np.arange(len(pivot.index))
    width = 0.38

    if "Weekday" in pivot:
        ax.bar(x - width / 2, pivot["Weekday"], width, label="Weekday", color="#4C72B0")
    if "Weekend" in pivot:
        ax.bar(x + width / 2, pivot["Weekend"], width, label="Weekend", color="#DD8452")

    ax.set_xticks(x)
    ax.set_xticklabels(pivot.index, rotation=0)
    ax.set_ylabel("Average kWh per day")
    ax.set_title("Weekday vs Weekend average by month")
    ax.grid(axis="y", alpha=0.3)
    ax.legend()

    out = OUTPUT_DIR / "weekday_vs_weekend.png"
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)
    return out


def plot_monthly_totals(df: pd.DataFrame) -> Path:
    totals = df.groupby("month")["consumption_kwh"].sum().sort_index()
    fig, ax = plt.subplots(figsize=(max(6, 1.2 * len(totals)), 5))
    ax.bar(totals.index, totals.values, color="#55A868")
    ax.set_ylabel("Total kWh")
    ax.set_title("Total energy consumption by month")
    ax.grid(axis="y", alpha=0.3)
    for i, v in enumerate(totals.values):
        ax.text(i, v, f"{v:,.0f}", ha="center", va="bottom", fontsize=9)
    out = OUTPUT_DIR / "monthly_totals.png"
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    plt.close(fig)
    return out


def main() -> None:
    raw = rebuild_master()
    df = enrich(raw)

    if df.empty:
        print("No non-zero readings yet. Nothing to plot.")
        return

    print_comparison(df)

    daily = plot_daily(df)
    wk = plot_weekday_vs_weekend(df)
    monthly = plot_monthly_totals(df)

    print("Plots written:")
    for p in (daily, wk, monthly):
        print(f"  {p}")


if __name__ == "__main__":
    main()
