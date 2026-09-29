"""SID trades vs BigBeluga SMC order blocks / structure at entry (29 Sep 2026).
Usage: python3 smc_study.py <trades_all.csv> <price cache dir> <out dir> [SYMBOL for a quick check]"""
import os, sys
import numpy as np, pandas as pd
from smc import run, rma_atr

TRADES, CACHE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

if len(sys.argv) > 4:                       # quick visual check against a chart
    px = pd.read_csv(os.path.join(CACHE, f"{sys.argv[4]}.csv"), index_col=0, parse_dates=True)
    O, H, L, C = (px[k].values.astype(float) for k in ("Open", "High", "Low", "Close"))
    snaps, trend, us, ds = run(O, H, L, C, [len(C) - 1])
    bl, br = snaps[len(C) - 1]
    print(sys.argv[4], px.index[-1].date(), "trend", trend[-1])
    for b in bl + br:
        print("  %s OB %.2f-%.2f anchored %s created %s" % ("bull" if b["bull"] else "bear", b["btm"], b["top"],
              px.index[b["anchor"]].date(), px.index[b["created"]].date()))
    sys.exit()

t = pd.read_csv(TRADES)
t = t[t.exit_date.notna()].copy()
t["d"] = np.where(t.direction == "long", 1, -1)
t["entry_date"] = pd.to_datetime(t.entry_date)

rows = []
for sym, g in t.groupby("symbol"):
    f = os.path.join(CACHE, f"{sym}.csv")
    if not os.path.exists(f):
        continue
    px = pd.read_csv(f, index_col=0, parse_dates=True)
    dates = px.index.values
    O, H, L, C = (px[k].values.astype(float) for k in ("Open", "High", "Low", "Close"))
    a14 = rma_atr(H, L, C, 14)
    eis = {}
    for _, tr in g.iterrows():
        ei = int(np.searchsorted(dates, np.datetime64(tr.entry_date)))
        if ei < len(C) and abs((dates[ei] - np.datetime64(tr.entry_date)) / np.timedelta64(1, "D")) <= 4 and ei > 400:
            eis[tr.trade_id] = ei
    snaps, trend, ups, dns = run(O, H, L, C, set(eis.values()))
    for _, tr in g.iterrows():
        if tr.trade_id not in eis:
            continue
        ei, d = eis[tr.trade_id], tr.d
        p, a = C[ei], a14[ei]
        bl, br = snaps[ei]
        sup_in = any(b["btm"] <= p <= b["top"] for b in bl)
        sup_near = any(0 < p - b["top"] <= a for b in bl)
        res_in = any(b["btm"] <= p <= b["top"] for b in br)
        res_near = any(0 < b["btm"] - p <= a for b in br)
        if d == 1:
            fav, fav_in, against = sup_in or sup_near, sup_in, res_in or res_near
            sweep = dns[max(0, ei - 2):ei + 1].any()
        else:
            fav, fav_in, against = res_in or res_near, res_in, sup_in or sup_near
            sweep = ups[max(0, ei - 2):ei + 1].any()
        rows.append(dict(trade_id=tr.trade_id, symbol=sym, d=d, ret=tr.return_pct, win=tr.win,
                         year=pd.Timestamp(dates[ei]).year, fav=fav, fav_in=fav_in, against=against,
                         trend_aligned=trend[ei] == d, sweep=bool(sweep)))

R = pd.DataFrame(rows)
R.to_csv(os.path.join(OUT, "smc_tagged.csv"), index=False)


def st(x):
    return f"{len(x)} / {x.win.mean()*100:.0f}% / {x.ret.mean():+.2f}% / {x.ret.median():+.2f}%" if len(x) else "0"


def tval(a, b):
    if len(a) < 5 or len(b) < 5:
        return float("nan")
    return (a.ret.mean() - b.ret.mean()) / np.sqrt(a.ret.var() / len(a) + b.ret.var() / len(b))


out = [f"Trades analysed: {len(R)} (longs {int((R.d==1).sum())}, shorts {int((R.d==-1).sum())}).\n",
       "n / WR / avg / median; t = difference in average vs the rest of that side.\n",
       "| Condition at entry | Longs | t | Shorts | t |", "|---|---|---|---|---|"]
tests = [("All", lambda D: D.index == D.index),
         ("Favourable OB in/within 1 ATR (bull OB under a long, bear OB over a short)", lambda D: D.fav),
         ("  … price inside that OB", lambda D: D.fav_in),
         ("Opposing OB in/within 1 ATR (bear OB over a long, bull OB under a short)", lambda D: D.against),
         ("Favourable OB and no opposing OB", lambda D: D.fav & ~D.against),
         ("No OB near either way", lambda D: ~D.fav & ~D.against),
         ("SMC structure trend aligned with trade", lambda D: D.trend_aligned),
         ("Liquidity sweep in trade direction in last 3 bars", lambda D: D.sweep)]
for name, fn in tests:
    cells = []
    for dd in (1, -1):
        D = R[R.d == dd]
        m = fn(D)
        cells += [st(D[m]), "" if name == "All" else f"{tval(D[m], D[~m]):+.1f}"]
    out.append(f"| {name} | {cells[0]} | {cells[1]} | {cells[2]} | {cells[3]} |")
out.append("\nBy era (avg return, favourable-OB vs rest):\n")
for dd, nm in ((1, "Longs"), (-1, "Shorts")):
    D = R[R.d == dd]
    for lo, hi in ((2005, 2012), (2013, 2019), (2020, 2026)):
        E = D[(D.year >= lo) & (D.year <= hi)]
        out.append(f"- {nm} {lo}-{hi}: favourable {E[E.fav].ret.mean():+.2f}% (n{int(E.fav.sum())}) vs rest "
                   f"{E[~E.fav].ret.mean():+.2f}% (n{int((~E.fav).sum())}); opposing {E[E.against].ret.mean():+.2f}% "
                   f"(n{int(E.against.sum())}) vs rest {E[~E.against].ret.mean():+.2f}%")
txt = "\n".join(out)
open(os.path.join(OUT, "SMC_RESULTS_raw.md"), "w").write(txt)
print(txt)
