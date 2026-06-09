#!/usr/bin/env python3
"""On-demand confluence readout from a TradingView chart-export CSV (LORP or SID).

Usage:  python3 scripts/confluence_check.py /path/to/EXPORT.csv [YYYY-MM-DD] [--sid|--lorp]
        no date  = last row in the file (latest exported bar)
        strategy = auto-detected from columns; override with --sid / --lorp

Reads the REAL TV-computed values (LC kernel, GP zones, Volume Delta, Gap/ATR,
normalised SID RSI/MACD) — nothing recomputed. Columns matched by NAME (first
occurrence), so reordering/adding plots won't break it. Edit profiles below.
"""
import sys, csv

FACTORS_LORP = {
 "LC SIGNAL": ["Buy","Sell","StopBuy","StopSell","Distance from Kernel","Kernel Regression Estimate"],
 "TREND":     ["Fast MA","Slow MA","MA #1","MA #2","ADX","DI+","DI-"],
 "MOMENTUM":  ["MACD","Signal Line","Cross","Aroon Oscillator","CCI Stochastic"],
 "ZONE/STOP": ["GP_Flag","GP_Top","GP_Bot","Long Stop","Short Stop","ATR Long Stop Loss"],
 "VOLATILITY":["ATR(14)","ATR% raw (buffer ref)","WRB Ratio (TR/ATR)"],
 "VOLUME":    ["RVOL ratio","Z-score","Volume Delta (Close)","Pocket Pivot","Anomaly Volume (>= Threshold 1σ)"],
 "BANDS":     ["Basis","Upper","Lower"],
}
SIGNALS_LORP = ["Buy","Sell","StopBuy","StopSell"]

# SID column names taken from Trading Systems Pro v8.5.12 plot titles (+ shared indicators)
FACTORS_SID = {
 "SID SIGNAL":  ["SID Armed Long","SID Armed Short","Long Entry Signal","Short Entry Signal",
                 "RSI Enters OS","RSI Enters OB","Long Exit Signal","Short Exit Signal"],
 "CORE (L1)":   ["RSI (0-100)","ADX","SMA200","Aroon Osc"],
 "CONFLUENCE":  ["Gap/ATR Ratio","MACD (0-100)","Signal (0-100)","CCI Stochastic"],
 "WEEKLY":      ["Weekly RSI","Weekly RSI Gate","Weekly MACD Align"],
 "VOLATILITY":  ["ATR%"],
 "VOLUME":      ["RVOL ratio","Z-score","Volume Delta (Close)"],
 "DIRECTION":   ["DI+","DI-"],
}
SIGNALS_SID = ["Long Entry Signal","Short Entry Signal","RSI Enters OS","RSI Enters OB",
               "Long Exit Signal","Short Exit Signal","SID Armed Long","SID Armed Short"]

def fmt(v):
    try:
        x=float(v)
        if x==int(x): return str(int(x))
        return f"{x:.3f}".rstrip("0").rstrip(".")
    except: return v

def load(path):
    rows=list(csv.reader(open(path)))
    idx={}
    for i,h in enumerate(rows[0]): idx.setdefault(h,i)
    return rows[1:],idx

def val(row,idx,name):
    i=idx.get(name)
    if i is None or i>=len(row): return None
    v=row[i].strip()
    return v if v not in ("","NaN","nan") else None

def detect(idx):
    sid_markers =["SID Armed Long","RSI (0-100)","Gap/ATR Ratio","Long Entry Signal"]
    lorp_markers=["Kernel Regression Estimate","StopBuy","GP_Flag"]
    if any(m in idx for m in sid_markers):  return "SID"
    if any(m in idx for m in lorp_markers): return "LORP"
    return "LORP"

if __name__=="__main__":
    args=[a for a in sys.argv[1:]]
    force = "SID" if "--sid" in args else "LORP" if "--lorp" in args else None
    args=[a for a in args if not a.startswith("--")]
    if not args:
        print("usage: confluence_check.py EXPORT.csv [YYYY-MM-DD] [--sid|--lorp]"); sys.exit(1)
    data,idx=load(args[0])
    date=args[1] if len(args)>1 else None
    strat = force or detect(idx)
    FACTORS = FACTORS_SID if strat=="SID" else FACTORS_LORP
    SIGNALS = SIGNALS_SID if strat=="SID" else SIGNALS_LORP
    if date:
        row=next((r for r in data if r[idx.get('time',0)].startswith(date)),None)
        if row is None: print(f"no row for {date}"); sys.exit(1)
    else:
        row=data[-1]
    print(f"\n[{strat}]  bar: {row[idx.get('time',0)][:10]}   close: {fmt(val(row,idx,'close'))}")
    fired=[s for s in SIGNALS if val(row,idx,s) is not None]
    print(f"SIGNAL FIRED: {', '.join(fired) if fired else '(none on this bar)'}")
    for grp,cols in FACTORS.items():
        line=" | ".join(f"{c}={fmt(val(row,idx,c))}" for c in cols if c in idx and val(row,idx,c) is not None)
        if line: print(f"  {grp:11} {line}")
    print()
