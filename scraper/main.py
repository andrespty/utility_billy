"""
Talgov Self-Service login + navigation automation using Playwright.

Credentials are never hardcoded — they're read from environment variables
via a local .env file (see .env.example). Do not commit your real .env file.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import (
    sync_playwright,
    Page,
    TimeoutError as PlaywrightTimeoutError,
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LOGIN_URL = (
    "https://cotb2cprod.b2clogin.com/cotb2cprod.onmicrosoft.com/"
    "b2c_1a_cotprod_signup_signin_mfa/oauth2/v2.0/authorize"
    "?domain_hint=local"
    "&client_id=2cb9210b-75f1-4e92-b567-c177906046a3"
    "&redirect_uri=https%3A%2F%2Fselfservice.talgov.com%2Fsignin-oidc"
    "&response_type=code%20id_token"
    "&scope=openid%20profile%20offline_access%20"
    "https%3A%2F%2Ffabrikamb2c.onmicrosoft.com%2Fdemoapi%2Fdemo.read"
    "&response_mode=form_post"
    "&nonce=639196349169707752.OGRmMzE0ZWItZTgzNy00ZDU2LTlkNzctOTEzMDllMzlkN2Q4MGM0NmZkODYtZmMyZS00MjEyLWEwYzAtMjYzYjcyZDA5ZmE4"
    "&state=CfDJ8M0xKpA2QQxHo3Tqrr2v3GXvPGP49moULnUQP9OAJWwTqSdLUt-h7J7VWuRKLHLtkqCOxdwtmirEH0Jb1MToynqN98PK6FeCpc5Mn9CgG50BtpcAzydnU5YiUOAZHoiGm2Y4vXbdBANTBMXXH74QX3wLRDi5Dbdz1GTu_SMHCbEYsN1OzvKAdGMG7NmxElDMXciEBW_SH6pkDVNB8QGQfz7Vu2JONR0TC_h24c2pKkihVOUO0UyIdGKv5vHCPgzrY6qb_1VHUgGfdyL8MQsm98ncODaSTEAwndLajUJ4m2DZzSrG58wxOKJu6MB3PNwVCiDbJ5rbRivUcA104Y1lb9s"
    "&x-client-SKU=ID_NET8_0"
    "&x-client-ver=8.7.0.0"
)
BASE_URL = "https://selfservice.talgov.com"
HOME_URL = f"{BASE_URL}/home"
OUTPUT_DIR = Path(__file__).parent / "output"

# Max time to wait for various steps (milliseconds)
NAV_TIMEOUT_MS = 30_000
LOGIN_REDIRECT_TIMEOUT_MS = 60_000  # generous, in case of MFA prompts


def get_credentials() -> tuple[str, str, str]:
    """Load TALGOV_EMAIL / TALGOV_PASSWORD from a local .env file."""
    load_dotenv()  # loads .env from current working directory by default
    email = os.getenv("TALGOV_EMAIL")
    password = os.getenv("TALGOV_PASSWORD")
    account_number = os.getenv("ACCOUNT_NUMBER")

    if not email or not password or not account_number:
        sys.exit(
            "Missing credentials. Create a .env file (see .env.example) "
            "with TALGOV_EMAIL, TALGOV_PASSWORD, and ACCOUNT_NUMBER set."
        )
    return email, password, account_number


def login(
    page: Page,
    email: str,
    password: str,
    home_url: str = HOME_URL,
    login_url: str = LOGIN_URL,
    redirect_timeout_ms: int = LOGIN_REDIRECT_TIMEOUT_MS,
    debug_dir: Path = OUTPUT_DIR,
) -> None:
    """Navigate to the Talgov login page and sign in.

    Reusable by other scripts (e.g. download_usage.py) so the login flow
    only lives in one place. Exits the process (via sys.exit) if the
    post-login redirect doesn't happen in time, after saving a debug
    screenshot/HTML snapshot.
    """
    print("Navigating to login page...")
    page.goto(login_url, wait_until="load")

    # The login form is injected into #api via a client-side script
    # (see the Handlebars template in the page source), so wait for
    # the actual input fields rather than just DOM load.
    print("Waiting for login form...")
    page.wait_for_selector("#signInName", state="visible")
    page.wait_for_selector("#password", state="visible")

    print("Filling in credentials...")
    page.fill("#signInName", email)
    page.fill("#password", password)

    print("Submitting login form...")
    page.click("#next")

    # This form POSTs and redirects through the OIDC flow back to
    # selfservice.talgov.com/signin-oidc and then to /home.
    try:
        page.wait_for_url(f"{home_url}*", timeout=redirect_timeout_ms)
    except PlaywrightTimeoutError:
        # Login may have failed (bad credentials, MFA challenge, etc.)
        # Save what we have so it's easy to diagnose.
        debug_dir.mkdir(exist_ok=True)
        error_path = debug_dir / "login_error.png"
        page.screenshot(path=str(error_path))
        (debug_dir / "login_error.html").write_text(page.content())
        sys.exit(
            f"Did not reach {home_url} within the timeout. "
            f"Saved a screenshot/HTML to {debug_dir} for debugging "
            f"(check for an MFA prompt or invalid-credentials message)."
        )

    print(f"Logged in. Current URL: {page.url}")