#!/usr/bin/env python3
"""Validate LORP confluence factors against screenshot-proven trades, reading
REAL TradingView values from chart-export CSVs (no recompute — custom indicator
settings like Aroon 29/smooth-25 can't be reliably reproduced offline).

Usage:  python3 scripts/lorp_validate.py /folder/of/csvs
Each CSV filename must contain the ticker (e.g. BATS_ACHV__1D_x.csv or ACHV.csv).
Dates + R are embedded below (from TradesViz export, validated vs screenshots).
STABLE factors (Aroon, MACD, ATR%, ADX, CCI_S, RVOL, VD) read at the entry bar
are trustworthy; LC-layer (Distance, Reversion) repaint — shown but flagged."""
import sys, csv, os, glob, statistics as st
TRADES={"AAP":("2026-04-19",-0.33,"Manual"),"AMD":("2026-04-15",1.89,"Manual"),"ARCO":("2026-01-28",1.05,"Default"),
"BIPH":("2026-01-22",-0.68,"Default"),"BUSE":("2026-01-21",-1.01,"STOP"),"CSTM":("2026-05-25",-1.00,"Default"),
"CTOS":("2026-02-11",-0.27,"STOP"),"CURB":("2026-05-19",-0.18,"Other"),"GTES":("2026-02-04",1.13,"Default"),
"IAC":("2026-04-19",-0.32,"Manual"),"IFS":("2026-01-08",0.15,"Default"),"JBS":("2026-03-31",0.68,"Default"),
"KC":("2026-01-27",0.00,"Manual"),"LEA":("2026-05-27",0.70,"Default"),"NNN":("2026-01-14",0.36,"Default"),
"NTLA":("2026-04-22",-1.01,"Manual"),"NVTS":("2026-04-19",2.14,"None"),"NWBI":("2026-02-02",0.51,"Default"),
"PRAX":("2026-01-16",-0.22,"Manual"),"PRIM":("2026-02-11",0.02,"Default"),"RUN":("2026-01-26",1.01,"Default"),
"SHG":("2026-01-21",1.00,"Default"),"SHO":("2026-05-25",0.07,"Default"),"SIRI":("2026-05-21",0.64,"Default"),
"TGT":("2026-04-19",1.00,"Manual"),"TNGX":("2026-03-06",0.81,"Default"),"XLI":("2026-02-03",0.76,"Default")}
# stable (trustworthy historically) + lc (repaints — flagged)
STABLE=["ATR% raw (buffer ref)","MACD","Signal Line","Aroon Oscillator","CCI Stochastic","ADX","DI+","DI-","RVOL ratio","Volume Delta (Close)"]
LC=["Distance from Kernel","Mean reversion Down"]
def load(p):
    r=list(csv.reader(open(p)));idx={}
    for i,h in enumerate(r[0]):idx.setdefault(h,i)
    return r[1:],idx
def val(row,idx,name):
    i=idx.get(name)
    if i is None or i>=len(row):return None
    v=row[i].strip()
    try:return float(v)
    except:return None
def tk_from(fn):
    base=os.path.basename(fn).upper()
    for t in TRADES:
        if base.split('.')[0]==t or f"_{t}_" in base or base.startswith(t+"_") or base.startswith(t+"."):return t
    return None
def at(data,idx,date):
    rows=[r for r in data if r[idx.get('time',0)][:10]<=date]
    return rows[-1] if rows else None
if __name__=="__main__":
    folder=sys.argv[1] if len(sys.argv)>1 else os.path.expanduser("~/Downloads/lorp_csvs")
    files=glob.glob(os.path.join(folder,"*.csv"))
    res=[]
    for f in files:
        t=tk_from(f)
        if not t:print("?? no ticker match:",os.path.basename(f));continue
        date,R,ex=TRADES[t];data,idx=load(f);row=at(data,idx,date)
        if not row:print("?? no bar <=",date,"for",t);continue
        d=dict(tk=t,R=R,ex=ex,atrpct=val(row,idx,"ATR% raw (buffer ref)"),macd=val(row,idx,"MACD"),
            sig=val(row,idx,"Signal Line"),aroon=val(row,idx,"Aroon Oscillator"),ccis=val(row,idx,"CCI Stochastic"),
            adx=val(row,idx,"ADX"),dip=val(row,idx,"DI+"),din=val(row,idx,"DI-"),rvol=val(row,idx,"RVOL ratio"),
            vd=val(row,idx,"Volume Delta (Close)"),dist=val(row,idx,"Distance from Kernel"),bar=row[idx.get('time',0)][:10])
        res.append(d)
    if not res:print(f"\nNo CSVs matched in {folder}\nExport the 27 charts there (filename must contain the ticker).");sys.exit()
    w=[r for r in res if r['R']>0];L=[r for r in res if r['R']<=0]
    print(f"\nmatched {len(res)}/27   winners {len(w)}  losers {len(L)}   (folder: {folder})")
    print("\n=== GATE HIT RATE (fires on winners vs losers) ===")
    def g(n,fn):
        print(f"  {n:26} win {sum(1 for r in w if fn(r))}/{len(w)}   loss {sum(1 for r in L if fn(r))}/{len(L)}")
    g("MACD < Signal",lambda r:r['macd'] is not None and r['sig'] is not None and r['macd']<r['sig'])
    g("Aroon < 0 (whichever on chart)",lambda r:r['aroon'] is not None and r['aroon']<0)
    g("ATR% >= 5",lambda r:r['atrpct'] is not None and r['atrpct']>=5)
    g("CCI_S >= 80 (overbought)",lambda r:r['ccis'] is not None and r['ccis']>=80)
    g("ADX < 25",lambda r:r['adx'] is not None and r['adx']<25)
    print("\n=== MEANS: winners vs losers ===")
    for f,lbl in [("atrpct","ATR%"),("aroon","Aroon"),("ccis","CCI_S"),("adx","ADX"),("rvol","RVOL")]:
        wv=[r[f] for r in w if r[f] is not None];lv=[r[f] for r in L if r[f] is not None]
        if wv and lv:print(f"  {lbl:7} win {st.mean(wv):+8.2f}   loss {st.mean(lv):+8.2f}   gap {st.mean(wv)-st.mean(lv):+8.2f}")
    print("\n=== per-trade (REAL TV values) ===")
    print(f"{'tk':5}{'R':>6}{'exit':>9}{'ATR%':>6}{'MACD':>6}{'Aroon':>7}{'CCI_S':>7}{'ADX':>5}{'Dist*':>7}")
    for r in sorted(res,key=lambda x:-x['R']):
        md='UP' if (r['macd'] or 0)>=(r['sig'] or 0) else 'DOWN'
        print(f"{r['tk']:5}{r['R']:>6.2f}{r['ex']:>9}{(r['atrpct'] or 0):>6.1f}{md:>6}{(r['aroon'] or 0):>7.0f}{(r['ccis'] or 0):>7.0f}{(r['adx'] or 0):>5.0f}{(r['dist'] or 0):>7.2f}")
    print("  * Dist from Kernel is LC-layer (repaints) — historical value unreliable")
