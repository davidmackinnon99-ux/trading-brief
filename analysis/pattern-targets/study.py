"""Pattern study on the SID trade set (28 Sep 2026).
A. Chart-pattern context at entry (SID Pattern Finder v2.5 rules, what the panel would have shown).
B. Pattern-based exits: measured-move target (50/75/100%) and opposing-pattern confirmation.
C. Entry candle patterns from the masterclass (Caginalp & Laurent 1998): Three Inside/Outside Up/Down,
   Three White Soldiers / Black Crows, Morning / Evening Star, completing on or up to 2 bars before entry.
Usage: python3 study.py <trades_all.csv> <cache dir> <out dir>"""
import os, sys
import numpy as np, pandas as pd
from patterns import detect, NAMES

TRADES, CACHE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
KS = (0.5, 0.75, 1.0)
ACTIVE = 20  # confirmed pattern counts as active for this many bars (indicator default)

t = pd.read_csv(TRADES)
t = t[t.exit_date.notna()].copy()
t["d"] = np.where(t.direction == "long", 1, -1)
t["entry_date"] = pd.to_datetime(t.entry_date)
t["exit_date"] = pd.to_datetime(t.exit_date)


# ---------------------------------------------------------------- candle patterns
def candles(O, H, L, C, atr):
    n = len(C)
    body = np.abs(C - O)
    avgb = pd.Series(body).rolling(10).mean().shift(1).values
    bull = {k: np.zeros(n, bool) for k in ("TIU", "TOU", "3WS", "MS")}
    bear = {k: np.zeros(n, bool) for k in ("TID", "TOD", "3BC", "ES")}
    for i in range(8, n):
        a, b, c = i - 2, i - 1, i
        down = C[a - 1] < C[a - 6]
        up = C[a - 1] > C[a - 6]
        if down:
            bull["TIU"][i] = O[a] > C[a] and O[a] >= O[b] > C[a] and O[a] > C[b] >= C[a] and C[c] > O[c] and C[c] > O[a]
            bull["TOU"][i] = O[a] > C[a] and C[b] >= O[a] > C[a] >= O[b] and body[b] > body[a] and C[c] > O[c] and C[c] > C[b]
            bull["3WS"][i] = all(C[x] > O[x] for x in (a, b, c)) and C[a] < C[b] < C[c] and O[a] <= O[b] <= C[a] and O[b] <= O[c] <= C[b]
            bull["MS"][i] = O[a] > C[a] and body[a] > avgb[i] and max(O[b], C[b]) < C[a] and body[b] < 0.5 * body[a] \
                and C[c] > O[c] and C[c] > (O[a] + C[a]) / 2
        if up:
            bear["TID"][i] = C[a] > O[a] and C[a] > O[b] >= O[a] and C[a] >= C[b] > O[a] and O[c] > C[c] and C[c] < O[a]
            bear["TOD"][i] = C[a] > O[a] and O[b] >= C[a] > O[a] >= C[b] and body[b] > body[a] and O[c] > C[c] and C[c] < C[b]
            bear["3BC"][i] = all(O[x] > C[x] for x in (a, b, c)) and C[a] > C[b] > C[c] and C[a] <= O[b] <= O[a] and C[b] <= O[c] <= O[b]
            bear["ES"][i] = C[a] > O[a] and body[a] > avgb[i] and min(O[b], C[b]) > C[a] and body[b] < 0.5 * body[a] \
                and O[c] > C[c] and C[c] < (O[a] + C[a]) / 2
    return bull, bear


# ---------------------------------------------------------------- per-symbol processing
rows = []
for sym, g in t.groupby("symbol"):
    f = os.path.join(CACHE, f"{sym}.csv")
    if not os.path.exists(f):
        continue
    px = pd.read_csv(f, index_col=0, parse_dates=True)
    dates = px.index.values
    O, H, L, C = (px[k].values.astype(float) for k in ("Open", "High", "Low", "Close"))
    pats, atr = detect(H, L, C)
    bull, bear = candles(O, H, L, C, atr)

    for _, tr in g.iterrows():
        d = tr.d
        ei = int(np.searchsorted(dates, np.datetime64(tr.entry_date)))
        xi = int(np.searchsorted(dates, np.datetime64(tr.exit_date), side="right")) - 1
        if ei >= len(C) or xi <= ei or abs((dates[ei] - np.datetime64(tr.entry_date)) / np.timedelta64(1, "D")) > 4:
            continue
        # price-level check (trades were recorded on TradingView; bars here from Yahoo)
        fac = tr.entry_price / C[ei]
        if abs(fac - 1) > 0.03:
            fac2 = tr.entry_price / O[ei]
            fac = fac2 if abs(fac2 - 1) < abs(fac - 1) else fac
        scale_ok = abs(fac - 1) <= 0.03 or os.environ.get("STUDY_NOSCALE") == "1"
        entry = tr.entry_price
        r = dict(trade_id=tr.trade_id, symbol=sym, d=d, ret=tr.return_pct, win=tr.win, scale_ok=scale_ok,
                 bars_held=xi - ei)

        # ---- A. context at entry: mirror the indicator's status panel
        ctx, ctx_kind = "none", ""
        for p in reversed(pats):
            if p["shown_from"] is None or p["shown_from"] > ei:
                continue
            forming = p["end"] is None or p["end"] > ei
            if forming:
                ctx, ctx_kind = ("aligned" if p["dir"] == d else "opposing") + "-forming", NAMES[p["kind"]]
                break
            if p["state"] == 1:
                if ei - p["end"] <= ACTIVE:
                    ctx, ctx_kind = ("aligned" if p["dir"] == d else "opposing") + "-confirmed", NAMES[p["kind"]]
                    ctx_pat = p
                break
        r.update(ctx=ctx, ctx_kind=ctx_kind)

        # ---- B. exits (only where our bars line up with the trade's prices)
        path = range(ei + 1, xi)          # strictly between entry and exit bars
        events = []                      # (bar, return%) per rule
        if scale_ok:
            def target_hit(p, k, start):
                tk = (p["neck_brk"] + d * k * p["height"]) * fac
                if d * (tk - entry) <= 0:
                    return "passed"
                for b in range(start, xi):
                    if (H[b] * fac >= tk) if d == 1 else (L[b] * fac <= tk):
                        return (b, d * (tk - entry) / entry * 100)
                return None
            # aligned pattern confirmed within ACTIVE bars before entry, or confirmed during the trade
            aligned = [p for p in pats if p["dir"] == d and p["state"] in (1, 4) and p["neck_brk"] is not None
                       and p["shown_from"] is not None and ei - ACTIVE <= p["end"] < xi]
            for k in KS:
                best = None
                for p in aligned:
                    res = target_hit(p, k, max(ei + 1, p["end"] + 1))
                    if isinstance(res, tuple) and (best is None or res[0] < best[0]):
                        best = res
                    if res == "passed":
                        r[f"passed_{k}"] = True
                r[f"tgt_{k}"] = best
            # opposing pattern confirmed during the trade -> exit at that bar's close
            opp = [p for p in pats if p["dir"] == -d and p["state"] in (1, 4) and p["neck_brk"] is not None
                   and p["shown_from"] is not None and ei < p["end"] < xi]
            if opp:
                b = min(p["end"] for p in opp)
                r["opp_exit"] = (b, d * (C[b] * fac - entry) / entry * 100)

        # ---- C. entry candle patterns completing on entry bar or up to 2 bars before
        win3 = range(max(0, ei - 2), ei + 1)
        al = bull if d == 1 else bear
        op = bear if d == 1 else bull
        r["cand_aligned"] = ",".join(k for k, v in al.items() if any(v[x] for x in win3))
        r["cand_opposing"] = ",".join(k for k, v in op.items() if any(v[x] for x in win3))
        rows.append(r)

R = pd.DataFrame(rows)
for c in [f"tgt_{k}" for k in KS] + [f"passed_{k}" for k in KS] + ["opp_exit"]:
    if c not in R:
        R[c] = None
R.to_pickle(os.path.join(OUT, "tagged.pkl"))


# ---------------------------------------------------------------- reporting
def stats(df):
    if len(df) == 0:
        return "0 | – | –"
    return f"{len(df)} | {df.win.mean()*100:.0f}% | {df.ret.mean():+.2f}%"


out = []
P = out.append
side = {1: "Long", -1: "Short"}
P(f"Trades analysed: {len(R)} (of {len(t)} with an exit date); price levels line up on {R.scale_ok.sum()}.\n")

P("## A. Chart-pattern context at entry (what the indicator panel would have shown)\n")
P("| Context | Longs: n / WR / avg | Shorts: n / WR / avg |\n|---|---|---|")
for c in ["none", "aligned-forming", "aligned-confirmed", "opposing-forming", "opposing-confirmed"]:
    P(f"| {c} | {stats(R[(R.ctx==c)&(R.d==1)])} | {stats(R[(R.ctx==c)&(R.d==-1)])} |")
P("\n'aligned' = pattern points the same way as the trade (e.g. double bottom / inverse H&S for a long).\n")

P("## B. Pattern-based exits (trades whose price levels line up)\n")
S = R[R.scale_ok].copy()
P("Rule: exit at the pattern's measured-move target (scaled 50/75/100%) when an aligned pattern confirmed "
  "within 20 bars before entry or during the trade; separately, exit at the close of the bar an opposing "
  "pattern confirms during the trade. Target touches on the actual exit bar are ignored (order unknown).\n")
P("| Rule | Trades triggered | Their actual avg | With rule avg | WR actual → rule | All-trade avg: actual → rule |\n|---|---|---|---|---|---|")
for dd in (1, -1):
    D = S[S.d == dd]
    for name in [f"tgt_{k}" for k in KS] + ["opp_exit"]:
        trig = D[D[name].apply(lambda v: isinstance(v, tuple))]
        newr = trig[name].apply(lambda v: v[1])
        allnew = D.ret.copy()
        allnew.loc[trig.index] = newr
        label = {"tgt_0.5": "Target 50%", "tgt_0.75": "Target 75%", "tgt_1.0": "Target 100%", "opp_exit": "Opposing pattern confirms"}[name]
        if len(trig):
            P(f"| {side[dd]} · {label} | {len(trig)} | {trig.ret.mean():+.2f}% | {newr.mean():+.2f}% | "
              f"{trig.win.mean()*100:.0f}% → {(newr>0).mean()*100:.0f}% | {D.ret.mean():+.2f}% → {allnew.mean():+.2f}% |")
        else:
            P(f"| {side[dd]} · {label} | 0 | – | – | – | – |")
    # combined: earliest of target-100 and opposing
    for k in KS:
        name = f"tgt_{k}"
        def first(row):
            ev = [v for v in (row[name], row["opp_exit"]) if isinstance(v, tuple)]
            return min(ev)[1] if ev else np.nan
        comb = D.apply(first, axis=1)
        m = comb.notna()
        allnew = D.ret.where(~m, comb)
        P(f"| {side[dd]} · Target {int(k*100)}% + opposing exit (earliest) | {m.sum()} | "
          f"{D.ret[m].mean():+.2f}% | {comb[m].mean():+.2f}% | {D.win[m].mean()*100:.0f}% → {(comb[m]>0).mean()*100:.0f}% | "
          f"{D.ret.mean():+.2f}% → {allnew.mean():+.2f}% |")
P("")
for k in KS:
    c = f"passed_{k}"
    P(f"- Target {int(k*100)}% already passed at entry (rule not applicable): {(S[c] == True).sum()} trades")

P("\n## C. Entry candle patterns (masterclass set) on the entry bar or up to 2 bars before\n")
P("| Group | Longs: n / WR / avg | Shorts: n / WR / avg |\n|---|---|---|")
for lab, m in [("No candle pattern", (R.cand_aligned == "") & (R.cand_opposing == "")),
               ("Aligned pattern present", R.cand_aligned != ""),
               ("Opposing pattern present", R.cand_opposing != "")]:
    P(f"| {lab} | {stats(R[m & (R.d==1)])} | {stats(R[m & (R.d==-1)])} |")
P("\nBy individual aligned pattern:\n\n| Pattern | Longs | Shorts |\n|---|---|---|")
for k in ("TIU", "TOU", "3WS", "MS", "TID", "TOD", "3BC", "ES"):
    m = R.cand_aligned.str.contains(k)
    P(f"| {k} | {stats(R[m & (R.d==1)])} | {stats(R[m & (R.d==-1)])} |")

txt = "\n".join(out)
open(os.path.join(OUT, "RESULTS_raw.md"), "w").write(txt)
print(txt)
