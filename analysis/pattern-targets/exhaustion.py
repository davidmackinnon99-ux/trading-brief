"""Target exhaustion & pattern follow-through (2 Oct 2026) — David's hypothesis:
patterns run to their measured-move target, price then reverses, and that reversal is where SID fires.
A) SID trades (generated, 101 tickers; and student journals) classified by the most recent pattern
   pointing AGAINST the trade: target reached in the last 15 bars before entry ('exhausted') vs
   confirmed but target not reached vs no such pattern.
B) After a neckline break: forward return in the pattern's direction at 10/20/40/60 bars, minus the
   same stock's average forward return over the same horizon (drift-adjusted).
C) After the target is first reached: forward return in the OPPOSITE direction at 5/10/20 bars,
   drift-adjusted — does price reverse at the target more than normal?
Usage: python3 exhaustion.py <cache_all> <cache_students> <student_tagged.csv> <out dir>"""
import os, sys, glob
import numpy as np, pandas as pd
from patterns import detect, NAMES
from sid import sid_trades

CA, CS, STU, OUT = sys.argv[1:5]
WIN = 15


def reach_bar(p, H, L):
    if p["brk"] is None or p["tgt"] is None:
        return None
    for b in range(p["brk"] + 1, min(len(H), p["brk"] + 121)):
        if (H[b] >= p["tgt"]) if p["dir"] == 1 else (L[b] <= p["tgt"]):
            return b
    return None


def classify(pats, reach, ei, d):
    best = "none"
    for p, rb in zip(pats, reach):
        if p["dir"] != -d or p["brk"] is None or p["brk"] > ei:
            continue
        if rb is not None and rb <= ei and ei - rb <= WIN:
            return "exhausted"                                   # opposing pattern hit target recently
        if rb is None or rb > ei:
            if ei - p["brk"] <= 40:
                best = "opp-confirmed, target not reached"
    return best


def fwd(C, i, h):
    return (C[i + h] / C[i] - 1) * 100 if i + h < len(C) else np.nan


rowsA, rowsB, rowsC = [], [], []
for f in sorted(glob.glob(os.path.join(CA, "*.csv"))):
    sym = os.path.basename(f)[:-4]
    px = pd.read_csv(f, index_col=0, parse_dates=True)
    O, H, L, C = (px[k].values.astype(float) for k in ("Open", "High", "Low", "Close"))
    pats, _ = detect(H, L, C)
    reach = [reach_bar(p, H, L) for p in pats]
    base = {h: np.nanmean([fwd(C, i, h) for i in range(0, len(C) - h)]) for h in (5, 10, 20, 40, 60)}
    for t in sid_trades(O, H, L, C):
        rowsA.append(dict(src="generated", d=t["d"], ret=t["ret"], win=t["ret"] > 0,
                          year=px.index[t["entry_bar"]].year, cls=classify(pats, reach, t["entry_bar"], t["d"])))
    for p, rb in zip(pats, reach):
        if p["brk"] is None:
            continue
        r = dict(sym=sym, kind=NAMES[p["kind"]])
        for h in (10, 20, 40, 60):
            r[f"f{h}"] = p["dir"] * (fwd(C, p["brk"], h) - base[h])
        rowsB.append(r)
        if rb is not None:
            rc = dict(sym=sym, kind=NAMES[p["kind"]], bars_to_target=rb - p["brk"])
            for h in (5, 10, 20):
                rc[f"r{h}"] = -p["dir"] * (fwd(C, rb, h) - base[h])
            rowsC.append(rc)

# student trades
S = pd.read_csv(STU, parse_dates=["entry_date"])
cache = {}
for _, r in S.iterrows():
    if r.yahoo not in cache:
        px = pd.read_csv(os.path.join(CS, f"{r.yahoo}.csv"), index_col=0, parse_dates=True)
        H, L, C = px.High.values, px.Low.values, px.Close.values
        pats, _ = detect(H, L, C)
        cache[r.yahoo] = (px, pats, [reach_bar(p, H, L) for p in pats])
    px, pats, reach = cache[r.yahoo]
    ei = min(px.index.searchsorted(r.entry_date), len(px) - 1)
    rowsA.append(dict(src="students", d=r.dir, ret=r.ret, win=r.ret > 0, year=r.entry_date.year,
                      cls=classify(pats, reach, ei, r.dir)))

A, B, Cc = pd.DataFrame(rowsA), pd.DataFrame(rowsB), pd.DataFrame(rowsC)


def st(x):
    return f"{len(x)} / {x.win.mean()*100:.0f}% / {x.ret.mean():+.2f}% / {x.ret.median():+.2f}%" if len(x) else "0"


def tv(a, b):
    return f"{(a.ret.mean()-b.ret.mean())/np.sqrt(a.ret.var()/len(a)+b.ret.var()/len(b)):+.1f}" if min(len(a), len(b)) >= 5 else "–"


def tm(x):
    x = x.dropna()
    return f"{x.mean():+.2f}% (t {x.mean()/(x.std()/np.sqrt(len(x))):+.1f})" if len(x) > 5 else "–"


out = ["## A. SID trades against a pattern that recently hit its target\n",
       "'exhausted' = a pattern pointing against the trade reached its measured-move target within the 15 bars "
       "before entry (e.g. double top hits target, SID long fires). n / WR / avg / median; t vs no opposing pattern.\n",
       "| Sample | Class | Longs | t | Shorts | t |", "|---|---|---|---|---|---|"]
for src in ("generated", "students"):
    for c in ("none", "opp-confirmed, target not reached", "exhausted"):
        cells = []
        for dd in (1, -1):
            Q = A[(A.src == src) & (A.d == dd)]
            a, b = Q[Q.cls == c], Q[Q.cls == "none"]
            cells += [st(a), "" if c == "none" else tv(a, b)]
        out.append(f"| {src} | {c} | " + " | ".join(cells) + " |")
G = A[(A.src == "generated") & (A.cls == "exhausted")]
out.append("\nGenerated 'exhausted' by era (avg, longs / shorts): " + "; ".join(
    f"{lo}-{hi}: {G[(G.d==1)&(G.year>=lo)&(G.year<=hi)].ret.mean():+.2f}% (n{((G.d==1)&(G.year>=lo)&(G.year<=hi)).sum()}) / "
    f"{G[(G.d==-1)&(G.year>=lo)&(G.year<=hi)].ret.mean():+.2f}% (n{((G.d==-1)&(G.year>=lo)&(G.year<=hi)).sum()})"
    for lo, hi in ((2005, 2012), (2013, 2019), (2020, 2026))))

out += ["\n## B. Follow-through after a neckline break, in the pattern's direction, drift-adjusted\n",
        "| Pattern | n | 10 bars | 20 bars | 40 bars | 60 bars |", "|---|---|---|---|---|---|"]
for k, g in B.groupby("kind"):
    out.append(f"| {k} | {len(g)} | {tm(g.f10)} | {tm(g.f20)} | {tm(g.f40)} | {tm(g.f60)} |")
out += ["\n## C. Reversal after the target is first reached (move against the pattern), drift-adjusted\n",
        "| Pattern | n reached | median bars break→target | 5 bars | 10 bars | 20 bars |", "|---|---|---|---|---|---|"]
for k, g in Cc.groupby("kind"):
    out.append(f"| {k} | {len(g)} | {g.bars_to_target.median():.0f} | {tm(g.r5)} | {tm(g.r10)} | {tm(g.r20)} |")
txt = "\n".join(out)
open(os.path.join(OUT, "EXHAUSTION_raw.md"), "w").write(txt)
print(txt)
