"""Student SID journals (Richard, Leen, Cathie, D-Soh) — 2 Oct 2026.
1. Validate the SID Python port against real hand-taken trades.
2. Hand-labelled chart patterns at entry vs results (what the trader saw).
3. Detector-labelled pattern context at entry (Pattern Finder logic) vs results.
Usage: python3 student_study.py <student_trades.csv> <cache dir> <out dir>   (fetches prices via yfinance)"""
import os, sys, time, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
import yfinance as yf
from patterns import detect, NAMES
from sid import sid_trades

SRC, CACHE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(CACHE, exist_ok=True)
T = pd.read_csv(SRC, parse_dates=["entry_date", "exit_date"])
FIX = {"MFST": "MSFT", "AV.": "AV", "EUR/CHF": None}
T["sym"] = T.ticker.map(lambda t: FIX.get(t, t))
T = T[T.sym.notna()].copy()


def get(y):
    f = os.path.join(CACHE, f"{y}.csv")
    if os.path.exists(f):
        return pd.read_csv(f, index_col=0, parse_dates=True)
    for _ in range(3):
        try:
            d = yf.download(y, start="2004-01-01", end="2026-10-02", auto_adjust=False, progress=False)
            if d is not None and len(d) > 250:
                if isinstance(d.columns, pd.MultiIndex):
                    d.columns = d.columns.get_level_values(0)
                d = d[["Open", "High", "Low", "Close", "Volume"]].dropna()
                d.to_csv(f)
                return d
        except Exception:
            pass
        time.sleep(0.5)
    return None


def fit(px, g):
    """share of journal entries within 5% of that day's close"""
    ok = []
    for _, r in g.iterrows():
        i = px.index.searchsorted(r.entry_date)
        if i < len(px):
            ok.append(abs(px.Close.iloc[i] / r.entry - 1) < 0.05)
    return np.mean(ok) if ok else 0


norm = lambda s: ("DB" if "bottom" in s else "DT" if ("top" in s or "dtop" in s) else
                  "IHS" if "ih&s" in s or "inv" in s else "HS" if "h&s" in s or "head" in s else "none")
T["hand"] = T.pattern.fillna("").str.lower().map(norm)
T["has_pattern_col"] = ~((T.student == "Richard") & T.sheet.str.contains("Project B"))

rows, chosen = [], {}
for sym, g in T.groupby("sym"):
    best = None
    for y in (sym, sym + ".L"):
        px = get(y)
        if px is None:
            continue
        sc = fit(px, g)
        if best is None or sc > best[0]:
            best = (sc, y, px)
    if best is None or best[0] < 0.5:
        chosen[sym] = None
        continue
    sc, y, px = best
    chosen[sym] = (y, round(sc, 2))
    O, H, L, C = (px[k].values.astype(float) for k in ("Open", "High", "Low", "Close"))
    D = px.index
    pats, _ = detect(H, L, C)
    gen = sid_trades(O, H, L, C)
    gdates = np.array([D[t["entry_bar"]] for t in gen], dtype="datetime64[ns]")
    gdir = np.array([t["d"] for t in gen])
    for _, r in g.iterrows():
        ei = D.searchsorted(r.entry_date)
        if ei >= len(D):
            continue
        diff = np.abs((gdates - np.datetime64(r.entry_date)) / np.timedelta64(1, "D")) if len(gdates) else np.array([])
        match = bool(((diff <= 3) & (gdir == r.dir)).any()) if len(diff) else False
        ctx, kind = "none", ""
        for p in reversed(pats):
            if p["shown_from"] is None or p["shown_from"] > ei:
                continue
            side = "aligned" if p["dir"] == r.dir else "opposing"
            if p["end"] is None or p["end"] > ei:
                ctx, kind = side + "-forming", NAMES[p["kind"]]; break
            if p["state"] != 1:
                continue
            if ei - p["end"] <= 20:
                ctx, kind = side + "-confirmed", NAMES[p["kind"]]
            break
        hand_al = ("aligned" if (r.hand in ("DB", "IHS") and r.dir == 1) or (r.hand in ("DT", "HS") and r.dir == -1)
                   else "opposing" if r.hand != "none" else "none")
        rows.append(dict(r.to_dict(), yahoo=y, sid_match=match, det_ctx=ctx, det_kind=kind, hand_side=hand_al,
                         win=r.ret > 0, year=D[ei].year))
R = pd.DataFrame(rows)
R.to_csv(os.path.join(OUT, "student_tagged.csv"), index=False)


def st(x):
    return f"{len(x)} / {x.win.mean()*100:.0f}% / {x.ret.mean():+.2f}% / {x.ret.median():+.2f}%" if len(x) else "0"


def tv(a, b):
    if len(a) < 5 or len(b) < 5:
        return "–"
    return f"{(a.ret.mean()-b.ret.mean())/np.sqrt(a.ret.var()/len(a)+b.ret.var()/len(b)):+.1f}"


out = [f"Journal trades priced: {len(R)} of {len(T)} ({R.ticker.nunique()} tickers). Unpriced tickers: "
       f"{sorted(k for k, v in chosen.items() if v is None)}",
       "London listings used: " + ", ".join(f"{k}→{v[0]}" for k, v in chosen.items() if v and v[0].endswith('.L')) + "\n",
       "## 1. SID port validation (generated entry, same direction, within 3 days)\n",
       "| Student | trades | matched |", "|---|---|---|"]
for s, g in R.groupby("student"):
    out.append(f"| {s} | {len(g)} | {g.sid_match.mean()*100:.0f}% |")
out.append(f"| **All** | {len(R)} | {R.sid_match.mean()*100:.0f}% |\n")

P = R[R.has_pattern_col]
out += ["## 2. Hand-labelled pattern at entry (sheets with a pattern column)\n",
        "n / WR / avg / median; t vs no pattern recorded.\n",
        "| Pattern recorded | Longs | t | Shorts | t |", "|---|---|---|---|---|"]
for lab, m in [("none recorded", P.hand == "none"), ("double bottom", P.hand == "DB"), ("inverse H&S", P.hand == "IHS"),
               ("double top", P.hand == "DT"), ("H&S", P.hand == "HS"),
               ("aligned (DB/IHS long, DT/HS short)", P.hand_side == "aligned"),
               ("opposing", P.hand_side == "opposing")]:
    c = []
    for dd in (1, -1):
        Q = P[P.dir == dd]
        a, b = Q[m.loc[Q.index]], Q[Q.hand == "none"]
        c += [st(a), "" if lab == "none recorded" else tv(a, b)]
    out.append(f"| {lab} | {c[0]} | {c[1]} | {c[2]} | {c[3]} |")
out.append("\nBy student, aligned vs none (avg return): " + "; ".join(
    f"{s}: aligned {g[g.hand_side=='aligned'].ret.mean():+.2f}% (n{(g.hand_side=='aligned').sum()}) vs none "
    f"{g[g.hand=='none'].ret.mean():+.2f}% (n{(g.hand=='none').sum()})" for s, g in P.groupby("student")))

out += ["\n## 3. Detector pattern context at entry (Pattern Finder logic)\n",
        "| Context | Longs | t | Shorts | t |", "|---|---|---|---|---|"]
for c_ in ["none", "aligned-forming", "aligned-confirmed", "opposing-forming", "opposing-confirmed"]:
    c = []
    for dd in (1, -1):
        Q = R[R.dir == dd]
        a, b = Q[Q.det_ctx == c_], Q[Q.det_ctx == "none"]
        c += [st(a), "" if c_ == "none" else tv(a, b)]
    out.append(f"| {c_} | {c[0]} | {c[1]} | {c[2]} | {c[3]} |")
# agreement: hand DB/DT vs detector seeing an aligned pattern (forming/confirmed) at entry
H_ = P[P.hand.isin(["DB", "DT"])]
agree = (H_.det_ctx.str.startswith("aligned") & H_.det_kind.isin(["DOUBLE BOTTOM", "DOUBLE TOP"])).mean()
out.append(f"\nDetector agreement: of {len(H_)} trades hand-labelled double bottom/top, the detector showed an aligned "
           f"double bottom/top at entry on {agree*100:.0f}%.")
txt = "\n".join(out)
open(os.path.join(OUT, "STUDENT_raw.md"), "w").write(txt)
print(txt)
