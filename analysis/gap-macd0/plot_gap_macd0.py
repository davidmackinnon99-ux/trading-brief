#!/usr/bin/env python3
"""
plot_gap_macd0.py — Render the gap-to-signal (MACD0) vs win-rate / avg-return
analysis as a chart, so the PNG is reproducible from source instead of being
a standalone image.

Reuses the exact bucketing logic from gap_macd0.py (same MACD0_IS_RAW
convention, same bucket edges) so the chart can never drift out of sync with
the numbers in REPORT.md.

USAGE: python3 plot_gap_macd0.py [path/to/trades_all.csv] [--out chart.png]
"""
import sys
import os
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gap_macd0 import (  # noqa: E402
    MACD0_IS_RAW, BUCKET_ORDER, LABELS, favourable_gap, bucket, summarise,
)


def load(path):
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    df["direction"] = df["direction"].str.lower()
    for col in ("return_pct", "win", "macd0_pct", "gap_atr"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def plot_variable(fig_axes, df, value_col, direction_aware, order, title_prefix):
    for ax, d in zip(fig_axes, ("short", "long")):
        sub = df[df.direction == d]
        rows = summarise(sub, value_col, direction_aware=direction_aware)
        labels = [r[0] for r in rows]
        n = [r[1] for r in rows]
        winrate = [r[2] if r[2] is not None else 0 for r in rows]
        avg_ret = [r[3] if r[3] is not None else 0 for r in rows]

        x = range(len(labels))
        bars = ax.bar(x, winrate, color="#4C72B0", label="win %")
        for xi, bar_n in zip(x, n):
            ax.text(xi, 2, f"n={bar_n}", ha="center", va="bottom",
                    fontsize=7, color="white" if bar_n else "black")

        ax2 = ax.twinx()
        ax2.plot(x, avg_ret, color="#DD8452", marker="o", linewidth=2,
                  label="avg return %")
        ax2.axhline(0, color="#DD8452", linewidth=0.6, linestyle="--")

        ax.set_xticks(list(x))
        ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=8)
        ax.set_ylim(0, 100)
        ax.set_ylabel("win %")
        ax2.set_ylabel("avg return %")
        ax.set_title(f"{title_prefix} — {d} (n={len(sub)})", fontsize=10)

        if d == "short":
            lines1, labs1 = ax.get_legend_handles_labels()
            lines2, labs2 = ax2.get_legend_handles_labels()
            ax.legend(lines1 + lines2, labs1 + labs2, fontsize=7, loc="upper left")


def main():
    path = "data/trades/trades_all.csv"
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gap_macd0_chart.png")
    args = sys.argv[1:]
    if args and not args[0].startswith("--"):
        path = args[0]
    if "--out" in args:
        out = args[args.index("--out") + 1]

    df = load(path)

    fig, axes = plt.subplots(2, 2, figsize=(11, 8))
    plot_variable(axes[0], df, "macd0_pct", True, BUCKET_ORDER, "MACD0 gap")
    plot_variable(axes[1], df, "gap_atr", False, LABELS, "Gap/ATR magnitude")

    fig.suptitle(
        f"Gap / MACD0 vs win rate — {len(df)} trades · MACD0_IS_RAW={MACD0_IS_RAW}",
        fontsize=12,
    )
    fig.tight_layout(rect=[0, 0, 1, 0.96])
    fig.savefig(out, dpi=150)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
