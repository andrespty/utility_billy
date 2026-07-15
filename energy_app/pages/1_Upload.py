"""Upload page — drag-drop CSVs (or XLSX) into the DB."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st

from db import init_db, upsert_readings, db_stats, delete_range, load_readings
from parse import parse_hourly, ParseSkip

init_db()

st.title("📤 Upload")
st.write("Drag & drop TalGov hourly export files (`usage_day_YYYY-MM-DD.csv`). Duplicates are replaced — safe to re-upload.")

files = st.file_uploader(
    "Choose one or more CSV files",
    type=["csv"],
    accept_multiple_files=True,
)

if files:
    results = []
    for f in files:
        try:
            df = parse_hourly(f, f.name)
            written, replaced = upsert_readings(df, source_file=f.name)
            new = written - replaced
            results.append({"file": f.name, "status": "✅",
                            "added": new, "replaced": replaced})
        except ParseSkip as e:
            results.append({"file": f.name, "status": "⚠ skipped", "reason": str(e)})
        except Exception as e:
            results.append({"file": f.name, "status": "❌ error", "reason": str(e)})

    st.write("### Results")
    st.dataframe(results, hide_index=True, use_container_width=True)

st.divider()

# DB status
stats = db_stats()
st.write("### Database")
col1, col2, col3 = st.columns(3)
col1.metric("Rows", stats["rows"])
col2.metric("Days", stats["days"])
col3.metric("Range", f"{stats['min_date'] or '—'} → {stats['max_date'] or '—'}")

with st.expander("⚠ Delete a date range"):
    c1, c2, c3 = st.columns([2, 2, 1])
    d_from = c1.text_input("From (YYYY-MM-DD)")
    d_to   = c2.text_input("To (YYYY-MM-DD)")
    if c3.button("Delete", type="secondary"):
        if d_from and d_to:
            n = delete_range(d_from, d_to)
            st.warning(f"Deleted {n} rows.")
            st.rerun()
        else:
            st.error("Fill both dates.")

with st.expander("👀 Preview last 200 rows"):
    df = load_readings()
    if df.empty:
        st.write("_no data yet_")
    else:
        st.dataframe(df.tail(200), hide_index=True, use_container_width=True)
