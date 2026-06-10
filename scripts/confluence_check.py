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
def mean_rev(row,idx,hdr):
    """LC Mean Reversion plotchar flags — exported nameless as 'Chars'. The four Chars columns
    immediately after 'Lower Envelope: Far' are, in order:
        +1 Reversion DOWN (regular, above candle)   +2 STRONG Reversion DOWN (above candle)
        +3 Reversion UP   (regular, below candle)   +4 STRONG Reversion UP   (below candle)
    Anchored on a named column so it survives other indicators shifting absolute positions.
    Returns dict of booleans (None where the anchor/column isn't found)."""
    anchor=None
    for nm in ("Lower Envelope: Far","Lower Envelope: Average","Lower Envelope: Near"):
        if nm in idx: anchor=idx[nm]; break
    def flag(off):
        if anchor is None: return None
        i=anchor+off
        if i>=len(hdr) or hdr[i]!="Chars": return None   # guard: must be a Chars column
        if i>=len(row): return None
        return row[i].strip() not in ("","0","0.0","NaN","nan")
    return {"down_reg":flag(1),"down_strong":flag(2),"up_reg":flag(3),"up_strong":flag(4)}
def detect(idx):
    if any(m in idx for m in ["SID Armed Long","RSI (0-100)","Gap/ATR Ratio","Long Entry Signal"]): return "SID"
    if any(m in idx for m in ["Kernel Regression Estimate","StopBuy","GP_Flag"]): return "LORP"
    return "LORP"

def verdict_lorp(row,idx,hdr):
    macd=num(row,idx,"MACD"); sig=num(row,idx,"Signal Line"); out=[]
    mr = mean_rev(row,idx,hdr)
    dist = num(row,idx,"Distance from Kernel")
    distStr = f"; Dist {dist:.2f} from kernel" if dist is not None else ""
    caveat = "     (Mean Reversion = LC kernel layer: live read, repaints on history; not in the 26-trade validation)"
    # MACD0 gate — the one validated factor
    if macd is None or sig is None:
        gate=None;  gate_txt="MACD0 unknown (no MACD/Signal data)"
    elif macd>=sig:
        gate=True;  gate_txt=f"MACD0 up (MACD {macd:.3f} >= Signal {sig:.3f}, hist +{macd-sig:.3f})"
    else:
        h=macd-sig; conv=" - converging (near cross)" if h>-0.05 else ""
        gate=False; gate_txt=f"MACD0 down (MACD {macd:.3f} < Signal {sig:.3f}, hist {h:.3f}){conv}"
    # Headline: a DOWN mean-reversion (LORP is long-only) overrides a passing gate so it can't be
    # skimmed past — Strong → AVOID, regular → CAUTION. A failing gate stays FLAG on its own.
    if gate is False:
        out.append(f"VERDICT: FLAG — {gate_txt}")
    elif mr.get("down_strong"):
        out.append(f"VERDICT: 🛑 AVOID — STRONG Mean Reversion DOWN{distStr}")
        out.append(f"        (gate would PASS: {gate_txt} — overridden by the down-reversion)")
        out.append(caveat)
    elif mr.get("down_reg"):
        out.append(f"VERDICT: ⚠️ CAUTION — Mean Reversion DOWN (regular){distStr}")
        out.append(f"        (gate {gate_txt})")
        out.append(caveat)
    elif gate is True:
        out.append(f"VERDICT: PASS — {gate_txt}")
    else:
        out.append(f"VERDICT: UNKNOWN — {gate_txt}")
    # UP mean-reversion — supportive context for a long; does not downgrade the headline
    if mr.get("up_strong"):
        out.append(f"  ✅ STRONG Mean Reversion UP firing — supportive of a long bounce{distStr}"); out.append(caveat)
    elif mr.get("up_reg"):
        out.append(f"  ↑ Mean Reversion UP (regular) firing — mild support for a long{distStr}"); out.append(caveat)
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
    # Setup is decided by the SID indicator's OWN fired signal, NOT an RSI-zone guess.
    # A real Long/Short Entry firing inside the neutral RSI band must not read as "no setup".
    long_entry  = (num(row,idx,"Long Entry Signal")  or 0) != 0
    short_entry = (num(row,idx,"Short Entry Signal") or 0) != 0
    armed_long  = (num(row,idx,"SID Armed Long")     or 0) != 0
    armed_short = (num(row,idx,"SID Armed Short")    or 0) != 0
    rsi=num(row,idx,"RSI (0-100)"); gap=num(row,idx,"Gap/ATR Ratio"); wk=val(row,idx,"Weekly MACD Align")
    if   long_entry:  setup="LONG ENTRY fired"
    elif short_entry: setup="SHORT ENTRY fired"
    elif armed_long:  setup="armed long (no entry trigger this bar)"
    elif armed_short: setup="armed short (no entry trigger this bar)"
    else:             setup="no SID setup"
    p=[setup]
    if rsi is not None:   # RSI is context/colour only — never the setup gate
        p.append(f"RSI {rsi:.0f} ({'OS' if rsi<=40 else 'OB' if rsi>=60 else 'mid'})")
    if gap is not None:   # Gap/ATR = (entry - SL)/ATR, read verbatim from col; SL proxy = 10-bar swing (see Pine)
        p.append(f"Gap/ATR {gap:.2f} ({'EXTENDED >=2 CAUTION' if abs(gap)>=2 else 'ok'})")
    if wk is not None:  p.append(f"WklyMACDalign={fmt(wk)}")
    return "VERDICT (SID - UNVALIDATED, no proven gate yet): " + " | ".join(p)

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
    fired=[s for s in SIGNALS if (num(row,idx,s) or 0) != 0]   # only signals actually firing (=1), not every 0/1 column present
    print(f"SIGNAL FIRED: {', '.join(fired) if fired else '(none on this bar)'}")
    for grp,cols in FACTORS.items():
        line=" | ".join(f"{c}={fmt(val(row,idx,c))}" for c in cols if c in idx and val(row,idx,c) is not None)
        if line: print(f"  {grp:11} {line}")
    print()
