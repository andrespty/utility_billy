"""Plot a weekly usage CSV (exported from the Talgov Usage page) as a bar chart."""

import sys
import pandas as pd
import matplotlib.pyplot as plt


def plot_week(csv_path: str, output_path: str = "week_usage.png") -> None:
    df = pd.read_csv(csv_path)
    df.columns = [c.strip() for c in df.columns]
    df["Time period"] = df["Time period"].str.strip()
    df["Date"] = pd.to_datetime(df["Time period"], format="%b %d %Y")
    df = df.sort_values("Date")

    labels = df["Date"].dt.strftime("%b %d")
    values = df["Consumption"]
    unit = df["Consumption unit"].iloc[0]

    plt.figure(figsize=(10, 5))
    plt.bar(labels, values, color="#017DB7")
    plt.ylabel(f"Consumption ({unit})")
    plt.title("Daily usage for the week")
    plt.tight_layout()
    plt.savefig(output_path)
    print(f"Saved plot to {output_path}")


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else "usage_week.csv"
    plot_week(csv_path)