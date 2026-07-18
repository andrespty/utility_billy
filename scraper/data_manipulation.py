from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

def load_one_week(path: Path) -> pd.DataFrame:
    """Read one vendor CSV into a tidy frame: date, consumption_kwh, source_file, source_mtime."""
    df = pd.read_csv(path, encoding="utf-8-sig")
    df.columns = [c.strip() for c in df.columns]

    # Vendor puts a leading space in the date field ("  Jul 1 2026")
    df["date"] = pd.to_datetime(df["Time period"].str.strip(), format="%b %d %Y")
    df["consumption_kwh"] = pd.to_numeric(df["Consumption"], errors="coerce")
    df["source_file"] = path.name
    df["source_mtime"] = path.stat().st_mtime

    return df[["date", "consumption_kwh", "source_file", "source_mtime"]]

def load_one_day(path: Path) -> pd.DataFrame:
    """Read one day's usage CSV into a tidy frame: date, time, consumption, unit."""
    path_obj = Path(path)
    df = pd.read_csv(path_obj)

    # Filename looks like "usage_day_2026-06-25.csv" -> date is the last chunk after "_"
    date = path_obj.stem.split("_")[-1]

    df["date"] = date
    df["mtime"] = pd.to_datetime(
        df["Time period"].str.split("-").str[0], format="%I:%M %p"
    ).dt.time
    df["time"] = pd.to_datetime(
        df["Time period"].str.split("-").str[0], format="%I:%M %p"
    ).dt.strftime("%I:%M %p")
    df["consumption"] = pd.to_numeric(df["Consumption"], errors="coerce")
    df["unit"] = df["Consumption unit"]
    df["source_file"] = path_obj.name
    df["source_mtime"] = path_obj.stat().st_mtime

    return df[["date", "time","mtime", "consumption", "unit", "source_file", "source_mtime"]]

def build_all_day_data(data_dir) -> pd.DataFrame:
    """Merge every CSV in data/ into a single deduped frame keyed by date+time."""
    data_dir = Path(data_dir)
    files = sorted(data_dir.glob("*.csv"))
    if not files:
        print(f"No CSVs found in {data_dir}. Drop your daily exports there and rerun.")

    frames = []
    for f in files:
        try:
            frames.append(load_one_day(f))
        except Exception as e:
            print(f"  ! skipping {f.name}: {e}")

    if not frames:
        print("No valid data loaded.")
        return pd.DataFrame(columns=["date", "time", "mtime", "consumption", "unit", "source_file", "source_mtime"])

    combined = pd.concat(frames, ignore_index=True)

    # Newer file wins on duplicate date+time
    combined.sort_values(["date", "mtime", "source_mtime"], inplace=True)
    combined.drop_duplicates(subset=["date", "mtime"], keep="last", inplace=True)
    combined.sort_values(["date", "mtime"], inplace=True)
    combined.reset_index(drop=True, inplace=True)
    
    print(f"Master dataset: {len(combined)} rows")
    return combined


def export_excel(df: pd.DataFrame, output_path: Path) -> None:
    """Export a DataFrame to an Excel file with a single sheet."""
    df.to_excel(output_path, index=False)
    print(f"Saved Excel file to {output_path}")


# def rebuild_master() -> pd.DataFrame:
#     """Merge every CSV in data/ into a single deduped frame keyed by date."""
#     DATA_DIR.mkdir(exist_ok=True)
#     OUTPUT_DIR.mkdir(exist_ok=True)

#     files = sorted(DATA_DIR.glob("*.csv"))
#     if not files:
#         print(f"No CSVs found in {DATA_DIR}. Drop your monthly exports there and rerun.")

#     frames = []
#     for f in files:
#         try:
#             frames.append(load_one_week(f))
#         except Exception as e:
#             print(f"  ! skipping {f.name}: {e}")

#     combined = pd.concat(frames, ignore_index=True)

#     # Newer file wins on duplicate dates
#     combined.sort_values(["date", "source_mtime"], inplace=True)
#     combined.drop_duplicates(subset="date", keep="last", inplace=True)
#     combined.sort_values("date", inplace=True)
#     combined.reset_index(drop=True, inplace=True)

#     combined[["date", "consumption_kwh", "source_file"]].to_csv(MASTER_CSV, index=False)
#     print(f"Master dataset: {len(combined)} days -> {MASTER_CSV}")
#     return combined

def enrich(df: pd.DataFrame) -> pd.DataFrame:
    """Drop empty readings, tag weekday/weekend and month."""
    df = df[df["consumption_kwh"] > 0].copy()
    df["day_type"] = np.where(df["date"].dt.dayofweek >= 5, "Weekend", "Weekday")
    df["month"] = df["date"].dt.to_period("M").astype(str)
    return df