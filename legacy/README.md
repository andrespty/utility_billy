# Legacy analysis scripts

Early local-analysis tools, kept for reference. All of this has been
superseded by the [app](../app)'s Dashboard and Billing tabs, which do the
same job (usage charts, cost estimates) persistently and per-cycle instead
of as one-off local runs.

- `day_usage.py` / `week_usage.py` — quick matplotlib bar charts from a
  single exported CSV.
- `energy_analyzer.py` — merges every CSV dropped in `data/` into a single
  `output/master.csv` and generates plots.
- `weekly_report.py` — builds a self-contained HTML weekly report (this
  week vs. last week) from daily CSVs in `data/daily/`.
- `daily_energy_analysis.ipynb` — notebook version of similar analysis.

Install `pip install -r requirements.txt` in this directory if you want to
run any of these again.
