"""Is the SID entry itself at the second bottom/top of a double? Objective, no-hindsight test (2 Oct 2026).
Students label 'double bottom' on SID trades, but when labelling a back-test the chart to the right is
visible: a second low that failed becomes a 'lower low' and never gets called a double bottom. This
test uses only bars up to the entry:
  recent extreme = lowest low (longs) / highest high (shorts) of the 10 bars up to entry;
  a prior swing low/high 5-60 bars before it (3 bars each side), within 0.75 ATR(14) of the recent one,
  with a rally/drop of >= 2 ATR between them and nothing beyond the pair in between.
Run on (a) the generated SID trades and (b) the student journal trades.
Usage: python3 second_test.py <cache_all> <cache_students> <student_tagged.csv> <out dir>"""
import os, sys, glob
import numpy as np, pandas as pd
from sid import sid_trades
from patterns import wilder_atr

CA, CS, STU, OUT = sys.argv[1:5]


def second(H, L, A, ei, d, tol=0.75, depth=2.0):
    lo = max(0, ei - 9)
    if d == 1:
        rb = lo + int(np.argmin(L[lo:ei + 1])); rv = L[rb]
    else:
        rb = lo + int(np.argmax(H[lo:ei + 1])); rv = H[rb]
    a = A[rb]
    if np.isnan(a):
        return False
    for j in range(rb - 5, max(3, rb - 60) - 1, -1):
        if d == 1:
            if L[j] != L[j - 3:j + 4].min() or abs(L[j] - rv) > tol * a:
                continue
            if L[j + 1:rb].min() < min(L[j], rv):
                continue
            if H[j:rb].max() - max(L[j], rv) >= depth * a:
                return True
        else:
            if H[j] != H[j - 3:j + 4].max() or abs(H[j] - rv) > tol * a:
                continue
            if H[j + 1:rb].max() > max(H[j], rv):
                continue
            if min(H[j], rv) - L[j:rb].min() >= depth * a:
                return True
    return False


def st(x):
    return f"{len(x)} / {x.win.mean()*100:.0f}% / {x.ret.mean():+.2f}% / {x.ret.median():+.2f}%" if len(x) else "0"


def tv(a, b):
    return f"{(a.ret.mean()-b.ret.mean())/np.sqrt(a.ret.var()/len(a)+b.ret.var()/len(b)):+.1f}" if min(len(a), len(b)) >= 5 else "–"


# (a) generated SID trades
rows = []
for f in sorted(glob.glob(os.path.join(CA, "*.csv"))):
    px = pd.read_csv(f, index_col=0, parse_dates=True)
    O, H, L, C = (px[k].values.astype(float) for k in ("Open", "High", "Low", "Close"))
    A = wilder_atr(H, L, C, 14)
    for t in sid_trades(O, H, L, C):
        rows.append(dict(d=t["d"], ret=t["ret"], win=t["ret"] > 0, year=px.index[t["entry_bar"]].year,
                         second=second(H, L, A, t["entry_bar"], t["d"])))
G = pd.DataFrame(rows)

# (b) student trades
S = pd.read_csv(STU, parse_dates=["entry_date"])
flags = []
cache = {}
for i, r in S.iterrows():
    if r.yahoo not in cache:
        px = pd.read_csv(os.path.join(CS, f"{r.yahoo}.csv"), index_col=0, parse_dates=True)
        cache[r.yahoo] = (px, wilder_atr(px.High.values, px.Low.values, px.Close.values, 14))
    px, A = cache[r.yahoo]
    ei = px.index.searchsorted(r.entry_date)
    flags.append(second(px.High.values, px.Low.values, A, min(ei, len(px) - 1), r.dir))
S["second"] = flags

out = ["## SID entry at an objective second bottom / top (no hindsight)\n",
       "n / WR / avg / median; t = second vs the rest.\n",
       "| Sample | Longs: at 2nd bottom | Longs: other | t | Shorts: at 2nd top | Shorts: other | t |",
       "|---|---|---|---|---|---|---|"]
for name, X in (("Generated SID (101 tickers)", G), ("Student journals", S)):
    c = []
    for dd in (1, -1):
        Q = X[X.d == dd] if "d" in X else X[X.dir == dd]
        a, b = Q[Q.second], Q[~Q.second]
        c += [st(a), st(b), tv(a, b)]
    out.append(f"| {name} | " + " | ".join(c) + " |")
out.append("\nGenerated, by era (avg return, at 2nd bottom vs other, longs): " + "; ".join(
    f"{lo}-{hi}: {G[(G.d==1)&G.second&(G.year>=lo)&(G.year<=hi)].ret.mean():+.2f}% (n{((G.d==1)&G.second&(G.year>=lo)&(G.year<=hi)).sum()}) vs "
    f"{G[(G.d==1)&~G.second&(G.year>=lo)&(G.year<=hi)].ret.mean():+.2f}%" for lo, hi in ((2005, 2012), (2013, 2019), (2020, 2026))))
P = S[S.has_pattern_col]
lab = P.hand_side == "aligned"
out.append(f"\nStudent hand labels vs objective test: of {lab.sum()} trades labelled with an aligned double/H&S, "
           f"{P[lab].second.mean()*100:.0f}% pass the objective second-bottom/top test; of {(~lab).sum()} not labelled, "
           f"{P[~lab].second.mean()*100:.0f}% pass.")
out.append("Student trades labelled aligned AND passing the objective test: " + st(P[lab & P.second]) +
           " | labelled aligned but failing it: " + st(P[lab & ~P.second]) + " | no label: " + st(P[P.hand == 'none']))
txt = "\n".join(out)
open(os.path.join(OUT, "SECOND_raw.md"), "w").write(txt)
print(txt)
