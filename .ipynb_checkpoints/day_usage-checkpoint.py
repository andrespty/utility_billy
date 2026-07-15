"""Plot a daily usage CSV (exported from the Talgov Usage page) as a bar chart."""

import sys
import pandas as pd
import matplotlib.pyplot as plt


def plot_day(csv_path: str, output_path: str = "day_usage.png") -> None:
    df = pd.read_csv(csv_path)
    df.columns = [c.strip() for c in df.columns]
    df["Time period"] = df["Time period"].str.strip()
    # Use the start of each hourly block (e.g. "12:00 AM") as the x-axis label
    df["Hour"] = df["Time period"].str.split("-").str[0]

    unit = df["Consumption unit"].iloc[0]

    plt.figure(figsize=(12, 5))
    plt.bar(df["Hour"], df["Consumption"], color="#017DB7")
    plt.ylabel(f"Consumption ({unit})")
    plt.title("Hourly usage for the day")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.savefig(output_path)
    print(f"Saved plot to {output_path}")


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else "usage_day.csv"
    plot_day(csv_path)