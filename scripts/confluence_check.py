#!/usr/bin/env python3
"""On-demand confluence readout from a TradingView chart-export CSV (LORP or SID).

Usage:  python3 scripts/confluence_check.py /path/to/EXPORT.csv [YYYY-MM-DD]
        no date = last row in the file (latest exported bar)

Reads the REAL TV-computed values (incl. LC kernel, GP zones, Volume Delta) —
nothing is recomputed, so proprietary factors are accurate. Columns are matched
by NAME (first occurrence), so reordering/adding plots in TV won't break it.
Edit the FACTORS groups below as the confluence set is finalised.
"""
import sys, csv

FACTORS = {
 "LC SIGNAL": ["Buy","Sell","StopBuy","StopSell","Distance from Kernel","Kernel Regression Estimate"],
 "TREND":     ["Fast MA","Slow MA","MA #1","MA #2","ADX","DI+","DI-"],
 "MOMENTUM":  ["MACD","Signal Line","Cross","Aroon Oscillator","CCI Stochastic"],
 "ZONE/STOP": ["GP_Flag","GP_Top","GP_Bot","Long Stop","Short Stop","ATR Long Stop Loss"],
 "VOLATILITY":["ATR(14)","ATR% raw (buffer ref)","WRB Ratio (TR/ATR)"],
 "VOLUME":    ["RVOL ratio","Z-score","Volume Delta (Close)","Pocket Pivot","Anomaly Volume (>= Threshold 1σ)"],
 "BANDS":     ["Basis","Upper","Lower"],
}
SIGNALS = ["Buy","Sell","StopBuy","StopSell"]

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

if __name__=="__main__":
    if len(sys.argv)<2:
        print("usage: python3 scripts/confluence_check.py EXPORT.csv [YYYY-MM-DD]"); sys.exit(1)
    data,idx=load(sys.argv[1])
    if len(sys.argv)>2:
        row=next((r for r in data if r[idx.get('time',0)].startswith(sys.argv[2])),None)
        if row is None: print(f"no row for {sys.argv[2]}"); sys.exit(1)
    else:
        row=data[-1]
    print(f"\nbar: {row[idx.get('time',0)][:10]}   close: {fmt(val(row,idx,'close'))}")
    fired=[s for s in SIGNALS if val(row,idx,s) is not None]
    print(f"SIGNAL FIRED: {', '.join(fired) if fired else '(none on this bar)'}")
    for grp,cols in FACTORS.items():
        line=" | ".join(f"{c}={fmt(val(row,idx,c))}" for c in cols if c in idx and val(row,idx,c) is not None)
        if line: print(f"  {grp:11} {line}")
    print()
