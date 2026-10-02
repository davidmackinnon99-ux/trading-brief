"""SID (generated, v10.5.18 rules) x chart patterns (Pattern Finder v2.7-equivalent states) — 2 Oct 2026.
Tests David's watchlist idea: note a double bottom/top when it forms, then take the SID signal if one
comes while the pattern is still live. Also validates the generated SID trades against trades_all.csv.
Usage: python3 sid_pattern_study.py <price cache dir> <trades_all.csv> <out dir>"""
import os, sys, glob
import numpy as np, pandas as pd
from patterns import detect, NAMES
from sid import sid_trades

CACHE, TRADES, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ACTIVE, TGT_WIN = 20, 20
rows = []
for f in sorted(glob.glob(os.path.join(CACHE, "*.csv"))):
    sym = os.path.basename(f)[:-4]
    px = pd.read_csv(f, index_col=0, parse_dates=True)
    O, H, L, C = (px[k].values.astype(float) for k in ("Open", "High", "Low", "Close"))
    D = px.index
    pats, _ = detect(H, L, C)
    for t in sid_trades(O, H, L, C):
        ei, d = t["entry_bar"], t["d"]
        # pattern context as the chart showed it at the entry bar (most recent visible pattern first)
        ctx, kind, age = "none", "", np.nan
        for p in reversed(pats):
            if p["shown_from"] is None or p["shown_from"] > ei:
                continue
            forming = p["end"] is None or p["end"] > ei
            side = "aligned" if p["dir"] == d else "opposing"
            if forming:
                ctx, kind, age = side + "-forming", NAMES[p["kind"]], ei - p["found"]
                break
            if p["state"] != 1:                    # failed / never broken / superseded: panel skips it
                continue
            if ei - p["end"] <= ACTIVE:
                ctx, kind, age = side + "-confirmed", NAMES[p["kind"]], ei - p["end"]
            break
        rows.append(dict(sym=sym, d=d, entry_date=D[ei].date(), exit_date=D[t["exit_bar"]].date(),
                         year=D[ei].year, ret=t["ret"], win=t["ret"] > 0, reason=t["reason"],
                         ctx=ctx, kind=kind, age=age))
R = pd.DataFrame(rows)
R.to_csv(os.path.join(OUT, "sid_generated_trades.csv"), index=False)

# ---- validation against the recorded SID trades (journal symbols only)
J = pd.read_csv(TRADES)
J["d"] = np.where(J.direction == "long", 1, -1)
J["entry_date"] = pd.to_datetime(J.entry_date).dt.date
G = R.copy()
val = []
for sym, g in J.groupby("symbol"):
    gen = G[G.sym == sym]
    if gen.empty:
        continue
    gd = pd.to_datetime(gen.entry_date).values
    for _, tr in g.iterrows():
        diff = np.abs((gd - np.datetime64(tr.entry_date)) / np.timedelta64(1, "D"))
        ok = (diff <= 3) & (gen.d.values == tr.d)
        val.append(ok.any())
match = np.mean(val) if val else float("nan")

out = [f"Generated SID trades: {len(R)} on {R.sym.nunique()} symbols ({(R.d==1).sum()} long, {(R.d==-1).sum()} short), "
       f"{R.entry_date.min()} to {R.entry_date.max()}.",
       f"Generated trades overall: longs WR {R[R.d==1].win.mean()*100:.0f}% avg {R[R.d==1].ret.mean():+.2f}%; "
       f"shorts WR {R[R.d==-1].win.mean()*100:.0f}% avg {R[R.d==-1].ret.mean():+.2f}%.",
       f"Validation: {match*100:.0f}% of the {len(val)} recorded trades in trades_all.csv have a generated SID entry "
       f"in the same direction within 3 days (recorded trades come from older strategy versions/settings).\n"]


def st(x):
    return f"{len(x)} / {x.win.mean()*100:.0f}% / {x.ret.mean():+.2f}% / {x.ret.median():+.2f}%" if len(x) else "0"


def tv(a, b):
    if len(a) < 5 or len(b) < 5:
        return float("nan")
    return (a.ret.mean() - b.ret.mean()) / np.sqrt(a.ret.var() / len(a) + b.ret.var() / len(b))


out += ["n / WR / avg / median; t vs SID trades with no pattern showing.\n",
        "| Pattern showing at SID entry | Longs | t | Shorts | t |", "|---|---|---|---|---|"]
for c in ["none", "aligned-forming", "aligned-confirmed", "opposing-forming", "opposing-confirmed"]:
    cells = []
    for dd in (1, -1):
        Dd = R[R.d == dd]
        a, b = Dd[Dd.ctx == c], Dd[Dd.ctx == "none"]
        cells += [st(a), "" if c == "none" else f"{tv(a, b):+.1f}"]
    out.append(f"| {c} | {cells[0]} | {cells[1]} | {cells[2]} | {cells[3]} |")
out.append("\nBy pattern type (aligned = double bottom / inv H&S for longs, double top / H&S for shorts):\n")
out.append("| Context | Pattern | Longs | Shorts |\n|---|---|---|---|")
for c in ["aligned-forming", "aligned-confirmed", "opposing-forming", "opposing-confirmed"]:
    for k in ["DOUBLE BOTTOM", "INV H&S", "DOUBLE TOP", "H&S"]:
        a1, a2 = R[(R.d == 1) & (R.ctx == c) & (R.kind == k)], R[(R.d == -1) & (R.ctx == c) & (R.kind == k)]
        if len(a1) + len(a2):
            out.append(f"| {c} | {k} | {st(a1)} | {st(a2)} |")
out.append("\nBy era, longs (avg return): " + "; ".join(
    f"{lo}-{hi}: none {R[(R.d==1)&(R.ctx=='none')&(R.year>=lo)&(R.year<=hi)].ret.mean():+.2f}%, "
    f"aligned-forming {R[(R.d==1)&(R.ctx=='aligned-forming')&(R.year>=lo)&(R.year<=hi)].ret.mean():+.2f}% "
    f"(n{((R.d==1)&(R.ctx=='aligned-forming')&(R.year>=lo)&(R.year<=hi)).sum()})"
    for lo, hi in ((2005, 2012), (2013, 2019), (2020, 2026))))
txt = "\n".join(out)
open(os.path.join(OUT, "SID_PATTERN_raw.md"), "w").write(txt)
print(txt)
