"""
Talgov Self-Service login + navigation automation using Playwright.

Credentials are never hardcoded — they're read from environment variables
via a local .env file (see .env.example). Do not commit your real .env file.
"""

import os
import sys
from pathlib import Path

from data_manipulation import build_all_day_data, load_one_day, export_excel
from download_data import download_usage_day, download_usage_week_days, download_usage_days

# ==========================
# Download usage data for a specific day or week
# ==========================
output_download_dir_daily = Path(__file__).parent / "data" /"daily"
output_download_dir_weekly = Path(__file__).parent / "data" /"weekly"

date_download = "2026-07-22"  # Specify the date for which you want to download usage data
# download_usage_day(target_date=date_download, headless=False, output_dir=output_download_dir_daily)
# download_usage_week_days(target_date=date_download, headless=False, output_dir=output_download_dir_weekly)

download_usage_days(headless=True, output_dir=Path(__file__).parent / "data"/"test")
# ==========================
# Merge all downloaded CSVs into a single Excel file
# ==========================
# df = build_all_day_data(output_download_dir_daily)
# output_excel_path = Path(__file__).parent / "output" / "merged_usage_data.xlsx"
# export_excel(df, output_excel_path)