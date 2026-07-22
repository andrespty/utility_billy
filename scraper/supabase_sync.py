"""
Signs in to Supabase using the app's own auth (email/password — the same
account you log into the web app with), then upserts energy_readings rows.

Signing in as the real user (rather than using a service-role key) means
RLS (`user_id = auth.uid()`) and the `user_id` column default both work
exactly the same way here as they do for the browser's Upload page — no
special-cased privileged access, and no need to know/hardcode a user UUID.
"""

import os
import sys

from supabase import Client, create_client


def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    email = os.getenv("SUPABASE_EMAIL")
    password = os.getenv("SUPABASE_PASSWORD")

    if not url or not anon_key or not email or not password:
        sys.exit(
            "Missing Supabase credentials. Set SUPABASE_URL, SUPABASE_ANON_KEY, "
            "SUPABASE_EMAIL, and SUPABASE_PASSWORD (see .env.example)."
        )

    client = create_client(url, anon_key)
    client.auth.sign_in_with_password({"email": email, "password": password})
    return client


def upsert_readings(client: Client, rows: list[dict]) -> int:
    """Upsert reading rows into energy_readings, matching the app's own
    onConflict key. `user_id` is intentionally omitted from each row — the
    column's default (auth.uid()) fills it in from the signed-in session,
    same as the browser client does. Returns the number of rows sent."""
    if not rows:
        return 0

    client.table("energy_readings").upsert(
        rows, on_conflict="user_id,service,reading_date,hour_start"
    ).execute()
    return len(rows)
