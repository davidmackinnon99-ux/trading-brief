#!/usr/bin/env python3
"""compare.py - WR / mean / median by Gap/ATR bucket: true SID stop vs 10-bar proxy.
Usage: python3 compare.py <trades_gap_true.csv>"""
import sys
import pandas as pd

df = pd.read_csv(sys.argv[1], parse_dates=["entry_date"])
df = df[df["zone_found"] == 1]
B = [-99, 1.0, 1.5, 2.0, 3.0, 4.0, 99]

def tab(s, col):
    g = s.groupby(pd.cut(s[col], B))
    o = pd.DataFrame({"n": g.size(), "WR%": 100 * g["win"].mean(),
                      "mean%": g["return_pct"].mean(), "med%": g["return_pct"].median()})
    return o[o["n"] > 0].round(1)

for d in ("long", "short"):
    for era, s in (("ALL", df), ("2020+", df[df.entry_date.dt.year >= 2020])):
        s = s[s["direction"] == d]
        print(f"\n######## {d.upper()} {era}  n={len(s)}  base WR {100*s.win.mean():.1f}%")
        print("true vs proxy: median", round(s.gap_atr_true.median(), 2), "vs",
              round(s.gap_atr.median(), 2), "| rank corr",
              round(s.gap_atr_true.rank().corr(s.gap_atr.rank()), 2))
        for col in ("gap_atr_true", "gap_atr"):
            t = tab(s, col)
            sw = t.loc[t["n"] >= 30, "WR%"]
            print(f"-- {col}  (WR swing n>=30: {sw.max()-sw.min():.1f}pp)")
            print(t.to_string())
    s = df[df.direction == d]
    print(f"\n{d} episode length (bars): median {s.zone_bars.median()}, "
          f"<10 bars {100*(s.zone_bars<10).mean():.0f}%; exit->entry median {s.bars_exit_to_entry.median()}")
