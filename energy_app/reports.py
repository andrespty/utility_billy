"""Cycle-oriented reporting: boundaries, projections, buckets."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

import pandas as pd

from db import (
    get_cycles, load_readings, get_holiday_set, get_setting,
    get_total_fixed_monthly,
)
from rates import (
    compute_cost, cost_per_row, CostBreakdown,
    PLAN_STANDARD, PLAN_NIGHTS_WEEKENDS,
)


# ---------------------------------------------------------------------------
# Cycle boundary derivation
# ---------------------------------------------------------------------------

@dataclass
class CycleBounds:
    label: str          # "current" | "previous"
    start: date         # inclusive
    end: date           # inclusive
    days_expected: int  # length of the full cycle (start → next_start − 1)


def _to_date(s: str) -> date:
    y, m, d = map(int, s.split("-"))
    return date(y, m, d)


def resolve_cycles(today: date | None = None) -> tuple[Optional[CycleBounds], Optional[CycleBounds]]:
    """
    Return (current, previous) cycle bounds derived from the user's entered
    cycle start dates.

      current  = latest start_date .. today
      previous = second-latest start_date .. latest start_date - 1 day
    """
    today = today or date.today()
    cycles = [_to_date(c["start_date"]) for c in get_cycles()]
    cycles.sort(reverse=True)  # newest first

    current = previous = None

    if cycles:
        cur_start = cycles[0]
        # Days expected: assume 30-day cycle unless we have a prior start
        cur_length = 30
        if len(cycles) > 1:
            cur_length = (cur_start - cycles[1]).days
        current = CycleBounds("current", cur_start, today, cur_length)

    if len(cycles) > 1:
        prev_start = cycles[1]
        prev_end   = cycles[0] - timedelta(days=1)
        previous   = CycleBounds("previous", prev_start, prev_end,
                                 (cycles[0] - prev_start).days)

    return current, previous


# ---------------------------------------------------------------------------
# Cost + projection
# ---------------------------------------------------------------------------

@dataclass
class CycleReport:
    bounds: CycleBounds
    days_elapsed: int
    kwh_so_far: float
    cost_current_plan: CostBreakdown
    cost_other_plan: CostBreakdown
    projected_kwh: float
    projected_cost: float
    on_track_for_target: Optional[bool]  # None if no target


def _project(kwh_so_far: float, days_elapsed: int, days_total: int) -> float:
    if days_elapsed <= 0:
        return 0.0
    return kwh_so_far / days_elapsed * days_total


def build_cycle_report(bounds: CycleBounds, active_plan: str) -> CycleReport:
    df = load_readings(bounds.start.isoformat(), bounds.end.isoformat())
    holidays = get_holiday_set()
    fixed_full = get_total_fixed_monthly()

    days_elapsed = df["date"].nunique() if not df.empty else 0
    kwh_so_far = float(df["kwh"].sum()) if not df.empty else 0.0

    active_cost = compute_cost(df, active_plan, holidays, fixed_monthly=fixed_full)
    other_plan  = PLAN_STANDARD if active_plan == PLAN_NIGHTS_WEEKENDS else PLAN_NIGHTS_WEEKENDS
    other_cost  = compute_cost(df, other_plan, holidays, fixed_monthly=fixed_full)

    projected_kwh = _project(kwh_so_far, days_elapsed, bounds.days_expected)

    # Project full-cycle cost by scaling the energy portion + full monthly fixed
    if days_elapsed > 0:
        scale = bounds.days_expected / days_elapsed
        projected_energy = active_cost.energy_cost * scale
    else:
        projected_energy = 0.0
    projected_cost = projected_energy + fixed_full

    # On target?
    target = float(get_setting("monthly_target", "0"))
    on_track = None if target <= 0 else projected_cost <= target

    return CycleReport(
        bounds=bounds,
        days_elapsed=days_elapsed,
        kwh_so_far=kwh_so_far,
        cost_current_plan=active_cost,
        cost_other_plan=other_cost,
        projected_kwh=projected_kwh,
        projected_cost=projected_cost,
        on_track_for_target=on_track,
    )


# ---------------------------------------------------------------------------
# Time-of-day buckets
# ---------------------------------------------------------------------------

BUCKETS = [
    ("Overnight (12am–7am)",   0,  7),
    ("Morning (7am–12pm)",     7, 12),
    ("Afternoon (12pm–7pm)",  12, 19),
    ("Evening (7pm–12am)",    19, 24),
]


def bucket_totals(bounds: CycleBounds) -> pd.DataFrame:
    df = load_readings(bounds.start.isoformat(), bounds.end.isoformat())
    if df.empty:
        return pd.DataFrame(columns=["bucket", "kwh"])
    rows = []
    for name, lo, hi in BUCKETS:
        kwh = float(df[(df["hour"] >= lo) & (df["hour"] < hi)]["kwh"].sum())
        rows.append({"bucket": name, "kwh": round(kwh, 2)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Cost heatmap (day-of-week × hour)
# ---------------------------------------------------------------------------

def kwh_heatmap(bounds: CycleBounds) -> pd.DataFrame:
    """Pivot table: rows = hour 0..23, cols = Mon..Sun, values = kWh summed."""
    df = load_readings(bounds.start.isoformat(), bounds.end.isoformat())
    if df.empty:
        return pd.DataFrame()
    df = df.copy()
    df["dow"] = pd.to_datetime(df["date"]).dt.day_name()
    pivot = df.pivot_table(index="hour", columns="dow", values="kwh",
                           aggfunc="sum", fill_value=0.0)
    order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    pivot = pivot.reindex(columns=[d for d in order if d in pivot.columns])
    pivot = pivot.reindex(index=range(24), fill_value=0.0)
    return pivot


def daily_series(bounds: CycleBounds) -> pd.DataFrame:
    """Per-day totals for the current cycle: date, kwh, cost_standard, cost_nw."""
    df = load_readings(bounds.start.isoformat(), bounds.end.isoformat())
    if df.empty:
        return pd.DataFrame(columns=["date", "kwh", "cost_standard", "cost_nw"])

    holidays = get_holiday_set()
    df = df.copy()
    df["cost_standard"] = cost_per_row(df, PLAN_STANDARD, holidays)
    df["cost_nw"]       = cost_per_row(df, PLAN_NIGHTS_WEEKENDS, holidays)

    daily = (
        df.groupby("date")
          .agg(kwh=("kwh", "sum"),
               cost_standard=("cost_standard", "sum"),
               cost_nw=("cost_nw", "sum"))
          .reset_index()
          .sort_values("date")
    )
    return daily


def daily_target_kwh(bounds: CycleBounds, active_plan: str,
                     target_override: float | None = None) -> float:
    """kWh/day the user can spend to hit their monthly $ target on the active plan."""
    tgt = target_summary(active_plan, target_override=target_override)
    if tgt["target"] <= 0 or bounds.days_expected <= 0:
        return 0.0
    return tgt["allowed_kwh"] / bounds.days_expected


# ---------------------------------------------------------------------------
# Target math
# ---------------------------------------------------------------------------

def target_summary(active_plan: str, target_override: float | None = None) -> dict:
    """How many kWh can I spend this month to hit my $ target?

    target_override lets the Report page test different targets without
    committing to the DB.
    """
    target = float(target_override) if target_override is not None \
             else float(get_setting("monthly_target", "0"))
    fixed  = get_total_fixed_monthly()
    if target <= 0:
        return {"target": 0, "fixed": fixed, "allowed_kwh": 0, "energy_budget": 0}
    energy_budget = max(0.0, target - fixed)

    if active_plan == PLAN_STANDARD:
        from rates import STANDARD_RATE
        allowed_kwh = energy_budget / STANDARD_RATE
    else:
        # For N&W, allowed_kwh depends on the mix — use blended average based
        # on a typical 30/70 on-peak/off-peak split (rough guide only).
        from rates import NW_ON_PEAK_RATE, NW_OFF_PEAK_RATE
        blended = 0.3 * NW_ON_PEAK_RATE + 0.7 * NW_OFF_PEAK_RATE
        allowed_kwh = energy_budget / blended

    return {
        "target": target,
        "fixed": fixed,
        "energy_budget": energy_budget,
        "allowed_kwh": allowed_kwh,
    }
