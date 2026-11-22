#!/usr/bin/env python3
"""
zscore_stretch.py - Does price stretch at entry predict SID outcomes?

For every trade in data/trades/trades_all.csv, compute at the entry bar:
  z20   = (close - SMA20) / SD20     (Bollinger-style Z)
  z50   = (close - SMA50) / SD50
  z80   = (close - SMA80) / SD80     (TradeDots script setting)
  atr50 = (close - SMA50) / ATR14    (ATR-normalised distance from SMA50)
  zret  = today's return / SD of last 20 daily returns

"depth" versions flip the sign for longs so that a larger value always means
"more stretched against the trade direction" (deeper oversold for longs,
more overbought for shorts).

Price data: yfinance daily, auto-adjusted. Features use the bar BEFORE
entry_date if the entry price matches that bar's open (no lookahead).
"""
import sys, warnings
import numpy as np, pandas as pd, yfinance as yf
warnings.filterwarnings("ignore")

TRADES = sys.argv[1] if len(sys.argv) > 1 else "data/trades/trades_all.csv"
OUT = sys.argv[2] if len(sys.argv) > 2 else "analysis/zscore-stretch/trades_with_z.csv"

t = pd.read_csv(TRADES, parse_dates=["entry_date", "exit_date"])
feats = []
for sym, g in t.groupby("symbol"):
    px = yf.download(sym, start="2004-01-01", auto_adjust=True, progress=False)
    if px.empty:
        print("no data", sym); continue
    if isinstance(px.columns, pd.MultiIndex):
        px.columns = px.columns.get_level_values(0)
    c, h, l = px["Close"], px["High"], px["Low"]
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/14, adjust=False).mean()
    f = pd.DataFrame(index=px.index)
    for n in (20, 50, 80):
        f[f"z{n}"] = (c - c.rolling(n).mean()) / c.rolling(n).std(ddof=0)
    f["atr50"] = (c - c.rolling(50).mean()) / atr
    r = c.pct_change()
    f["zret"] = r / r.rolling(20).std().shift()
    f["close"] = c
    for _, tr_ in g.iterrows():
        d = tr_["entry_date"]
        idx = f.index.searchsorted(d)
        if idx >= len(f) or idx == 0:
            continue
        row = f.iloc[idx]
        # entry at next open -> use prior bar's close for features
        if abs(px["Open"].iloc[idx] - tr_["entry_price"]) < abs(row["close"] - tr_["entry_price"]):
            row = f.iloc[idx - 1]
        feats.append({"trade_id": tr_["trade_id"], **row.drop("close").to_dict()})

df = t.merge(pd.DataFrame(feats), on="trade_id", how="left")
sgn = np.where(df["direction"] == "long", -1, 1)
for k in ("z20", "z50", "z80", "atr50", "zret"):
    df[f"{k}_depth"] = df[k] * sgn
df.to_csv(OUT, index=False)
print("rows", len(df), "matched", df["z50"].notna().sum())
