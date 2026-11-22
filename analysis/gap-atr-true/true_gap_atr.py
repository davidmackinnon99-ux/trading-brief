#!/usr/bin/env python3
"""
true_gap_atr.py - Rebuild Gap/ATR with SID's actual stop rule and compare it
with the 10-bar-swing proxy stored in trades_all.csv (gap_atr).

SID stop rule (David, 22 Nov 2026 - unchanged since inception):
  Long : lowest low from the bar RSI(14) closes below 30 until the bar it
         closes back above 30, rounded DOWN to the whole number (13.6 -> 13.00).
  Short: highest high from the bar RSI closes above 70 until the bar it
         closes back below 70, rounded UP to the whole number (13.6 -> 14.00).
  Gap  = |entry close - stop| ; Gap/ATR = Gap / ATR14 (Wilder) at entry bar.
Uses the most recent OB/OS episode at or before the entry bar (max 40 bars back).

Prices: Yahoo daily, split-adjusted, not dividend-adjusted (closest to the
price levels actually traded; pre-split history is in post-split terms, so
whole-number rounding on old pre-split trades is approximate).
Usage: python3 true_gap_atr.py <trades_all.csv> <out.csv>
"""
import sys, math, warnings
import pandas as pd, yfinance as yf
warnings.filterwarnings("ignore")

def rsi(c, n=14):
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)

t = pd.read_csv(sys.argv[1], parse_dates=["entry_date"])
out = []
for sym, g in t.groupby("symbol"):
    p = yf.download(sym, start="2004-01-01", auto_adjust=False, progress=False)
    if p.empty:
        continue
    if isinstance(p.columns, pd.MultiIndex):
        p.columns = p.columns.get_level_values(0)
    c, h, l = p["Close"], p["High"], p["Low"]
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/14, adjust=False).mean()
    r = rsi(c).values
    for _, tr_ in g.iterrows():
        i = p.index.searchsorted(tr_["entry_date"])
        if i >= len(p) or i < 30:
            continue
        long = tr_["direction"] == "long"
        inzone = (r < 30) if long else (r > 70)
        last = i                                   # last in-zone bar <= entry
        while last > 0 and not inzone[last] and i - last <= 40:
            last -= 1
        if not inzone[last]:
            out.append({"trade_id": tr_["trade_id"], "zone_found": 0}); continue
        first = last                               # first bar of that episode
        while first > 0 and inzone[first - 1]:
            first -= 1
        exit_bar = min(last + 1, i)                # bar RSI closes back out
        lo = l.iloc[first:exit_bar + 1].min()
        hi = h.iloc[first:exit_bar + 1].max()
        stop = math.floor(lo) if long else math.ceil(hi)
        entry, a = c.iloc[i], atr.iloc[i]
        out.append({"trade_id": tr_["trade_id"], "zone_found": 1,
                    "zone_bars": last - first + 1, "bars_exit_to_entry": i - last,
                    "stop_true": stop, "entry_close_yf": entry,
                    "gap_atr_true": ((entry - stop) if long else (stop - entry)) / a,
                    "gap_atr_unrounded": ((entry - lo) if long else (hi - entry)) / a})

df = t.merge(pd.DataFrame(out), on="trade_id", how="left")
df.to_csv(sys.argv[2], index=False)
print("rows", len(df), "zone found", int(df["zone_found"].fillna(0).sum()))
