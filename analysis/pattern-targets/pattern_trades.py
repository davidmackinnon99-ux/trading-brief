"""Backtest: trade the Pattern Finder (v2.5 rules) patterns directly instead of via SID (2 Oct 2026).
A) Breakout entry  - close of the neckline-break bar.
B) Early entry     - close of the bar the pattern is first detected (second top/bottom confirmed),
                     before the neckline breaks.
Stop = beyond the pattern extreme (lower bottom / higher top / head). Target = neckline at break
(or neckline level for B) +/- k x height, k = 0.5 / 0.75 / 1.0. Time stop 30 bars.
If stop and target are both touched in one bar, the stop is assumed (conservative).
Usage: python3 pattern_trades.py <price cache dir> <out dir>"""
import os, sys, glob
import numpy as np, pandas as pd
from patterns import detect, NAMES, nv

CACHE, OUT = sys.argv[1], sys.argv[2]
KS, TSTOP = (0.5, 0.75, 1.0), 30
RNG = np.random.default_rng(7)
rows = []
for f in sorted(glob.glob(os.path.join(CACHE, "*.csv"))):
    sym = os.path.basename(f)[:-4]
    px = pd.read_csv(f, index_col=0, parse_dates=True)
    H, L, C = (px[k].values.astype(float) for k in ("High", "Low", "Close"))
    pats, _ = detect(H, L, C)
    for p in pats:
        d = p["dir"]
        for mode in ("breakout", "early"):
            if mode == "breakout":
                if p["state"] not in (1, 4) or p["neck_brk"] is None:
                    continue
                e_bar, base = p["end"], p["neck_brk"]
            else:
                if p["shadow"]:
                    continue
                e_bar, base = p["found"], nv(p, p["found"])
            entry, stop = C[e_bar], p["hp"]
            if d * (entry - stop) <= 0:
                continue
            for k in KS:
                tgt = base + d * k * p["height"]
                if d * (tgt - entry) <= 0:
                    continue
                out, x_bar = None, None
                for b in range(e_bar + 1, min(len(C), e_bar + 1 + TSTOP)):
                    hit_stop = L[b] <= stop if d == 1 else H[b] >= stop
                    hit_tgt = H[b] >= tgt if d == 1 else L[b] <= tgt
                    if hit_stop:
                        out, x_bar = stop, b; break
                    if hit_tgt:
                        out, x_bar = tgt, b; break
                if out is None:
                    x_bar = min(len(C) - 1, e_bar + TSTOP)
                    out = C[x_bar]
                ret = d * (out - entry) / entry * 100
                risk = abs(entry - stop) / entry * 100
                # placebo: same stock, 5 random entry bars, same % stop/target distances and time stop
                pr = []
                for e2 in RNG.integers(30, len(C) - TSTOP - 1, 5):
                    en2 = C[e2]; st2 = en2 * (1 - d * risk / 100); tg2 = en2 * (1 + d * abs(tgt - entry) / entry)
                    o2 = None
                    for b in range(e2 + 1, e2 + 1 + TSTOP):
                        if (L[b] <= st2) if d == 1 else (H[b] >= st2):
                            o2 = st2; break
                        if (H[b] >= tg2) if d == 1 else (L[b] <= tg2):
                            o2 = tg2; break
                    if o2 is None:
                        o2 = C[e2 + TSTOP]
                    pr.append(d * (o2 - en2) / en2 * 100 / risk)
                rows.append(dict(sym=sym, kind=NAMES[p["kind"]], mode=mode, k=k, year=px.index[e_bar].year,
                                 ret=ret, R=ret / risk, R_placebo=float(np.mean(pr)), risk=risk, bars=x_bar - e_bar,
                                 exit="target" if out == tgt else "stop" if out == stop else "time"))
R = pd.DataFrame(rows)
R.to_csv(os.path.join(OUT, "pattern_trades.csv"), index=False)


def summ(x):
    w, l = x.ret[x.ret > 0].sum(), -x.ret[x.ret < 0].sum()
    return (f"{len(x)} | {(x.ret>0).mean()*100:.0f}% | {x.ret.mean():+.2f}% | {x.R.mean():+.2f}R | "
            f"{w/l if l else float('inf'):.2f} | {(x.exit=='target').mean()*100:.0f}% / {(x.exit=='stop').mean()*100:.0f}% | {x.bars.mean():.0f} | "
            f"{x.R_placebo.mean():+.2f}R | {x.R.mean()-x.R_placebo.mean():+.2f}R (t {(x.R-x.R_placebo).mean()/((x.R-x.R_placebo).std()/np.sqrt(len(x))):+.1f})")


out = ["| Pattern | Entry | Target | n | WR | avg | avg R | PF | target / stop hit | bars | placebo R | edge vs placebo |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
for kind in ("DOUBLE BOTTOM", "DOUBLE TOP", "INV H&S", "H&S"):
    for mode in ("breakout", "early"):
        for k in KS:
            x = R[(R.kind == kind) & (R["mode"] == mode) & (R.k == k)]
            if len(x):
                out.append(f"| {kind} | {mode} | {int(k*100)}% | {summ(x)} |")
out.append("\nBy era, double patterns, breakout entry, 100% target (avg return):")
for kind in ("DOUBLE BOTTOM", "DOUBLE TOP"):
    x = R[(R.kind == kind) & (R["mode"] == "breakout") & (R.k == 1.0)]
    out.append(f"- {kind}: " + ", ".join(f"{lo}-{hi} {x[(x.year>=lo)&(x.year<=hi)].ret.mean():+.2f}% (n{((x.year>=lo)&(x.year<=hi)).sum()})"
                                         for lo, hi in ((2005, 2012), (2013, 2019), (2020, 2026))))
txt = "\n".join(out)
open(os.path.join(OUT, "PATTERN_TRADES_raw.md"), "w").write(txt)
print(txt)
