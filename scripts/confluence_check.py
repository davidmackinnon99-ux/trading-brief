#!/usr/bin/env python3
"""On-demand confluence VERDICT + readout from a TradingView chart-export CSV.

Usage:  python3 scripts/confluence_check.py /path/to/EXPORT.csv [YYYY-MM-DD] [--sid|--lorp]
        no date  = last row in the file (latest exported bar)
        strategy = auto-detected from columns; override with --sid / --lorp

LORP verdict: PASS/FLAG on the one VALIDATED gate (MACD0 = MACD vs Signal), plus a
context-alignment tally (NOT validated as predictive - descriptive colour only).
SID verdict: screener-level read, explicitly UNVALIDATED (no proven SID gate yet).
Reads REAL TV values; nothing recomputed. Columns matched by name.
"""
import sys, csv

FACTORS_LORP = {
 "LC SIGNAL": ["Buy","Sell","StopBuy","StopSell","Distance from Kernel","Kernel Regression Estimate"],
 "EXTENSION": ["Upper Envelope: Far","Lower Envelope: Far","Mean reversion Up","Mean reversion Down"],
 "TREND":     ["Fast MA","Slow MA","MA #1","MA #2","ADX","DI+","DI-"],
 "MOMENTUM":  ["MACD","Signal Line","Cross","Aroon Oscillator","CCI Stochastic"],
 "ZONE/STOP": ["GP_Flag","GP_Top","GP_Bot","Long Stop","Short Stop","ATR Long Stop Loss"],
 "VOLATILITY":["ATR(14)","ATR% raw (buffer ref)","WRB Ratio (TR/ATR)"],
 "VOLUME":    ["RVOL ratio","Z-score","Volume Delta (Close)","Pocket Pivot","Anomaly Volume (>= Threshold 1σ)"],
 "BANDS":     ["Basis","Upper","Lower"],
}
SIGNALS_LORP = ["Buy","Sell","StopBuy","StopSell"]
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
    rows=list(csv.reader(open(path))); hdr=rows[0]; idx={}
    for i,h in enumerate(hdr): idx.setdefault(h,i)
    return rows[1:],idx,hdr
def val(row,idx,name):
    i=idx.get(name)
    if i is None or i>=len(row): return None
    v=row[i].strip()
    return v if v not in ("","NaN","nan") else None
def num(row,idx,name):
    v=val(row,idx,name)
    try: return float(v)
    except: return None
def aroon_bb(row,idx,hdr):
    cols=[i for i,h in enumerate(hdr) if h in ("Aroon Oscillator","Aroon Osc")]
    if not cols: return None
    i=cols[-1]  # last occurrence = BigBeluga when DM also present
    try: return float(row[i].strip())
    except: return None
def detect(idx):
    if any(m in idx for m in ["SID Armed Long","RSI (0-100)","Gap/ATR Ratio","Long Entry Signal"]): return "SID"
    if any(m in idx for m in ["Kernel Regression Estimate","StopBuy","GP_Flag"]): return "LORP"
    return "LORP"

def verdict_lorp(row,idx,hdr):
    macd=num(row,idx,"MACD"); sig=num(row,idx,"Signal Line"); out=[]
    if macd is None or sig is None:
        out.append("VERDICT: UNKNOWN - no MACD/Signal data")
    elif macd>=sig:
        out.append(f"VERDICT: PASS - MACD0 up (MACD {macd:.3f} >= Signal {sig:.3f}, hist +{macd-sig:.3f})")
    else:
        h=macd-sig; conv=" - but CONVERGING (near cross)" if h>-0.05 else ""
        out.append(f"VERDICT: FLAG - MACD0 down (MACD {macd:.3f} < Signal {sig:.3f}, hist {h:.3f}){conv}")
    # Extension / mean-reversion risk. LORP is long-only, so being stretched ABOVE the kernel
    # (upper-envelope breach or a Mean-reversion-DOWN mark) is a caution AGAINST a fresh long.
    # The envelope is the indicator's own "too far" band — more robust than the discrete reversion
    # mark, which is in the LC kernel layer and REPAINTS on history. This is a live read, not a gate,
    # and was NOT part of the 26-trade validation — it surfaces the risk for a discretionary call.
    close = num(row,idx,"close")
    dist  = num(row,idx,"Distance from Kernel")
    upFar = num(row,idx,"Upper Envelope: Far")
    loFar = num(row,idx,"Lower Envelope: Far")
    revDn = val(row,idx,"Mean reversion Down")   # non-empty only on the bar it fires
    revUp = val(row,idx,"Mean reversion Up")
    distStr = f"; Dist from Kernel {dist:.2f}" if dist is not None else ""
    if revDn is not None or (close is not None and upFar is not None and close > upFar):
        why = "Mean-reversion-DOWN mark firing" if revDn is not None \
              else f"close {close:.2f} above Upper Envelope Far {upFar:.2f}"
        out.append(f"  ⚠️ EXTENDED — reversion-DOWN risk for a long: {why}{distStr}")
        out.append("     (LC kernel layer: live read only, repaints on history; not in the 26-trade validation)")
    elif revUp is not None or (close is not None and loFar is not None and close < loFar):
        out.append(f"  ↓ stretched BELOW kernel — possible reversion-UP bounce setup{distStr}")
    checks=[]
    adx=num(row,idx,"ADX"); dip=num(row,idx,"DI+"); din=num(row,idx,"DI-")
    if None not in (adx,dip,din): checks.append(("ADX>=25&DI+>DI-", adx>=25 and dip>din))
    ar=aroon_bb(row,idx,hdr)
    if ar is not None: checks.append(("Aroon>0", ar>0))
    rv=num(row,idx,"RVOL ratio")
    if rv is not None: checks.append(("RVOL>=1", rv>=1.0))
    atr=num(row,idx,"ATR% raw (buffer ref)")
    if atr is not None: checks.append(("ATR%<5", atr<5))
    if checks:
        score=sum(1 for _,ok in checks if ok)
        detail="  ".join(("[+]" if ok else "[-]")+lbl for lbl,ok in checks)
        out.append(f"  context {score}/{len(checks)} (NOT validated - colour only): {detail}")
    return "\n".join(out)

def verdict_sid(row,idx):
    rsi=num(row,idx,"RSI (0-100)"); gap=num(row,idx,"Gap/ATR Ratio"); wk=val(row,idx,"Weekly MACD Align"); p=[]
    if rsi is not None:
        z="OS -> long setup" if rsi<=40 else "OB -> short setup" if rsi>=60 else "neutral (no setup)"
        p.append(f"RSI {rsi:.0f} {z}")
    if gap is not None: p.append(f"Gap/ATR {gap:.2f} ({'EXTENDED >=2 CAUTION' if abs(gap)>=2 else 'ok'})")
    if wk is not None:  p.append(f"WklyMACDalign={fmt(wk)}")
    return "VERDICT (SID - UNVALIDATED, no proven gate yet): " + (" | ".join(p) if p else "insufficient data")

if __name__=="__main__":
    args=sys.argv[1:]
    force="SID" if "--sid" in args else "LORP" if "--lorp" in args else None
    args=[a for a in args if not a.startswith("--")]
    if not args: print("usage: confluence_check.py EXPORT.csv [YYYY-MM-DD] [--sid|--lorp]"); sys.exit(1)
    data,idx,hdr=load(args[0]); date=args[1] if len(args)>1 else None
    strat=force or detect(idx)
    FACTORS=FACTORS_SID if strat=="SID" else FACTORS_LORP
    SIGNALS=SIGNALS_SID if strat=="SID" else SIGNALS_LORP
    row=(next((r for r in data if r[idx.get('time',0)].startswith(date)),None) if date else data[-1])
    if row is None: print(f"no row for {date}"); sys.exit(1)
    print(f"\n[{strat}]  bar: {row[idx.get('time',0)][:10]}   close: {fmt(val(row,idx,'close'))}")
    print(verdict_sid(row,idx) if strat=="SID" else verdict_lorp(row,idx,hdr))
    fired=[s for s in SIGNALS if val(row,idx,s) is not None]
    print(f"SIGNAL FIRED: {', '.join(fired) if fired else '(none on this bar)'}")
    for grp,cols in FACTORS.items():
        line=" | ".join(f"{c}={fmt(val(row,idx,c))}" for c in cols if c in idx and val(row,idx,c) is not None)
        if line: print(f"  {grp:11} {line}")
    print()
