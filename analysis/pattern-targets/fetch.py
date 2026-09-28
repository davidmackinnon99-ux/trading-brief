"""Fetch daily OHLC (split-adjusted, not dividend-adjusted — matches TradingView's default chart)
for every symbol in data/trades/trades_all.csv. Run on the Mac mini (Yahoo is blocked from the cloud).
Cache lives OUTSIDE the repo so the daily autocommit never picks it up."""
import warnings; warnings.filterwarnings("ignore")
import os, sys, time, pandas as pd, yfinance as yf

TRADES = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/tradingview-mcp-jackson/data/trades/trades_all.csv")
CACHE = os.path.expanduser("~/pattern-study/cache"); os.makedirs(CACHE, exist_ok=True)

syms = sorted(pd.read_csv(TRADES).symbol.unique())
ok, bad = 0, []
for s in syms:
    f = os.path.join(CACHE, f"{s}.csv")
    if os.path.exists(f):
        ok += 1; continue
    for _ in range(3):
        try:
            d = yf.download(s, start="2004-01-01", end="2026-09-27", auto_adjust=False, progress=False)
            if d is not None and len(d) > 300:
                if isinstance(d.columns, pd.MultiIndex):
                    d.columns = d.columns.get_level_values(0)
                d[["Open", "High", "Low", "Close", "Volume"]].dropna().to_csv(f); ok += 1; break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        bad.append(s)
print("symbols:", len(syms), "cached:", ok, "missing:", bad)
