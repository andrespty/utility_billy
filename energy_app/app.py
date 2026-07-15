"""Streamlit entry point.

Run from the utility_billy/ root:
    streamlit run energy_app/app.py

Streamlit auto-discovers files in energy_app/pages/ and shows them in the
sidebar. This file just initializes the DB and renders a landing screen.
"""

import sys
from pathlib import Path

# Make sibling modules importable when Streamlit launches this file directly
sys.path.insert(0, str(Path(__file__).resolve().parent))

import streamlit as st

from db import init_db, db_stats, get_setting
from rates import PLAN_LABELS

st.set_page_config(
    page_title="Utility Billy — Energy",
    page_icon="⚡",
    layout="wide",
)

init_db()

st.title("⚡ Utility Billy")
st.caption("Local, private energy tracker for TalGov customers.")

stats = db_stats()
plan  = get_setting("rate_plan", "standard")
target = get_setting("monthly_target", "0")

col1, col2, col3 = st.columns(3)
col1.metric("Days in DB", stats["days"])
col2.metric("Active plan", PLAN_LABELS.get(plan, plan))
col3.metric("Monthly target", f"${float(target):.0f}" if float(target) > 0 else "not set")

if stats["days"] == 0:
    st.info("Start on **Upload** in the sidebar to add your first files.")
else:
    st.write(f"Data range: **{stats['min_date']}** → **{stats['max_date']}**")
    st.write("Head to **Report** in the sidebar for your current cycle.")
