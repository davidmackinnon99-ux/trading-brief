#!/usr/bin/env python3
# SID confluence factor grading — recompute level-2 factors at entry from OHLCV,
# grade by realised R. Reusable: re-run as the trade book grows.
# Factors validated against brief archive (AAL 27-May: MACD/ATR% exact, CCI_S +-0.4).
import yfinance as yf, pandas as pd, warnings
warnings.filterwarnings("ignore")

TRADES = [
{"sym":"MS","date":"2025-09-25","dir":"short","R":0.83},{"sym":"ZTS","date":"2025-09-29","dir":"long","R":1.17},
{"sym":"UNP","date":"2025-10-03","dir":"short","R":1.05},{"sym":"USL","date":"2025-10-06","dir":"short","R":1.27},
{"sym":"DFND","date":"2025-10-10","dir":"short","R":2.63},{"sym":"SLX","date":"2025-10-13","dir":"short","R":-1.0},
{"sym":"MTEN","date":"2025-10-17","dir":"long","R":0.58},{"sym":"GASS","date":"2025-10-18","dir":"long","R":0.47},
{"sym":"PLD","date":"2025-10-30","dir":"short","R":0.04},
{"sym":"COUR","date":"2025-11-11","dir":"long","R":-0.81},
{"sym":"EVT","date":"2025-11-12","dir":"short","R":1.21},{"sym":"ATEC","date":"2025-11-13","dir":"short","R":-1.03},
{"sym":"KMT","date":"2025-11-17","dir":"short","R":-1.03},{"sym":"LFST","date":"2025-11-19","dir":"short","R":-0.41},
{"sym":"MD","date":"2025-11-19","dir":"long","R":-3.45},
{"sym":"TERN","date":"2025-11-28","dir":"short","R":1.0},
{"sym":"VRDN","date":"2025-12-01","dir":"short","R":-0.33},{"sym":"CPRI","date":"2025-12-09","dir":"short","R":0.12},
{"sym":"HROW","date":"2025-12-15","dir":"short","R":-1.0},{"sym":"BANC","date":"2025-12-16","dir":"short","R":-1.04},
{"sym":"CMC","date":"2025-12-18","dir":"short","R":-1.0},{"sym":"BURL","date":"2026-01-20","dir":"short","R":-1.17},
{"sym":"UHS","date":"2026-01-22","dir":"long","R":1.36},{"sym":"SNCY","date":"2026-01-26","dir":"short","R":-0.83},
{"sym":"AXL","date":"2026-01-28","dir":"short","R":-0.51},{"sym":"TTI","date":"2026-05-26","dir":"long","R":0.11},
{"sym":"AAL","date":"2026-05-31","dir":"short","R":0.92},{"sym":"INDI","date":"2026-05-31","dir":"short","R":0.73},
{"sym":"SIRI","date":"2026-05-31","dir":"short","R":0.61},
]
def ema(s,p):
    k=2/(p+1); out=[s[0]]
    for x in s[1:]: out.append(x*k+out[-1]*(1-k))
    return out
def rma(s,p):
    if len(s)<p: return [None]*len(s)
    out=[sum(s[:p])/p]
    for x in s[p:]: out.append((out[-1]*(p-1)+x)/p)
    return [None]*(p-1)+out
def factors_at(df, date):
    sub=df[df.index<=date]
    if len(sub)<60: return None
    o=list(sub['Open']); h=list(sub['High']); l=list(sub['Low']); c=list(sub['Close']); v=list(sub['Volume'])
    n=len(c); i=n-1
    ef=ema(c,12); es=ema(c,26); macd=[ef[k]-es[k] for k in range(n)]; sig=ema(macd,9)
    tr=[h[0]-l[0]]+[max(h[k]-l[k],abs(h[k]-c[k-1]),abs(l[k]-c[k-1])) for k in range(1,n)]
    atr=rma(tr,14)
    tp=[(h[k]+l[k]+c[k])/3 for k in range(n)]; cci=[None]*n
    for k in range(19,n):
        w=tp[k-19:k+1]; m=sum(w)/20; md=sum(abs(x-m) for x in w)/20; cci[k]=(tp[k]-m)/(0.015*md) if md else 0
    st=[None]*n
    for k in range(n):
        if k>=32 and cci[k] is not None:
            win=[cci[j] for j in range(k-13,k+1)]; lo=min(win); hi=max(win); st[k]=(cci[k]-lo)/(hi-lo)*100 if hi!=lo else 0
    K=[None]*n
    for k in range(n):
        if k>=2 and None not in st[k-2:k+1]: K[k]=sum(st[k-2:k+1])/3
    D=None
    if i>=2 and None not in K[i-2:i+1]: D=sum(K[i-2:i+1])/3
    pdm=[0]+[max(h[k]-h[k-1],0) if (h[k]-h[k-1])>(l[k-1]-l[k]) else 0 for k in range(1,n)]
    ndm=[0]+[max(l[k-1]-l[k],0) if (l[k-1]-l[k])>(h[k]-h[k-1]) else 0 for k in range(1,n)]
    aa=rma(tr,14); ps=rma(pdm,14); ns=rma(ndm,14)
    pdi=100*ps[i]/aa[i] if aa[i] else None; ndi=100*ns[i]/aa[i] if aa[i] else None
    # weekly RSI(14) + direction
    wc=sub['Close'].resample('W-FRI').last().dropna(); wl=list(wc)
    wrsi=wdir=None
    if len(wl)>15:
        d=[wl[k]-wl[k-1] for k in range(1,len(wl))]; g=[max(x,0) for x in d]; ls=[max(-x,0) for x in d]
        ag=rma(g,14); al=rma(ls,14); rs=[(ag[k]/al[k]) if al[k] else 999 for k in range(len(ag)) if ag[k] is not None]
        rsi=[100-100/(1+x) for x in rs]
        if len(rsi)>=2: wrsi=rsi[-1]; wdir=rsi[-1]-rsi[-2]
    rvol=v[i]/(sum(v[i-29:i+1])/30) if i>=29 else None
    return {"MACD":round(macd[i],3),"MACDsig":round(sig[i],3),"MACD_hist":round(macd[i]-sig[i],3),
            "MACD>0":macd[i]>0,"MACDvsSig":round(macd[i]-sig[i],3),
            "ATR%":round(100*atr[i]/c[i],2),"CCI_S":round(D,1) if D is not None else None,
            "ADX_spread":round(pdi-ndi,1) if pdi is not None else None,
            "DIp":round(pdi,1) if pdi else None,"DIn":round(ndi,1) if ndi else None,
            "RVOL":round(rvol,2) if rvol else None,"GapATR":round((o[i]-c[i-1])/atr[i],2) if atr[i] else None,
            "wRSI":round(wrsi,1) if wrsi else None,"wRSIdir":round(wdir,2) if wdir is not None else None,
            "bar":str(sub.index[i].date()),"close":round(c[i],2)}

results=[]; failed=[]
for t in TRADES:
    try:
        df=yf.download(t["sym"],start="2025-01-01",end="2026-06-10",interval="1d",auto_adjust=False,progress=False)
        if df.empty: failed.append(t["sym"]); continue
        if isinstance(df.columns,pd.MultiIndex): df.columns=df.columns.get_level_values(0)
        f=factors_at(df,pd.Timestamp(t["date"]))
        if f is None: failed.append(t["sym"]); continue
        f.update(t); results.append(f)
    except Exception as e:
        failed.append(f'{t["sym"]}:{e}')
import json
print("FETCH_FAILED:", failed)
print("OK_COUNT:", len(results))
json.dump(results, open("/tmp/sid_factors.json","w"))
print("saved /tmp/sid_factors.json")
