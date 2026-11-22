#!/usr/bin/env python3
"""analyse_z.py - bucket SID trades by stretch-at-entry; WR, mean, median.
Usage: python3 analyse_z.py <trades_with_z.csv>"""
import sys
import numpy as np, pandas as pd

df = pd.read_csv(sys.argv[1])
BINS = {
    "z20_depth":   [-9, 0, 1, 1.5, 2, 2.5, 9],
    "z50_depth":   [-9, 0, 1, 1.5, 2, 2.5, 9],
    "z80_depth":   [-9, 0, 1, 1.5, 2, 2.5, 9],
    "atr50_depth": [-99, 0, 1, 2, 3, 4, 99],
    "zret_depth":  [-99, -1, 0, 1, 2, 99],
}

def summ(g):
    return pd.Series({"n": len(g), "WR%": 100 * g["win"].mean(),
                      "mean%": g["return_pct"].mean(), "median%": g["return_pct"].median()})

for d in ("long", "short"):
    s = df[(df["direction"] == d) & df["z50"].notna()]
    print(f"\n######## {d.upper()}  n={len(s)}  base WR {100*s['win'].mean():.1f}%  "
          f"mean {s['return_pct'].mean():.2f}%  median {s['return_pct'].median():.2f}%")
    for k, b in BINS.items():
        out = s.groupby(pd.cut(s[k], b)).apply(summ)
        out = out[out["n"] > 0]
        spread = out.loc[out["n"] >= 30, "WR%"]
        print(f"\n-- {k}  (WR swing, buckets n>=30: {spread.max()-spread.min():.1f}pp)")
        print(out.round(2).to_string())
    print("\nSpearman vs return:",
          {k: round(s[k].rank().corr(s["return_pct"].rank()), 3) for k in BINS})
    print("Corr with gap_atr:",
          {k: round(s[k].rank().corr(s["gap_atr"].rank()), 3) for k in BINS})
