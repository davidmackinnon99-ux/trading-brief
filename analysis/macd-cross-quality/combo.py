"""Combination rules on crosses.csv (from cross_quality.py)."""
import os, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
R = pd.read_csv(os.path.join(HERE, "crosses.csv"))
def s(g, lab): print(f"{lab:48s} n={len(g):5d} kept={len(g)/len(base)*100:5.1f}%  fail={g.fail3.mean()*100:5.1f}%  fwd10={g.fwd10.mean():+.2f}%  win10={(g.fwd10>0).mean()*100:4.1f}%")
for dr in ("long", "short"):
    base = R[R.dir == dr]; print(f"\n{dr.upper()}")
    s(base, "all crosses")
    s(base[base.sep >= 0.22], "sep >= 0.22")
    s(base[base.sep >= 0.35], "sep >= 0.35")
    s(base[(base.sep >= 0.22) & base.wt_aligned], "sep >= 0.22 & WT aligned")
    s(base[(base.sep >= 0.22) & base.wt_aligned & (base.depth < 0)], "sep >= 0.22 & WT aligned & crossed on far side of zero")
    s(base[(base.sep < 0.22) & ~base.wt_aligned], "sep < 0.22 & WT NOT aligned (avoid bucket)")
