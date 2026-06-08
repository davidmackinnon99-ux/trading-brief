#!/usr/bin/env python3
"""On-demand SID confluence check for one ticker.
Usage:  python3 scripts/sid_check.py TICKER [YYYY-MM-DD]
        (no date = latest confirmed daily bar)
Factors validated against TV brief archive (AAL 27-May: MACD/ATR% exact, CCI_S +-0.4).
Volume Delta is NOT included (intrabar, not reconstructable from daily bars)."""
import sys, warnings, yfinance as yf, pandas as pd
warnings.filterwarnings("ignore")

def ema(s,p):
    k=2/(p+1); out=[s[0]]
    for x in s[1:]: out.append(x*k+out[-1]*(1-k))
    return out
def rma(s,p):
    if len(s)<p: return [None]*len(s)
    out=[sum(s[:p])/p]
    for x in s[p:]: out.append((out[-1]*(p-1)+x)/p)
    return [None]*(p-1)+out

def compute(df, date=None):
    if isinstance(df.columns,pd.MultiIndex): df.columns=df.columns.get_level_values(0)
    sub = df if date is None else df[df.index<=pd.Timestamp(date)]
    if len(sub)<60: return None
    o=list(sub['Open']); h=list(sub['High']); l=list(sub['Low']); c=list(sub['Close']); v=list(sub['Volume'])
    n=len(c); i=n-1
    # RSI 14
    d=[c[k]-c[k-1] for k in range(1,n)]; g=[max(x,0) for x in d]; ls=[max(-x,0) for x in d]
    ag=rma(g,14); al=rma(ls,14)
    rsi=100-100/(1+(ag[-1]/al[-1])) if al[-1] else 100
    # MACD
    ef=ema(c,12); es=ema(c,26); macd=[ef[k]-es[k] for k in range(n)]; sig=ema(macd,9)
    # ATR Wilder 14
    tr=[h[0]-l[0]]+[max(h[k]-l[k],abs(h[k]-c[k-1]),abs(l[k]-c[k-1])) for k in range(1,n)]; atr=rma(tr,14)
    # CCI20 -> Stoch14 -> smooth3/3 (%D)
    tp=[(h[k]+l[k]+c[k])/3 for k in range(n)]; cci=[None]*n
    for k in range(19,n):
        w=tp[k-19:k+1]; m=sum(w)/20; md=sum(abs(x-m) for x in w)/20; cci[k]=(tp[k]-m)/(0.015*md) if md else 0
    stch=[None]*n
    for k in range(32,n):
        win=[cci[j] for j in range(k-13,k+1)]; lo=min(win); hi=max(win); stch[k]=(cci[k]-lo)/(hi-lo)*100 if hi!=lo else 0
    K=[(sum(stch[k-2:k+1])/3 if k>=34 and None not in stch[k-2:k+1] else None) for k in range(n)]
    D=sum(K[i-2:i+1])/3 if i>=36 and None not in K[i-2:i+1] else None
    # ADX/DI Wilder 14
    pdm=[0]+[max(h[k]-h[k-1],0) if (h[k]-h[k-1])>(l[k-1]-l[k]) else 0 for k in range(1,n)]
    ndm=[0]+[max(l[k-1]-l[k],0) if (l[k-1]-l[k])>(h[k]-h[k-1]) else 0 for k in range(1,n)]
    aa=rma(tr,14); ps=rma(pdm,14); ns=rma(ndm,14)
    pdi=100*ps[i]/aa[i] if aa[i] else 0; ndi=100*ns[i]/aa[i] if aa[i] else 0
    dx=[]
    for k in range(n):
        if aa[k]:
            pp=100*ps[k]/aa[k]; nn=100*ns[k]/aa[k]; s=pp+nn; dx.append(100*abs(pp-nn)/s if s else 0)
    adxr=rma(dx,14); adx=adxr[-1] if adxr and adxr[-1] is not None else None
    # Weekly RSI + dir
    wc=list(sub['Close'].resample('W-FRI').last().dropna()); wrsi=wdir=None
    if len(wc)>16:
        wd=[wc[k]-wc[k-1] for k in range(1,len(wc))]; wg=rma([max(x,0) for x in wd],14); wll=rma([max(-x,0) for x in wd],14)
        rr=[100-100/(1+(wg[k]/wll[k])) if wll[k] else 100 for k in range(len(wg)) if wg[k] is not None]
        if len(rr)>=2: wrsi=rr[-1]; wdir=rr[-1]-rr[-2]
    rvol=v[i]/(sum(v[i-29:i+1])/30) if i>=29 else None
    return dict(bar=str(sub.index[i].date()),close=round(c[i],2),rsi=round(rsi,1),
        macd=round(macd[i],3),sig=round(sig[i],3),hist=round(macd[i]-sig[i],3),
        atrpct=round(100*atr[i]/c[i],2),ccis=round(D,1) if D is not None else None,
        adx=round(adx,1) if adx else None,dip=round(pdi,1),din=round(ndi,1),spread=round(pdi-ndi,1),
        rvol=round(rvol,2) if rvol else None,gapatr=round((o[i]-c[i-1])/atr[i],2) if atr[i] else None,
        wrsi=round(wrsi,1) if wrsi else None,wdir=round(wdir,2) if wdir is not None else None)

if __name__=="__main__":
    if len(sys.argv)<2:
        print("usage: python3 scripts/sid_check.py TICKER [YYYY-MM-DD]"); sys.exit(1)
    tk=sys.argv[1].upper(); dt=sys.argv[2] if len(sys.argv)>2 else None
    df=yf.download(tk,start="2024-06-01",end="2026-12-31",interval="1d",auto_adjust=False,progress=False)
    if df is None or df.empty: print(f"No data for {tk} (ASX? try {tk}.AX)"); sys.exit(1)
    f=compute(df,dt)
    if not f: print("Not enough history."); sys.exit(1)
    scr_long = f['rsi']<=40 and f['adx'] and 25<=f['adx']<=40
    scr_short= f['rsi']>=60 and f['adx'] and 25<=f['adx']<=40
    print(f"\n{tk}  bar {f['bar']}  close {f['close']}")
    print(f"  SCREENER (L1): RSI {f['rsi']} | ADX {f['adx']}  ->  long-setup {scr_long} | short-setup {scr_short}")
    print(f"  CONFLUENCE (L2):")
    print(f"    CCI_S        {f['ccis']}   (shorts: higher=more overbought=better)")
    print(f"    MACD/sig     {f['macd']} / {f['sig']}  hist {f['hist']}")
    print(f"    ADX spread   {f['spread']}   (DI+ {f['dip']} / DI- {f['din']})")
    print(f"    Gap/ATR      {f['gapatr']}   RVOL {f['rvol']}   <-- VETO if Gap/ATR>=1.0 AND RVOL>=1.2 (tentative)")
    print(f"    Weekly RSI   {f['wrsi']}  dir {f['wdir']}")
    print(f"    ATR%         {f['atrpct']}   (lower=better)")
    print("  (Volume Delta not shown - intrabar, check live on chart)\n")
