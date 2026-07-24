from datetime import datetime, date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

import usage as usage_mod
from auth import login, get_credentials, OUTPUT_DIR, BASE_URL

def download_usage_days(headless: bool, output_dir: Path, debug=False) -> None:
    """
    Download usage data for yesterday and the day before, in a single
    browser session (one login covers both days).

    Args:
        headless (bool): Whether to run the browser in headless mode.
        output_dir (Path): The directory to save downloaded CSV files into.
    """
    email, password, account_number = get_credentials()
    usage_url = f"{BASE_URL}/usage/{account_number}"

    output_dir = Path(output_dir)
    # output_dir = Path("scraper/debug_output")
    output_dir.mkdir(parents=True, exist_ok=True)

    target_dates = [
        date.today() - timedelta(days=1),  # yesterday
        date.today() - timedelta(days=2)   # day before
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(accept_downloads=True)
        context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE_URL)
        page = context.new_page()

        login(page, email, password)
        print(f"Navigating to usage page: {usage_url}")
        page.goto(usage_url, wait_until="domcontentloaded")
        page.wait_for_selector("iti-usage-page", state="visible", timeout=30_000)
        usage_mod.dismiss_alert_modal(page)
        usage_mod.select_graph_type(page, "day")

        for target_date in target_dates:
            print(f"\nSwitching to Day view for {target_date.isoformat()}...")
            usage_mod.open_date_picker(page)
            usage_mod.set_date(page, target_date)

            print("Refreshing data...")
            usage_mod.click_refresh(page)

            if usage_mod.has_no_data(page):
                print("No data. Refreshing again...")
                usage_mod.click_refresh(page)
                if usage_mod.has_no_data(page):
                    if debug:
                        page.screenshot(path=str(output_dir / f"debug_{target_date.isoformat()}.png"))
                        (output_dir / f"debug_{target_date.isoformat()}.html").write_text(page.content())
                    print(f"No data for {target_date.isoformat()}. Skipping export.")
                    continue

            daily_file = output_dir / f"usage_day_{target_date.isoformat()}.csv"
            print(f"Exporting daily data to {daily_file}...")
            usage_mod.export_excel(page, daily_file)

        context.close()
        browser.close()
    print(f"\nDone. Files saved in: {output_dir}")


def download_usage_day(target_date: date, headless: bool, output_dir: Path) -> None:
    """
    Download usage data for a specific day.

    Args:
        target_date (date): The date for which to download usage data.
        headless (bool): Whether to run the browser in headless mode.
        output_dir (Path): The directory to save downloaded Excel files into.
    """
    if isinstance(target_date, str):
        target_date = date.fromisoformat(target_date)

    email, password, account_number = get_credentials()
    usage_url = f"{BASE_URL}/usage/{account_number}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        login(page, email, password)
        print(f"Navigating to usage page: {usage_url}")
        page.goto(usage_url, wait_until="domcontentloaded")
        page.wait_for_selector("iti-usage-page", state="visible", timeout=30_000)
        usage_mod.dismiss_alert_modal(page)
        
        usage_mod.select_graph_type(page, "day")
        today = date.today()
        if target_date > today:
            print(f"\nSkipping {target_date.isoformat()} (future date, no data yet).")

        usage_mod.open_date_picker(page)
        usage_mod.set_date(page, target_date)

        print("Refreshing data...")
        usage_mod.click_refresh(page)

        if usage_mod.has_no_data(page):
            print(f"No data for {target_date.isoformat()} — skipping export.")

        daily_file = output_dir / f"usage_day_{target_date.isoformat()}.csv"
        print(f"Exporting daily data to {daily_file}...")
        usage_mod.export_excel(page, daily_file)
    
        context.close()
        browser.close()
    
    print(f"Usage data for {target_date.isoformat()} downloaded successfully to {daily_file}.")

def download_usage_week_days(target_date: date, headless: bool, output_dir: Path) -> None:
    if isinstance(target_date, str):
        target_date = date.fromisoformat(target_date)

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    email, password, account_number = get_credentials()
    usage_url = f"{BASE_URL}/usage/{account_number}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        login(page, email, password)

        print(f"Navigating to usage page: {usage_url}")
        page.goto(usage_url, wait_until="domcontentloaded")
        page.wait_for_selector("iti-usage-page", state="visible", timeout=30_000)
        usage_mod.dismiss_alert_modal(page)

        # --- Weekly export -------------------------------------------------
        print("Switching to Week view...")
        usage_mod.select_graph_type(page, "week")

        print(f"Setting date to {target_date.isoformat()}...")
        usage_mod.open_date_picker(page)
        usage_mod.set_date(page, target_date)

        print("Refreshing data...")
        usage_mod.click_refresh(page)

        header_text = usage_mod.get_date_range_text(page)
        week_start, week_end = usage_mod.parse_week_range(header_text)
        print(f"Week range shown on page: {week_start} - {week_end}")

        weekly_file = out_dir / "weekly" / f"usage_week_{week_start.isoformat()}_{week_end.isoformat()}.csv"
        print(f"Exporting weekly data to {weekly_file}...")
        usage_mod.export_excel(page, weekly_file)

        # --- Daily exports for each day in that week ------------------------
        usage_mod.select_graph_type(page, "day")
        today = date.today()
        for day in usage_mod.daterange(week_start, week_end):
            # Case 1: current week — skip days that haven't happened yet
            if day > today:
                print(f"\nSkipping {day.isoformat()} (future date, no data yet).")
                continue

            print(f"\nSwitching to Day view for {day.isoformat()}...")
            usage_mod.open_date_picker(page)
            usage_mod.set_date(page, day)

            print("Refreshing data...")
            usage_mod.click_refresh(page)
            
            # Case 2: past day with no reading on file
            if usage_mod.has_no_data(page):
                print(f"No data for {day.isoformat()} — skipping export.")
                continue

            daily_file = out_dir / "daily" / f"usage_day_{day.isoformat()}.csv"
            print(f"Exporting daily data to {daily_file}...")
            usage_mod.export_excel(page, daily_file)

        context.close()
        browser.close()

    print(f"\nDone. Files saved in: {out_dir}")