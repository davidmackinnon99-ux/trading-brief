"""MACD cross-quality study (Sep 2026).
Question: at the close of the bar where MACD crosses its signal line, which
information predicts whether the cross FAILS (re-crosses within 3 bars)?
Factors tested (all known at the cross-bar close, no look-ahead):
  F1 first-bar separation  = |hist| / SMA50(|hist|)   (MACD Sep 'Separation')
  F1b punch-through         = (hist[0]-hist[-1]) signed to direction / SMA50
  F2 approach speed          = avg closing speed over the 3 bars before the cross
  F3 ticker whipsaw rate    = share of this ticker's previous 10 resolved crosses that failed
  F4 WaveTrend proxy        = LazyBear WT1 vs WT2 aligned + WT cross in last 5 bars
     (WT3D itself is a proprietary kernel variant; classic WaveTrend used as a proxy)
  F5 cross depth             = MACD / stdev(MACD,100), signed to direction
Outcomes: fail3 = opposite cross within bars 1-3; fwd10 = 10-bar % return in direction.
"""
import os, glob, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))

def ema(s, n): return s.ewm(span=n, adjust=False).mean()

def features(tk, d):
    c, h, l = d.Close, d.High, d.Low
    macd = ema(c,12) - ema(c,26); sig = ema(macd,9); hist = macd - sig
    ah = hist.abs(); avg = ah.rolling(50).mean()
    ap = (h+l+c)/3; esa = ema(ap,10); dd = ema((ap-esa).abs(),10)
    wt1 = ema((ap-esa)/(0.015*dd),21); wt2 = wt1.rolling(4).mean()
    wdiff = (wt1-wt2).values
    depth = (macd/macd.rolling(100).std()).values
    H, A, AV = hist.values, ah.values, avg.values; C = c.values
    rows = []; hist_out = []   # per-ticker resolved outcomes for F3
    n = len(H)
    for i in range(110, n-10):
        up = H[i] > 0 and H[i-1] <= 0; dn = H[i] < 0 and H[i-1] >= 0
        if not (up or dn): continue
        s = 1 if up else -1
        fail = any(np.sign(H[i+k]) == -s for k in (1,2,3))
        # F3 uses only crosses whose 3-bar outcome was known before bar i
        prev = [f for (j,f) in hist_out if j+3 < i][-10:]
        wt_al = (wdiff[i]*s) > 0
        wt_x = any((wdiff[k]*s > 0) and (wdiff[k-1]*s <= 0) for k in range(i-5, i+1))
        rows.append(dict(tk=tk, date=d.index[i], dir='long' if up else 'short',
            sep=A[i]/AV[i], punch=s*(H[i]-H[i-1])/AV[i],
            approach=(A[i-4]-A[i-1])/3/AV[i],
            whip=np.mean(prev) if len(prev) >= 5 else np.nan,
            wt_aligned=wt_al, wt_recent=wt_x, depth=s*depth[i],
            fail3=fail, fwd10=s*(C[i+10]/C[i]-1)*100))
        hist_out.append((i, fail))
    return rows

rows = []
for f in sorted(glob.glob(os.path.join(HERE, "cache", "*.csv"))):
    d = pd.read_csv(f, index_col=0, parse_dates=True)
    if len(d) > 300: rows += features(os.path.basename(f)[:-4], d)
R = pd.DataFrame(rows); R.to_csv(os.path.join(HERE, "crosses.csv"), index=False)

def summ(g): return pd.Series(dict(n=len(g), fail=g.fail3.mean()*100, fwd10=g.fwd10.mean(),
                                   win10=(g.fwd10 > 0).mean()*100))
out = []
def show(title, df):
    t = f"\n### {title}\n" + df.round(1).to_string(); print(t); out.append(t)

for dr in ("long", "short"):
    S = R[R.dir == dr]
    show(f"{dr.upper()} baseline", summ(S).to_frame().T)
    for col in ("sep", "punch", "approach", "depth"):
        b = pd.qcut(S[col], 5, duplicates="drop")
        show(f"{dr} by {col} (quintiles)", S.groupby(b, observed=True).apply(summ))
    W = S.dropna(subset=["whip"])
    show(f"{dr} by ticker whipsaw rate", W.groupby(pd.cut(W.whip, [-.01,.2,.35,.5,1.01]), observed=True).apply(summ))
    show(f"{dr} by WaveTrend aligned / recent WT cross",
         S.groupby(["wt_aligned", "wt_recent"]).apply(summ))

open(os.path.join(HERE, "RESULTS_raw.txt"), "w").write("\n".join(out))
