"""
Generate a weekly energy report as a self-contained HTML file.

Reads every ./data/daily/usage_day_YYYY-MM-DD.csv, computes metrics for the
most recent 7-day window vs the prior 7-day window, and writes
./weekly_report.html — a single file you can bookmark and reopen.

Re-run whenever you want to refresh:
    python weekly_report.py

Optional flag to inspect other weeks:
    python weekly_report.py --end 2026-07-13   # ends the "this week" window here
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data" / "daily"
REPORT_PATH = SCRIPT_DIR / "weekly_report.html"

# TalGov residential rate — adjust if your actual bill differs.
# Current all-in average is ~$0.14/kWh (energy + fuel + fixed).
RATE_PER_KWH = 0.14


# --- data loading ----------------------------------------------------------

def load_all() -> pd.DataFrame:
    files = sorted(DATA_DIR.glob("usage_day_*.csv"))
    if not files:
        raise SystemExit(f"No daily files in {DATA_DIR}. Fetch some first.")

    frames = []
    for f in files:
        try:
            df = pd.read_csv(f, encoding="utf-8-sig")
            df.columns = [c.strip() for c in df.columns]
            df["time_period"] = pd.to_datetime(
                df["Time period"].str.split("-").str[0].str.strip(),
                format="%I:%M %p",
            ).dt.time
            df["consumption_kwh"] = pd.to_numeric(df["Consumption"], errors="coerce")
            df["date"] = pd.to_datetime(f.stem.split("_")[-1]).date()
            frames.append(df[["date", "time_period", "consumption_kwh"]])
        except Exception as e:
            print(f"  ! skipping {f.name}: {e}")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined[combined["consumption_kwh"].notna()]
    return combined


# --- metric helpers --------------------------------------------------------

def slice_week(df: pd.DataFrame, end: date) -> pd.DataFrame:
    start = end - timedelta(days=6)
    return df[(df["date"] >= start) & (df["date"] <= end)].copy()


def hour_of(t) -> int:
    return t.hour


def compute_metrics(df: pd.DataFrame, end: date) -> dict:
    this_wk = slice_week(df, end)
    prev_wk = slice_week(df, end - timedelta(days=7))

    total = float(this_wk["consumption_kwh"].sum())
    prior = float(prev_wk["consumption_kwh"].sum())
    delta_kwh = total - prior
    delta_pct = (delta_kwh / prior * 100) if prior else None

    # Hour-of-day average (24 values)
    this_wk["hour"] = this_wk["time_period"].map(hour_of)
    hourly = this_wk.groupby("hour")["consumption_kwh"].mean().reindex(range(24), fill_value=0)

    prev_wk["hour"] = prev_wk["time_period"].map(hour_of)
    hourly_prev = prev_wk.groupby("hour")["consumption_kwh"].mean().reindex(range(24), fill_value=0)

    # Overnight baseline (00:00–05:59 average kWh)
    baseline = float(this_wk[this_wk["hour"] < 6]["consumption_kwh"].mean() or 0)
    baseline_prev = float(prev_wk[prev_wk["hour"] < 6]["consumption_kwh"].mean() or 0)

    # Peak hour
    if not this_wk.empty and this_wk["consumption_kwh"].max() > 0:
        peak_row = this_wk.loc[this_wk["consumption_kwh"].idxmax()]
        peak = {
            "date": peak_row["date"].isoformat(),
            "hour": int(peak_row["time_period"].hour),
            "kwh": float(peak_row["consumption_kwh"]),
        }
    else:
        peak = None

    # Weekday vs weekend average daily consumption
    this_wk["dow"] = pd.to_datetime(this_wk["date"]).dt.dayofweek
    daily_totals = this_wk.groupby(["date", "dow"])["consumption_kwh"].sum().reset_index()
    weekday_avg = float(daily_totals[daily_totals["dow"] < 5]["consumption_kwh"].mean() or 0)
    weekend_avg = float(daily_totals[daily_totals["dow"] >= 5]["consumption_kwh"].mean() or 0)

    # Daily totals for the week (for the small bar chart)
    daily_series = (
        this_wk.groupby("date")["consumption_kwh"].sum().reindex(
            [end - timedelta(days=i) for i in range(6, -1, -1)], fill_value=0
        )
    )

    # Month-to-date projection
    month_start = date(end.year, end.month, 1)
    mtd = df[(df["date"] >= month_start) & (df["date"] <= end)]
    mtd_total = float(mtd["consumption_kwh"].sum())
    days_elapsed = (end - month_start).days + 1
    days_in_month = (date(end.year + (end.month // 12), (end.month % 12) + 1, 1) - month_start).days
    projected_month = (mtd_total / days_elapsed * days_in_month) if days_elapsed else 0

    return {
        "week_start": (end - timedelta(days=6)).isoformat(),
        "week_end": end.isoformat(),
        "total_kwh": total,
        "prior_kwh": prior,
        "delta_kwh": delta_kwh,
        "delta_pct": delta_pct,
        "cost": total * RATE_PER_KWH,
        "prior_cost": prior * RATE_PER_KWH,
        "hourly": [round(v, 3) for v in hourly.tolist()],
        "hourly_prev": [round(v, 3) for v in hourly_prev.tolist()],
        "baseline_kwh": baseline,
        "baseline_prev_kwh": baseline_prev,
        "peak": peak,
        "weekday_avg": weekday_avg,
        "weekend_avg": weekend_avg,
        "daily_labels": [d.strftime("%a %m/%d") for d in daily_series.index],
        "daily_values": [round(v, 2) for v in daily_series.tolist()],
        "mtd_kwh": mtd_total,
        "projected_month_kwh": projected_month,
        "projected_month_cost": projected_month * RATE_PER_KWH,
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "rate": RATE_PER_KWH,
    }


# --- observations (one actionable insight) ---------------------------------

def build_observation(m: dict) -> str:
    obs = []

    if m["delta_pct"] is not None:
        if m["delta_pct"] > 10:
            obs.append(
                f"Usage is up <b>{m['delta_pct']:.0f}%</b> from last week (+{m['delta_kwh']:.1f} kWh, "
                f"+${m['delta_kwh'] * m['rate']:.2f}). Something's driving higher demand — check the "
                f"hourly chart for a new peak."
            )
        elif m["delta_pct"] < -10:
            obs.append(
                f"Nice — usage is down <b>{-m['delta_pct']:.0f}%</b> vs last week "
                f"(-{-m['delta_kwh']:.1f} kWh, saved ${-m['delta_kwh'] * m['rate']:.2f}). Keep it up."
            )

    if m["baseline_prev_kwh"] > 0:
        b_delta = m["baseline_kwh"] - m["baseline_prev_kwh"]
        b_pct = b_delta / m["baseline_prev_kwh"] * 100
        if b_pct > 15:
            obs.append(
                f"Overnight baseline jumped <b>{b_pct:.0f}%</b> "
                f"({m['baseline_prev_kwh']:.2f} → {m['baseline_kwh']:.2f} kWh/hr). Something new is "
                f"running 24/7 — check for a device left on, or a new appliance."
            )

    if m["peak"]:
        avg_hour = m["total_kwh"] / (7 * 24)
        if m["peak"]["kwh"] > avg_hour * 3:
            obs.append(
                f"Biggest single hour was <b>{m['peak']['hour']:02d}:00 on {m['peak']['date']}</b> "
                f"at {m['peak']['kwh']:.1f} kWh — {m['peak']['kwh']/avg_hour:.1f}× your hourly average. "
                f"If it's a recurring evening peak, try pre-cooling your place to 72° at 4pm so AC "
                f"coasts through the 6–9pm hours."
            )

    if m["weekend_avg"] > m["weekday_avg"] * 1.25 and m["weekday_avg"] > 0:
        obs.append(
            f"Weekend days averaged <b>{m['weekend_avg']:.1f} kWh</b> vs "
            f"<b>{m['weekday_avg']:.1f}</b> on weekdays — {m['weekend_avg']/m['weekday_avg']:.1f}× higher. "
            f"Being home more shows up in the bill; consider raising the AC when you're actively cooking "
            f"or have windows open."
        )

    if not obs:
        obs.append(
            f"Steady week. Total: <b>{m['total_kwh']:.1f} kWh</b> "
            f"(~${m['cost']:.2f}). Baseline: {m['baseline_kwh']:.2f} kWh/hr overnight."
        )

    return obs[0]  # one recommendation, not five


# --- HTML rendering --------------------------------------------------------

HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Weekly Energy Report — __WEEK__</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root { --bg:#0f1115; --card:#171a21; --ink:#e8e8ea; --muted:#8a8f9a;
          --good:#4ade80; --bad:#f87171; --accent:#60a5fa; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font: 15px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 32px 24px 80px; }
  h1 { font-size: 28px; margin: 0 0 4px; font-weight: 600; }
  .sub { color: var(--muted); margin-bottom: 28px; }
  .grid { display: grid; gap: 16px; }
  .grid.cards { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .card { background: var(--card); border-radius: 12px; padding: 18px 20px; }
  .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
  .big { font-size: 32px; font-weight: 600; margin-top: 4px; }
  .delta { font-size: 14px; margin-top: 6px; }
  .up { color: var(--bad); } .down { color: var(--good); } .flat { color: var(--muted); }
  .chart-wrap { position: relative; height: 280px; }
  .obs { background: linear-gradient(135deg, #1e293b, #172033); border-left: 3px solid var(--accent);
         padding: 16px 20px; border-radius: 8px; margin-top: 8px; }
  .obs .label { color: var(--accent); }
  .obs .msg { margin-top: 6px; font-size: 15px; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .row2 { grid-template-columns: 1fr; } .big { font-size: 26px; } }
  .footer { color: var(--muted); font-size: 12px; margin-top: 40px; text-align: center; }
  b { color: var(--ink); font-weight: 600; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Weekly Energy Report</h1>
    <div class="sub">__WEEK__ &nbsp;·&nbsp; rate: $__RATE__/kWh</div>

    <div class="grid cards">
      <div class="card">
        <div class="label">This week — total</div>
        <div class="big">__TOTAL__ kWh</div>
        <div class="delta __DELTA_CLASS__">__DELTA_TEXT__</div>
      </div>
      <div class="card">
        <div class="label">This week — cost</div>
        <div class="big">$__COST__</div>
        <div class="delta __DELTA_CLASS__">__COST_DELTA_TEXT__</div>
      </div>
      <div class="card">
        <div class="label">Overnight baseline</div>
        <div class="big">__BASELINE__ <span style="font-size:15px;color:var(--muted)">kWh/hr</span></div>
        <div class="delta __BASELINE_CLASS__">__BASELINE_DELTA__</div>
      </div>
      <div class="card">
        <div class="label">On pace for this month</div>
        <div class="big">$__PROJ_COST__</div>
        <div class="delta flat">__PROJ_KWH__ kWh · day __DAYS_ELAPSED__ of __DAYS_IN_MONTH__</div>
      </div>
    </div>

    <div class="obs" style="margin-top:20px">
      <div class="label">This week's takeaway</div>
      <div class="msg">__OBSERVATION__</div>
    </div>

    <div class="row2" style="margin-top:24px">
      <div class="card">
        <div class="label">Daily totals (kWh)</div>
        <div class="chart-wrap"><canvas id="dailyChart"></canvas></div>
      </div>
      <div class="card">
        <div class="label">Avg kWh by hour of day (this week vs last)</div>
        <div class="chart-wrap"><canvas id="hourChart"></canvas></div>
      </div>
    </div>

    <div class="footer">Generated __GENERATED__ from __N_FILES__ daily files</div>
  </div>

<script>
  const DATA = __DATA_JSON__;

  Chart.defaults.color = '#8a8f9a';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

  new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: {
      labels: DATA.daily_labels,
      datasets: [{ data: DATA.daily_values, backgroundColor: '#60a5fa', borderRadius: 4 }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const hours = Array.from({length: 24}, (_, i) => (i < 10 ? '0'+i : ''+i));
  new Chart(document.getElementById('hourChart'), {
    type: 'bar',
    data: {
      labels: hours,
      datasets: [
        { label: 'This week', data: DATA.hourly, backgroundColor: '#60a5fa', borderRadius: 3 },
        { label: 'Last week', data: DATA.hourly_prev, backgroundColor: 'rgba(138,143,154,0.5)', borderRadius: 3 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
      scales: { y: { beginAtZero: true } }
    }
  });
</script>
</body>
</html>
"""


def render_html(m: dict, n_files: int) -> str:
    def delta_class(delta):
        if delta is None or abs(delta) < 0.01:
            return "flat"
        return "up" if delta > 0 else "down"

    def delta_text(delta, pct, unit=""):
        if delta is None:
            return "no prior week to compare"
        arrow = "▲" if delta > 0 else "▼" if delta < 0 else "◆"
        pct_txt = f" ({pct:+.1f}%)" if pct is not None else ""
        return f"{arrow} {delta:+.1f}{unit}{pct_txt} vs last week"

    baseline_delta = m["baseline_kwh"] - m["baseline_prev_kwh"] if m["baseline_prev_kwh"] else None
    baseline_pct = (baseline_delta / m["baseline_prev_kwh"] * 100) if baseline_delta is not None and m["baseline_prev_kwh"] else None

    cost_delta = (m["total_kwh"] - m["prior_kwh"]) * m["rate"] if m["prior_kwh"] else None
    cost_pct = m["delta_pct"]

    subs = {
        "__WEEK__": f"{m['week_start']} → {m['week_end']}",
        "__RATE__": f"{m['rate']:.3f}",
        "__TOTAL__": f"{m['total_kwh']:.1f}",
        "__COST__": f"{m['cost']:.2f}",
        "__DELTA_CLASS__": delta_class(m["delta_kwh"]),
        "__DELTA_TEXT__": delta_text(m["delta_kwh"], cost_pct, " kWh"),
        "__COST_DELTA_TEXT__": delta_text(cost_delta, cost_pct, ""),
        "__BASELINE__": f"{m['baseline_kwh']:.2f}",
        "__BASELINE_CLASS__": delta_class(baseline_delta),
        "__BASELINE_DELTA__": delta_text(baseline_delta, baseline_pct, " kWh/hr"),
        "__PROJ_COST__": f"{m['projected_month_cost']:.0f}",
        "__PROJ_KWH__": f"{m['projected_month_kwh']:.0f}",
        "__DAYS_ELAPSED__": str(m["days_elapsed"]),
        "__DAYS_IN_MONTH__": str(m["days_in_month"]),
        "__OBSERVATION__": build_observation(m),
        "__GENERATED__": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "__N_FILES__": str(n_files),
        "__DATA_JSON__": json.dumps(m),
    }

    out = HTML_TEMPLATE
    for k, v in subs.items():
        out = out.replace(k, v)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--end", help="Anchor end-of-week to this date (YYYY-MM-DD). Default: latest data.")
    args = ap.parse_args()

    df = load_all()
    n_files = df["date"].nunique()

    if args.end:
        end = datetime.strptime(args.end, "%Y-%m-%d").date()
    else:
        end = df["date"].max()

    metrics = compute_metrics(df, end)
    html = render_html(metrics, n_files)
    REPORT_PATH.write_text(html, encoding="utf-8")

    print(f"Week {metrics['week_start']} → {metrics['week_end']}")
    print(f"  {metrics['total_kwh']:6.1f} kWh   ${metrics['cost']:6.2f}", end="")
    if metrics["delta_pct"] is not None:
        print(f"   ({metrics['delta_pct']:+.1f}% vs last week)")
    else:
        print()
    print(f"  Baseline: {metrics['baseline_kwh']:.2f} kWh/hr overnight")
    if metrics["peak"]:
        print(f"  Peak:     {metrics['peak']['hour']:02d}:00 on {metrics['peak']['date']} = {metrics['peak']['kwh']:.1f} kWh")
    print(f"\nReport: {REPORT_PATH}")
    print(f"Open with: open '{REPORT_PATH}'   (macOS)")


if __name__ == "__main__":
    main()
