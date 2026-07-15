"""Settings page — plan, target, cycles, holidays, data management."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import date

import pandas as pd
import streamlit as st

from db import (
    init_db,
    get_all_settings, set_setting,
    get_cycles, add_cycle, delete_cycle,
    get_holidays, add_holiday, delete_holiday,
    get_fixed_fees, add_fixed_fee, delete_fixed_fee, get_total_fixed_monthly,
    db_stats, load_readings,
)
from rates import PLAN_LABELS, PLAN_STANDARD, PLAN_NIGHTS_WEEKENDS

init_db()
st.title("⚙️ Settings")

settings = get_all_settings()

# --- Plan + charges + target -----------------------------------------------
st.subheader("Plan & target")

col1, col2, col3 = st.columns(3)

with col1:
    plan = st.selectbox(
        "Rate plan",
        options=[PLAN_STANDARD, PLAN_NIGHTS_WEEKENDS],
        format_func=lambda p: PLAN_LABELS[p],
        index=0 if settings.get("rate_plan", "standard") == PLAN_STANDARD else 1,
    )
with col2:
    fixed = st.number_input(
        "Customer charge / month ($)",
        min_value=0.0, step=0.01,
        value=float(settings.get("customer_charge", "9.96")),
    )
with col3:
    target = st.number_input(
        "Monthly $ target",
        min_value=0.0, step=1.0,
        value=float(settings.get("monthly_target", "100")),
    )

if st.button("Save plan settings", type="primary"):
    set_setting("rate_plan", plan)
    set_setting("customer_charge", f"{fixed:.2f}")
    set_setting("monthly_target", f"{target:.2f}")
    st.success("Saved.")

st.divider()

# --- Additional fixed fees -------------------------------------------------
st.subheader("Additional fixed monthly fees")
st.caption(
    "Anything else that appears on your bill every month regardless of usage — "
    "taxes, garbage collection, street lights, franchise fees, etc. "
    "The target above is your *total bill* target, and these get subtracted before "
    "we compute your allowed kWh."
)

with st.form("add_fee", clear_on_submit=True):
    f1, f2, f3 = st.columns([3, 2, 1])
    fee_label  = f1.text_input("Label", placeholder="e.g. Garbage / Sewer / Tax")
    fee_amount = f2.number_input("$ per month", min_value=0.0, step=0.01)
    if f3.form_submit_button("Add"):
        if fee_label.strip():
            add_fixed_fee(fee_label.strip(), fee_amount)
            st.success(f"Added {fee_label}: ${fee_amount:.2f}")
            st.rerun()
        else:
            st.error("Label required.")

fees = get_fixed_fees()
if fees:
    for f in fees:
        ff1, ff2, ff3 = st.columns([3, 2, 1])
        ff1.write(f["label"])
        ff2.write(f"${f['amount']:.2f}")
        if ff3.button("Delete", key=f"del_fee_{f['label']}"):
            delete_fixed_fee(f["label"])
            st.rerun()
else:
    st.write("_no additional fees_")

st.info(f"**Total fixed monthly:** ${get_total_fixed_monthly():.2f} "
        f"(customer charge ${fixed:.2f} + extras ${sum(f['amount'] for f in fees):.2f})")

st.divider()

# --- Cycles ----------------------------------------------------------------
st.subheader("Billing cycles")
st.caption("Enter the start date of each billing cycle from your bill. The report uses the latest one as \"current\".")

with st.form("add_cycle", clear_on_submit=True):
    c1, c2, c3 = st.columns([2, 3, 1])
    new_cycle = c1.date_input("Start date", value=date.today(), key="new_cycle_date")
    note      = c2.text_input("Note (optional)", key="new_cycle_note")
    submitted = c3.form_submit_button("Add")
    if submitted:
        add_cycle(new_cycle.isoformat(), note)
        st.success(f"Added cycle {new_cycle.isoformat()}")
        st.rerun()

cycles = get_cycles()
if cycles:
    for c in cycles:
        cc1, cc2, cc3 = st.columns([2, 4, 1])
        cc1.write(c["start_date"])
        cc2.write(c["note"] or "—")
        if cc3.button("Delete", key=f"del_cyc_{c['start_date']}"):
            delete_cycle(c["start_date"])
            st.rerun()
else:
    st.write("_no cycles yet_")

st.divider()

# --- Holidays --------------------------------------------------------------
st.subheader("N&W holidays")
st.caption("Holidays are treated as off-peak for the Nights & Weekends plan.")

with st.form("add_holiday", clear_on_submit=True):
    h1, h2, h3 = st.columns([2, 3, 1])
    new_hol = h1.date_input("Date", value=date.today(), key="new_hol_date")
    name    = h2.text_input("Name (optional)", key="new_hol_name")
    submitted = h3.form_submit_button("Add")
    if submitted:
        add_holiday(new_hol.isoformat(), name)
        st.success(f"Added holiday {new_hol.isoformat()}")
        st.rerun()

holidays = get_holidays()
if holidays:
    for h in holidays:
        hh1, hh2, hh3 = st.columns([2, 4, 1])
        hh1.write(h["date"])
        hh2.write(h["name"] or "—")
        if hh3.button("Delete", key=f"del_hol_{h['date']}"):
            delete_holiday(h["date"])
            st.rerun()
else:
    st.write("_no holidays yet_")

with st.expander("Quick-add common TalGov holidays for 2026"):
    common = [
        ("2026-01-01", "New Year's Day"),
        ("2026-01-19", "MLK Day"),
        ("2026-05-25", "Memorial Day"),
        ("2026-07-03", "Independence Day (observed)"),
        ("2026-07-04", "Independence Day"),
        ("2026-09-07", "Labor Day"),
        ("2026-11-11", "Veterans Day"),
        ("2026-11-26", "Thanksgiving"),
        ("2026-11-27", "Day after Thanksgiving"),
        ("2026-12-24", "Christmas Eve"),
        ("2026-12-25", "Christmas Day"),
    ]
    if st.button("Add all"):
        for d, n in common:
            add_holiday(d, n)
        st.success(f"Added {len(common)} holidays.")
        st.rerun()

st.divider()

# --- Data management -------------------------------------------------------
st.subheader("Data")
stats = db_stats()
st.write(f"**{stats['rows']}** hourly rows across **{stats['days']}** days "
         f"({stats['min_date'] or '—'} → {stats['max_date'] or '—'})")

df = load_readings()
if not df.empty:
    st.download_button(
        "⬇ Export all readings as CSV",
        data=df.to_csv(index=False),
        file_name="energy_readings.csv",
        mime="text/csv",
    )
