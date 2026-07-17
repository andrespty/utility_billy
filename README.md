# Utility Billy

A personal home-electricity tracker built around the City of Tallahassee's
utility portal (Talgov), which has no public API — so usage data has to be
scraped and then fed into a dashboard by hand.

## Layout

- **[`scraper/`](scraper)** — Python + Playwright automation you run manually
  to log into Talgov and export usage data (weekly/daily `.xlsx` files).
- **[`app/`](app)** — the React + Supabase web app you upload those exports
  to. Shows a Dashboard (daily/hourly usage charts), an Upload calendar, rate
  Settings, and Billing (cost estimates vs. actual bills). This is the
  actively used piece.
- **[`legacy/`](legacy)** — earlier local-analysis scripts and a notebook,
  superseded by `app/`'s Dashboard and Billing tabs. Kept for reference only.

## Typical workflow

1. Run the scraper (`scraper/`) to export the latest usage data from Talgov.
2. Upload the exported file(s) through the app's Upload tab.
3. Check the Dashboard and Billing tabs for updated usage and cost estimates.

See each directory's own README for setup and usage details.
