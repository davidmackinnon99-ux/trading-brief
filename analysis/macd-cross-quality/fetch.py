"""Fetch daily OHLCV for the SID backtest-sheet universe (cached to csv).
Part of the MACD cross-quality study (Sep 2026) for MACD Sep v1.3."""
import warnings; warnings.filterwarnings("ignore")
import os, time, pandas as pd, yfinance as yf

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache"); os.makedirs(CACHE, exist_ok=True)
SHEET = "/Users/davidmackinnon/Library/Mobile Documents/com~apple~CloudDocs/Working Files/Trading/SID Method/Backtesting/Student Backtesting/David's Copy of Backtesting Sheet 300 SID (1).xlsx"

m = pd.read_excel(SHEET, sheet_name="Stocks & Indices", header=0)
tickers = sorted(m["TICKER"].dropna().astype(str).str.strip().str.upper().unique())
print("universe:", len(tickers))
ok = 0
for tk in tickers:
    f = os.path.join(CACHE, f"{tk}.csv")
    if os.path.exists(f): ok += 1; continue
    for _ in range(3):
        try:
            d = yf.download(tk, start="2018-01-01", end="2026-09-24", auto_adjust=True, progress=False)
            if d is not None and len(d) > 300:
                if isinstance(d.columns, pd.MultiIndex): d.columns = d.columns.get_level_values(0)
                d[["Open","High","Low","Close","Volume"]].dropna().to_csv(f); ok += 1; break
        except Exception: pass
        time.sleep(0.5)
print("cached:", ok)
