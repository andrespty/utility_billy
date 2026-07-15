"""Report page — cycle metrics, breakdown, interactive daily chart, heatmap."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
import streamlit as st

from db import init_db, get_setting, set_setting, db_stats, get_total_fixed_monthly
from rates import (
    PLAN_LABELS, PLAN_STANDARD, PLAN_NIGHTS_WEEKENDS,
    STANDARD_RATE, NW_ON_PEAK_RATE, NW_OFF_PEAK_RATE,
)
from reports import (
    resolve_cycles, build_cycle_report,
    kwh_heatmap, daily_series, daily_target_kwh,
    target_summary,
)

init_db()
st.title("📊 Report")

# --- Sanity checks ----------------------------------------------------------
if db_stats()["days"] == 0:
    st.info("Upload some data first (see the **Upload** page).")
    st.stop()

current, _ = resolve_cycles()
if current is None:
    st.warning("Add a billing cycle start date on the **Settings** page to see the report.")
    st.stop()

# --- Plan switch ------------------------------------------------------------
plan_key = "rate_plan"
current_plan = get_setting(plan_key, PLAN_STANDARD)
picked = st.radio(
    "Rate plan",
    options=[PLAN_STANDARD, PLAN_NIGHTS_WEEKENDS],
    format_func=lambda p: PLAN_LABELS[p],
    index=0 if current_plan == PLAN_STANDARD else 1,
    horizontal=True,
)
if picked != current_plan:
    set_setting(plan_key, picked)
    st.rerun()

st.caption(
    f"Cycle **{current.start.isoformat()} → {current.end.isoformat()}** "
    f"· day {(current.end - current.start).days + 1} of {current.days_expected}"
)

report = build_cycle_report(current, picked)
b = report.cost_current_plan   # CostBreakdown

# --- Row 1: current bill + breakdown ---------------------------------------
c1, c2 = st.columns([1, 2])

with c1:
    st.metric(
        "Current bill",
        f"${b.total_cost:,.2f}",
        f"{report.kwh_so_far:.1f} kWh so far",
    )
    st.caption(f"Projected full cycle: **${report.projected_cost:,.2f}** "
               f"({report.projected_kwh:.0f} kWh)")

with c2:
    st.markdown("**Breakdown**")
    if picked == PLAN_STANDARD:
        rows = [
            {"Component": "Energy", "kWh": f"{b.kwh_total:.2f}",
             "Rate":  f"${STANDARD_RATE:.5f}", "Amount": f"${b.energy_cost:.2f}"},
            {"Component": "Fixed monthly fees", "kWh": "—",
             "Rate": "—", "Amount": f"${b.fixed_cost:.2f}"},
            {"Component": "**Total**", "kWh": f"**{b.kwh_total:.2f}**",
             "Rate": "", "Amount": f"**${b.total_cost:.2f}**"},
        ]
    else:
        rows = [
            {"Component": "Off-peak energy", "kWh": f"{b.kwh_off_peak:.2f}",
             "Rate":  f"${NW_OFF_PEAK_RATE:.5f}",
             "Amount": f"${b.kwh_off_peak * NW_OFF_PEAK_RATE:.2f}"},
            {"Component": "On-peak energy",  "kWh": f"{b.kwh_on_peak:.2f}",
             "Rate":  f"${NW_ON_PEAK_RATE:.5f}",
             "Amount": f"${b.kwh_on_peak * NW_ON_PEAK_RATE:.2f}"},
            {"Component": "Energy subtotal", "kWh": f"{b.kwh_total:.2f}",
             "Rate": "", "Amount": f"${b.energy_cost:.2f}"},
            {"Component": "Fixed monthly fees", "kWh": "—",
             "Rate": "—", "Amount": f"${b.fixed_cost:.2f}"},
            {"Component": "Total", "kWh": f"{b.kwh_total:.2f}",
             "Rate": "", "Amount": f"${b.total_cost:.2f}"},
        ]
    st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)

st.divider()

# --- Daily kWh + cost per plan + target line (interactive) ------------------
st.subheader("📅 Daily usage this cycle — kWh, cost, and target")

saved_target = float(get_setting("monthly_target", "0"))
c_left, _ = st.columns([1, 3])
target_override = c_left.number_input(
    "Target ($/mo) — try what-ifs",
    min_value=0.0, step=5.0, value=saved_target,
    help="Only affects the chart. Save it permanently on the Settings page.",
)

daily = daily_series(current)
target_kwh_per_day = daily_target_kwh(current, picked, target_override=target_override)

if daily.empty:
    st.write("_no data for this cycle yet_")
else:
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots

    x = pd.to_datetime(daily["date"])
    fig = make_subplots(specs=[[{"secondary_y": True}]])

    fig.add_trace(
        go.Bar(x=x, y=daily["kwh"], name="kWh",
               marker_color="#4C72B0", opacity=0.8,
               hovertemplate="%{x|%a %b %d}<br>%{y:.1f} kWh<extra></extra>"),
        secondary_y=False,
    )
    fig.add_trace(
        go.Scatter(x=x, y=daily["cost_standard"], name="$ Standard",
                   mode="lines+markers",
                   line=dict(color="#DD8452", width=2),
                   marker=dict(size=7),
                   hovertemplate="%{x|%a %b %d}<br>$%{y:.2f} on Standard<extra></extra>"),
        secondary_y=True,
    )
    fig.add_trace(
        go.Scatter(x=x, y=daily["cost_nw"], name="$ Nights & Weekends",
                   mode="lines+markers",
                   line=dict(color="#55A468", width=2),
                   marker=dict(size=7, symbol="square"),
                   hovertemplate="%{x|%a %b %d}<br>$%{y:.2f} on N&W<extra></extra>"),
        secondary_y=True,
    )

    if target_kwh_per_day > 0:
        fig.add_hline(
            y=target_kwh_per_day, line_dash="dash",
            line_color="crimson", line_width=2,
            annotation_text=(
                f"Target: {target_kwh_per_day:.1f} kWh/day "
                f"(${target_override:.0f}/mo on {PLAN_LABELS[picked]})"
            ),
            annotation_position="top left",
            annotation_font_color="crimson",
            secondary_y=False,
        )

    fig.update_yaxes(title_text="kWh per day", secondary_y=False)
    fig.update_yaxes(title_text="$ per day", secondary_y=True)
    fig.update_xaxes(title_text="")
    fig.update_layout(
        height=460, hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        margin=dict(t=60, b=40, l=40, r=40),
        bargap=0.2,
    )

    st.plotly_chart(fig, use_container_width=True)
    st.caption("Hover for details · click legend to toggle series · red line moves with the target above.")

st.divider()

# --- kWh heatmap: hours × days of week (interactive) ------------------------
st.subheader("🔥 kWh heatmap — hour of day × day of week")
heat = kwh_heatmap(current)
if heat.empty:
    st.write("_no data_")
else:
    import plotly.graph_objects as go

    y_labels = [f"{h:02d}:00" for h in heat.index]
    z = heat.values

    fig = go.Figure(data=go.Heatmap(
        z=z,
        x=list(heat.columns),
        y=y_labels,
        colorscale="YlOrRd",
        colorbar=dict(title="kWh"),
        hovertemplate="%{x} at %{y}<br>%{z:.2f} kWh<extra></extra>",
    ))
    fig.update_layout(
        height=520,
        margin=dict(t=20, b=40, l=60, r=40),
        xaxis=dict(side="top"),
        yaxis=dict(autorange="reversed"),  # midnight at top
    )
    st.plotly_chart(fig, use_container_width=True)
    st.caption("Sum of kWh for that hour + weekday across the whole cycle. Darker = more usage.")
