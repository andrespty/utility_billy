"""
Helpers for interacting with the Talgov "Usage" page: switching the graph
view (Day/Week/Month/Year/Between dates), setting the date via the Kendo
date picker, refreshing data, and exporting the displayed data to Excel.

These are used by download_usage.py but are kept in their own module so
they're easy to reuse or test independently.
"""

import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Tuple
import sys

from playwright.sync_api import Page

# The graph-type icon buttons are identified by their `title` attribute in
# the page markup, e.g.:
#   <button title="Daily usage for Week" ...>
GRAPH_TYPE_TITLES = {
    "day": "Hourly usage for Day",
    "week": "Daily usage for Week",
    "month": "Daily usage for Month",
    "year": "Monthly usage for Year",
    "range": "Usage between two dates",
}

_WEEK_RANGE_RE = re.compile(
    r"([A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s*-\s*([A-Za-z]{3}\s+\d{1,2},\s*\d{4})"
)
_SINGLE_DATE_RE = re.compile(r"([A-Za-z]{3}\s+\d{1,2},\s*\d{4})")


def dismiss_alert_modal(page: Page, timeout: int = 3000) -> bool:
    """Dismiss the informational modal (e.g. 'Review Your Meter Reads') if present.

    This modal can pop up on page load, after switching views, or after a
    refresh. It's harmless to call this when no modal is showing — it just
    waits briefly, finds nothing, and returns False.

    Returns True if a modal was found and dismissed, False otherwise.
    """
    try:
        close_button = page.locator('button.close-button[data-bs-dismiss="modal"]')
        close_button.first.wait_for(state="visible", timeout=timeout)
        close_button.first.click()
        page.wait_for_timeout(300)
        return True
    except Exception:
        return False


def select_graph_type(page: Page, key: str) -> None:
    """Click one of the graph-type icon buttons.

    key: one of "day", "week", "month", "year", "range".
    """
    if key not in GRAPH_TYPE_TITLES:
        raise ValueError(f"Unknown graph type {key!r}; expected one of {list(GRAPH_TYPE_TITLES)}")
    title = GRAPH_TYPE_TITLES[key]
    page.click(f'button[title="{title}"]')
    # Let the header/graph re-render after switching views.
    page.wait_for_timeout(500)


def open_date_picker(page: Page) -> None:
    """Click the date-range header button to reveal the date input/calendar."""
    page.click("button.iti-info-card-header-interactive")
    page.wait_for_timeout(300)


def set_date(page: Page, target_date: date) -> None:
    """Type a new date into the Kendo date input and commit it.

    Assumes open_date_picker() was already called so the input is visible.
    """
    date_str = target_date.strftime("%b %d, %Y")
    selector_candidates = [
        'input.k-input-inner[role="combobox"][aria-haspopup="grid"]',
    ]
    date_input = None
    for sel in selector_candidates:
        locator = page.locator(sel)
        try:
            locator.first.wait_for(state="visible", timeout=3000)
            date_input = locator.first
            break
        except Exception:
            continue

    if date_input is None:
        raise RuntimeError(
            "Could not find the date picker input on the page "
            "(tried: " + ", ".join(selector_candidates) + ")"
        )

    date_input.click(click_count=3)  # triple-click to select all text
    # date_input.fill(date_str)
    # date_input.press("Enter")
    page.evaluate("(text) => navigator.clipboard.writeText(text)", date_str)
    modifier = "Meta" if sys.platform == "darwin" else "Control"
    page.keyboard.press(f"{modifier}+V")
    print(date_str)
    # Close any lingering calendar popup so it doesn't intercept the next click.
    page.wait_for_timeout(300)


def click_refresh(page: Page) -> None:
    """Click the 'Refresh data' button and wait for the reload to settle."""
    page.click('button:has-text("Refresh data")')
    try:
        page.wait_for_load_state("networkidle", timeout=10_000)
    except Exception:
        # Some background connections (analytics, chat widget, etc.) can
        # keep the page from ever going fully network-idle. Fall back to a
        # fixed pause so we don't crash the whole run over this.
        page.wait_for_timeout(1500)


def get_date_range_text(page: Page) -> str:
    """Read the text currently shown in the date-range header button."""
    return page.locator("button.iti-info-card-header-interactive span").first.inner_text()


def export_excel(page: Page, save_path: Path) -> Path:
    """Click 'Export displayed data to Excel' and save the resulting download."""
    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)
    with page.expect_download() as download_info:
        page.click('button:has-text("Export displayed data to Excel")')
    download = download_info.value
    download.save_as(str(save_path))
    return save_path


def parse_week_range(text: str) -> Tuple[date, date]:
    """Parse a header string like 'Jul 12, 2026 - Jul 18, 2026' into two dates.

    Falls back to treating a single date (no range) as a one-day span.
    """
    match = _WEEK_RANGE_RE.search(text)
    if match:
        start = datetime.strptime(match.group(1), "%b %d, %Y").date()
        end = datetime.strptime(match.group(2), "%b %d, %Y").date()
        return start, end

    single = _SINGLE_DATE_RE.search(text)
    if single:
        d = datetime.strptime(single.group(1), "%b %d, %Y").date()
        return d, d

    raise ValueError(f"Could not parse a date range from header text: {text!r}")


def daterange(start: date, end: date):
    """Yield each date from start to end, inclusive."""
    days = (end - start).days
    for i in range(days + 1):
        yield start + timedelta(days=i)


def has_no_data(page) -> bool:
    """True when the chart is currently showing 'no data'."""
    try:
        return page.locator(".iti-items-nodata, :text('no graph data')").first.is_visible()
    except Exception:
        return False