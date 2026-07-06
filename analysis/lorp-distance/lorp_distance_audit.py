#!/usr/bin/env python3
"""
lorp_distance_audit.py — LORP entry-extension audit.

For each Buy entry in a LORP per-bar CSV export, records the Distance-from-Kernel
at the signal bar and simulates the v2.11 SYSTEMATIC exit (1.5 ATR hard stop +
1.5 ATR trailing, breakeven OFF, next-bar-open fills) forward to determine the
outcome. This defines win/loss by the systematic rule, not by discretionary
management, so the result measures the ENTRY quality.

Also reports the stop-vs-kernel geometry: an entry D ATR above the kernel with a
stop S ATR below entry leaves the stop (D - S) ATR from the kernel; when D > S the
stop sits ABOVE the kernel and only a partial reversion (fraction S/D) stops out.

Usage: python3 lorp_distance_audit.py FILE1.csv [FILE2.csv ...]
Distance from Kernel is the operative extension axis (confirmed ATR-normalised).
"""
import csv, sys, os

SL_MULT    = 1.5   # hard stop (ATR mult) — matches live + v2.11 default
TRAIL_MULT = 1.5   # trailing stop (ATR mult)
BREAKOUT   = 1.5   # Distance-from-Kernel Breakout threshold (== stop mult by design)

def fnum(x):
    try: return float(x)
    except: return None

def col_index(header):
    """First-occurrence index for each needed column name."""
    idx = {}
    for i, h in enumerate(header):
        if h not in idx:
            idx[h] = i
    return idx

def load(path):
    with open(path) as f:
        rows = list(csv.reader(f))
    return rows[0], rows[1:]

def entry_type(dist):
    if dist is None: return "No data"
    if dist < 0.5:  return "Pullback"
    if dist < 1.5:  return "Trend"
    return "Breakout"

def simulate_exit(bars, idx, entry_i):
    """v2.11 systematic exit from a Buy at bar entry_i. Fill next-bar-open."""
    C = lambda j, name: fnum(bars[j][idx[name]])
    fill_i = entry_i + 1
    if fill_i >= len(bars):
        return None
    entry = C(fill_i, "open")
    atr0  = C(fill_i, "ATR(14)")
    if entry is None or atr0 is None or atr0 == 0:
        return None
    stop = entry - SL_MULT * atr0
    for j in range(fill_i, len(bars)):
        lo = C(j, "low"); op = C(j, "open"); cl = C(j, "close"); atr = C(j, "ATR(14)")
        # gap-down through stop -> fill at open; else at stop
        if lo is not None and lo <= stop:
            exitp = min(op, stop) if op is not None else stop
            ret = (exitp - entry) / entry * 100
            return dict(entry=entry, exit=exitp, exit_date=bars[j][idx["time"]],
                        ret=ret, reason="ATR stop", bars_held=j - fill_i, open=False)
        # ratchet trailing stop
        if cl is not None and atr is not None:
            stop = max(stop, cl - TRAIL_MULT * atr)
    last = len(bars) - 1
    cl = C(last, "close")
    ret = (cl - entry) / entry * 100 if cl is not None else None
    return dict(entry=entry, exit=cl, exit_date=bars[last][idx["time"]],
                ret=ret, reason="OPEN (unrealised)", bars_held=last - fill_i, open=True)

def audit_file(path):
    header, bars = load(path)
    idx = col_index(header)
    ticker = os.path.basename(path).replace("BATS_", "").split("_")[0]
    out = []
    for i, row in enumerate(bars):
        buy = fnum(row[idx["Buy"]])
        if buy is None or buy <= 0:
            continue
        dist = fnum(row[idx["Distance from Kernel"]])
        atr  = fnum(row[idx["ATR(14)"]])
        close= fnum(row[idx["close"]])
        macd = fnum(row[idx["MACD"]]); sig = fnum(row[idx["Signal Line"]])
        adx  = fnum(row[idx["ADX"]])
        kernel = (close - dist * atr) if (close is not None and dist is not None and atr) else None
        rev_frac = (SL_MULT / dist) if (dist and dist > 0) else None  # frac of reversion that stops out
        sim = simulate_exit(bars, idx, i)
        out.append(dict(
            ticker=ticker, date=row[idx["time"]], close=close, dist=dist,
            etype=entry_type(dist), atr=atr, kernel=kernel, adx=adx,
            macd_ok=(macd is not None and sig is not None and macd >= sig),
            rev_frac=rev_frac, sim=sim))
    return out

def main(paths):
    allrows = []
    for p in paths:
        allrows += audit_file(p)
    hdr = f'{"ticker":<6}{"entry date":<12}{"Dist":>6}{"type":>9}{"ADX":>6}{"MACD0":>6}{"revFrac":>8}{"ret%":>8}{"held":>5}{"outcome":>10}  exit'
    print(hdr); print("-"*len(hdr))
    ext_l = ext_w = nonext_l = nonext_w = 0
    ext_rets, nonext_rets = [], []
    for r in sorted(allrows, key=lambda x: (x["ticker"], x["date"])):
        s = r["sim"]
        ret = s["ret"] if s and s["ret"] is not None else float("nan")
        held = s["bars_held"] if s else "-"
        if s is None:
            oc = "no-fill"
        elif s["open"]:
            oc = "OPEN"
        elif s["ret"] is not None and s["ret"] > 0:
            oc = "WIN"
        else:
            oc = "LOSS"
        extended = (r["dist"] is not None and r["dist"] > BREAKOUT)
        if oc in ("WIN", "LOSS"):
            if extended:
                ext_rets.append(s["ret"])
                if oc == "LOSS": ext_l += 1
                else: ext_w += 1
            else:
                nonext_rets.append(s["ret"])
                if oc == "LOSS": nonext_l += 1
                else: nonext_w += 1
        rf = f'{r["rev_frac"]:.2f}' if r["rev_frac"] is not None else "  n/a"
        exit_desc = f'{s["exit_date"]} ({s["reason"]})' if s else "-"
        print(f'{r["ticker"]:<6}{r["date"]:<12}{(r["dist"] if r["dist"] is not None else float("nan")):>6.2f}'
              f'{r["etype"]:>9}{(r["adx"] if r["adx"] is not None else float("nan")):>6.1f}'
              f'{("yes" if r["macd_ok"] else "NO"):>6}{rf:>8}{ret:>8.1f}{held:>5}{oc:>10}  {exit_desc}')
    print("-"*len(hdr))
    def stats(rets):
        n = len(rets); 
        if n == 0: return "n=0"
        wins = [x for x in rets if x > 0]; losses = [x for x in rets if x <= 0]
        exp = sum(rets)/n
        aw = sum(wins)/len(wins) if wins else 0
        al = sum(losses)/len(losses) if losses else 0
        wr = 100*len(wins)/n
        return f'n={n}  WR={wr:.0f}%  avgWin={aw:+.1f}%  avgLoss={al:+.1f}%  expectancy={exp:+.2f}%/trade'
    print(f'Extended (Dist>{BREAKOUT}):     {ext_w} win / {ext_l} loss   {stats(ext_rets)}')
    print(f'Not extended (Dist<={BREAKOUT}):  {nonext_w} win / {nonext_l} loss   {stats(nonext_rets)}')
    print()
    print("CAVEATS: small non-random sample (tickers selected because they held recent losers).")
    print("Systematic outcome != live discretionary result. Winners of an unbiased ticker set needed to confirm.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: lorp_distance_audit.py FILE.csv [...]"); sys.exit(1)
    main(sys.argv[1:])
