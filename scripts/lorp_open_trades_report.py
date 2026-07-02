#!/usr/bin/env python3
"""LORP open-trade morning report — appended to the brief email by morning-brief.sh.

Reads open_trades.csv (LORP rows only — SID/other skipped), fetches daily bars via
yfinance, and prints a markdown OPEN TRADES section: health verdict + suggested stop.
Self-contained so it runs inside the local brief pipeline (no MCP tools needed).

Usage:  python3 lorp_open_trades_report.py [path/to/open_trades.csv]
        default path = David's LORP Data folder.
"""
import sys, os, warnings
warnings.filterwarnings("ignore")   # silence urllib3/LibreSSL NotOpenSSLWarning etc.
import pandas as pd, numpy as np

DEFAULT_OT = ("/Users/davidmackinnon/Library/Mobile Documents/com~apple~CloudDocs/"
              "Working Files/Trading/Indicators/LORP Data/open_trades.csv")
OT = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OT

INIT_ATR, BE_ATR, TRAIL_ATR, STALL, MFE_MIN = 1.5, 1.0, 2.0, 3, 3.0

def ema(s, p): return pd.Series(s).ewm(span=p, adjust=False).mean().values
def atr14(h, l, c):
    tr = np.maximum(h[1:]-l[1:], np.maximum(abs(h[1:]-c[:-1]), abs(l[1:]-c[:-1])))
    tr = np.r_[h[0]-l[0], tr]
    return pd.Series(tr).rolling(14).mean().values

def grade(sym, entry):
    import yfinance as yf
    df = yf.download(sym, period="4mo", interval="1d", auto_adjust=False, progress=False)
    if df is None or df.empty:
        return None
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    o, h, l, c = (df[x].values.astype(float) for x in ["Open", "High", "Low", "Close"])
    dates = df.index.normalize()
    n = len(c)
    macd = ema(c, 12) - ema(c, 26); sig = ema(macd, 9); atr = atr14(h, l, c)
    i = int(np.argmin(np.abs((dates - entry).values)))   # nearest bar to entry (±1 day tolerant)
    held = n - 1 - i; ep = c[i]; last = c[-1]
    ret = (last/ep - 1) * 100
    seg = c[i+1:]
    mfe = (np.max(seg)/ep - 1) * 100 if len(seg) else 0.0
    gap0 = macd[i] - sig[i]; j = min(i+STALL, n-1)
    gapchg = ((macd[j]-sig[j]) - gap0)/atr[i] if atr[i] else 0.0
    macd_up = gap0 > 0
    ae, an = atr[i], atr[-1]
    init = ep - INIT_ATR*ae
    hi = np.max(h[i:]); cand = [init]
    if hi >= ep + BE_ATR*ae:
        cand.append(ep)
    cand.append(hi - TRAIL_ATR*an)
    sug = min(max(cand), last - 0.1*an)
    flags = []
    if not macd_up:                        flags.append("MACD below signal at entry")
    if held >= STALL and gapchg <= 0.05:   flags.append("gap not expanding")
    if held >= 2 and mfe < MFE_MIN:        flags.append(f"MFE < {MFE_MIN:.0f}%")
    verdict = ("ON TRACK" if not flags else
               "SCRATCH CANDIDATE" if len(flags) >= 2 else
               "TOO EARLY" if held < STALL else "WATCH")
    return dict(sym=sym, entry=str(dates[i].date()), held=held, ret=ret, mfe=mfe,
                macd_up=macd_up, stop=sug, stop_pct=(last-sug)/last*100,
                verdict=verdict, flags="; ".join(flags))

def main():
    print("\n---\n")
    print("**📋 LORP OPEN TRADES** *(auto-graded on the MACD0 gate + 1.5-ATR trailing stop)*\n")
    if not os.path.exists(OT):
        print(f"_(open_trades.csv not found at {OT})_"); return
    d = pd.read_csv(OT); d.columns = [x.strip().lower() for x in d.columns]
    if "strategy" not in d.columns:
        d["strategy"] = "LORP"
    strat = d["strategy"].astype(str).str.upper().str.strip()
    lorp = d[strat == "LORP"]; other = d[strat != "LORP"]
    if not len(lorp):
        print("_(no LORP open trades)_")
    for r in lorp.itertuples():
        sym = str(r.symbol).upper().strip()
        try:
            g = grade(sym, pd.to_datetime(r.entry_date, dayfirst=True).normalize())
        except Exception as e:
            print(f"- **{sym}** — data fetch failed ({e})"); continue
        if g is None:
            print(f"- **{sym}** — no data returned"); continue
        print(f"- **{g['sym']}** [{g['verdict']}] {g['held']}b held · ret {g['ret']:+.1f}% · "
              f"MFE {g['mfe']:+.1f}% · MACD {'up' if g['macd_up'] else 'BELOW'} · "
              f"stop {g['stop']:.2f} ({g['stop_pct']:.1f}% below)"
              + (f" — {g['flags']}" if g['flags'] else ""))
    if len(other):
        print(f"\n_SID/other trades (not LORP-graded — await SID monitor): "
              f"{', '.join(str(s).upper() for s in other.symbol)}_")

if __name__ == "__main__":
    main()
