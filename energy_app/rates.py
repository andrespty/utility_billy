"""Rate plan calculators.

Two plans, both from TalGov residential tariff (July 2026):

    STANDARD              $0.13279 / kWh flat + $9.96/mo customer charge
    NIGHTS_AND_WEEKENDS   On-peak  (Mon–Fri 7am–7pm, not holidays): $0.27664 / kWh
                          Off-peak (everything else):                $0.07413 / kWh
                          + $9.96/mo customer charge

Cost is computed for an arbitrary window of hourly rows so the same function
serves "cycle so far", "prev cycle", "just today", etc.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable

import pandas as pd

# Rate constants — edit here if TalGov's tariff changes
STANDARD_RATE = 0.13279     # $/kWh, all-in (energy + ECRC)

NW_OFF_PEAK_RATE = 0.07413  # $/kWh
NW_ON_PEAK_RATE  = 0.27664  # $/kWh

DEFAULT_FIXED_MONTHLY = 9.96  # customer charge, single-phase

PLAN_STANDARD = "standard"
PLAN_NIGHTS_WEEKENDS = "nights_weekends"
PLAN_LABELS = {
    PLAN_STANDARD: "Standard",
    PLAN_NIGHTS_WEEKENDS: "Nights & Weekends",
}


# ---------------------------------------------------------------------------
# On-peak classifier
# ---------------------------------------------------------------------------

def is_on_peak(d: date, hour: int, holidays: set[str]) -> bool:
    """True for N&W on-peak: Mon–Fri 7am–7pm, excluding holidays."""
    if d.strftime("%Y-%m-%d") in holidays:
        return False
    if d.weekday() >= 5:  # 5 = Sat, 6 = Sun
        return False
    return 7 <= hour < 19


# ---------------------------------------------------------------------------
# Cost calculation
# ---------------------------------------------------------------------------

@dataclass
class CostBreakdown:
    plan: str
    kwh_total: float
    kwh_on_peak: float
    kwh_off_peak: float
    energy_cost: float       # variable portion only
    fixed_cost: float        # prorated share of customer charge for this window
    total_cost: float
    days_in_window: int

    def as_dict(self) -> dict:
        return {
            "plan": self.plan,
            "kwh_total": round(self.kwh_total, 2),
            "kwh_on_peak": round(self.kwh_on_peak, 2),
            "kwh_off_peak": round(self.kwh_off_peak, 2),
            "energy_cost": round(self.energy_cost, 2),
            "fixed_cost": round(self.fixed_cost, 2),
            "total_cost": round(self.total_cost, 2),
            "days_in_window": self.days_in_window,
            "on_peak_pct": round(100 * self.kwh_on_peak / self.kwh_total, 1) if self.kwh_total else 0,
            "off_peak_pct": round(100 * self.kwh_off_peak / self.kwh_total, 1) if self.kwh_total else 0,
        }


def compute_cost(
    df: pd.DataFrame,
    plan: str,
    holidays: set[str] | None = None,
    fixed_monthly: float = DEFAULT_FIXED_MONTHLY,
    prorate_fixed: bool = True,
) -> CostBreakdown:
    """
    df must have columns: date (datetime.date), hour (int 0-23), kwh (float).

    Fixed customer charge is prorated by (days_in_window / 30) unless
    prorate_fixed=False (in which case it's the full monthly charge).
    """
    holidays = holidays or set()

    if df.empty:
        return CostBreakdown(plan, 0, 0, 0, 0.0, 0.0, 0.0, 0)

    df = df.copy()
    # Ensure `date` is a real date object
    if not isinstance(df["date"].iloc[0], date):
        df["date"] = pd.to_datetime(df["date"]).dt.date

    days_in_window = df["date"].nunique()

    if plan == PLAN_STANDARD:
        kwh_total = float(df["kwh"].sum())
        energy_cost = kwh_total * STANDARD_RATE
        kwh_on = kwh_off = 0.0
    elif plan == PLAN_NIGHTS_WEEKENDS:
        mask_on = df.apply(lambda r: is_on_peak(r["date"], int(r["hour"]), holidays), axis=1)
        kwh_on  = float(df.loc[mask_on, "kwh"].sum())
        kwh_off = float(df.loc[~mask_on, "kwh"].sum())
        kwh_total = kwh_on + kwh_off
        energy_cost = kwh_on * NW_ON_PEAK_RATE + kwh_off * NW_OFF_PEAK_RATE
    else:
        raise ValueError(f"unknown plan: {plan!r}")

    fixed = fixed_monthly 

    return CostBreakdown(
        plan=plan,
        kwh_total=kwh_total,
        kwh_on_peak=kwh_on,
        kwh_off_peak=kwh_off,
        energy_cost=energy_cost,
        fixed_cost=fixed,
        total_cost=energy_cost + fixed,
        days_in_window=days_in_window,
    )


# ---------------------------------------------------------------------------
# Per-hour dollar amounts (for the cost heatmap)
# ---------------------------------------------------------------------------

def cost_per_row(df: pd.DataFrame, plan: str, holidays: set[str] | None = None) -> pd.Series:
    """Return a Series of $ per hourly row (aligned with df's index)."""
    holidays = holidays or set()
    if df.empty:
        return pd.Series(dtype=float)

    if plan == PLAN_STANDARD:
        return df["kwh"] * STANDARD_RATE

    def rate_for(r):
        return NW_ON_PEAK_RATE if is_on_peak(r["date"], int(r["hour"]), holidays) else NW_OFF_PEAK_RATE

    rates = df.apply(rate_for, axis=1)
    return df["kwh"] * rates
