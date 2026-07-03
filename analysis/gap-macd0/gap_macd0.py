#!/usr/bin/env python3
"""
gap_macd0.py — Reproduce the gap-to-signal (MACD0) vs win-rate / avg-return analysis.

Reproducible bundle: this script + its input CSV + its output live together in
analysis/gap-macd0/. A chart PNG alone is not verifiable; this is.

INPUT  : data/trades/trades_all.csv (one row per trade). Required columns:
         direction (long|short), return_pct (signed %), win (0|1),
         macd0_pct (MACD - signal, % of price), gap_atr ((open-prev_close)/ATR).
USAGE  : python3 gap_macd0.py [path/to/trades_all.csv] [--markdown out.md]

WHAT IT DOES
  Splits by direction, buckets by the gap variable exactly like the reference chart
  (wrong side / 0-.25 / .25-.5 / .5-.75 / .75-1 / >1), and reports N, win rate,
  and average return per bucket. Does the same for gap_atr as a cross-check.

SIGN CONVENTION (the one thing to verify against your chart)
  MACD0_IS_RAW = True  -> macd0_pct is raw (MACD - signal), NOT sign-normalised.
    The chart's main axis is "gap ABOVE signal" (shorts) / "gap BELOW signal" (longs),
    so the favourable magnitude axis is:  shorts: +macd0 ,  longs: -macd0.
    "wrong side" = the opposite sign.
  If instead your export already flipped the sign so positive == favourable for the
  trade's own direction, set MACD0_IS_RAW = False and both directions bucket on +macd0.
  Either way, compare the per-bucket N below to your chart's N to confirm which is right.
"""
import sys, pandas as pd, numpy as np

MACD0_IS_RAW = False                      # see docstring; flip if N doesn't match chart
# NOTE (set by the merge pipeline, not a guess): data/trades/trades_all.csv is built by
# Indicators/analysis/merge_trades.py, which ALREADY sign-normalises macd0_pct so that
# positive == favourable for the trade's own direction (see data/trades/README.md in the
# Indicators repo for the formula). Running this with MACD0_IS_RAW=True would flip longs
# a second time and invert their bucketing. Leave this False for trades_all.csv as merged
# today; re-check if the merge script's convention ever changes.
EDGES  = [0.0, 0.25, 0.5, 0.75, 1.0]      # favourable-side magnitude cut points
LABELS = ["0-.25", ".25-.5", ".5-.75", ".75-1", ">1"]
BUCKET_ORDER = ["wrong side"] + LABELS


def favourable_gap(df):
    """Signed gap on the chart's favourable axis. >=0 means it's on the main axis;
    <0 means 'wrong side'."""
    g = df["macd0_pct"].astype(float).copy()
    if MACD0_IS_RAW:
        # shorts favour +macd0 (above signal); longs favour -macd0 (below signal)
        flip = df["direction"].str.lower().eq("long")
        g = np.where(flip, -g, g)
    return pd.Series(g, index=df.index)


def bucket(signed):
    if signed < 0:
        return "wrong side"
    m = abs(signed)
    for edge, lab in zip(EDGES[1:], LABELS[:-1]):
        if m < edge:
            return lab
    return ">1"


def summarise(df, value_col, direction_aware):
    if direction_aware:
        signed = favourable_gap(df)
    else:  # gap_atr: magnitude only, no favourable side
        signed = df[value_col].abs()
    b = signed.apply(bucket) if direction_aware else pd.cut(
        signed, bins=EDGES + [np.inf], labels=LABELS, right=False, include_lowest=True
    ).astype(str)
    tmp = df.assign(_bucket=b)
    rows = []
    for lab in (BUCKET_ORDER if direction_aware else LABELS):
        sub = tmp[tmp["_bucket"] == lab]
        if len(sub) == 0:
            rows.append((lab, 0, None, None, None)); continue
        rows.append((lab, len(sub),
                     100 * sub["win"].mean(),
                     sub["return_pct"].mean(),
                     sub["return_pct"].median()))
    return rows


def print_table(title, rows):
    print(f"\n{title}")
    print(f"  {'bucket':<11} {'N':>5} {'win%':>7} {'avg_ret%':>9} {'med_ret%':>9}")
    for lab, n, wr, ar, med in rows:
        wr_s = f"{wr:6.1f}" if wr is not None else "     -"
        ar_s = f"{ar:+8.2f}" if ar is not None else "       -"
        med_s = f"{med:+8.2f}" if med is not None else "       -"
        print(f"  {lab:<11} {n:>5} {wr_s:>7} {ar_s:>9} {med_s:>9}")


def main():
    path = "data/trades/trades_all.csv"
    md_out = None
    args = sys.argv[1:]
    if args and not args[0].startswith("--"):
        path = args[0]
    if "--markdown" in args:
        md_out = args[args.index("--markdown") + 1]

    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    df["direction"] = df["direction"].str.lower()
    for col in ("return_pct", "win", "macd0_pct", "gap_atr"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    print(f"loaded {len(df)} trades from {path}  "
          f"(long={sum(df.direction=='long')}, short={sum(df.direction=='short')})")
    print(f"MACD0_IS_RAW = {MACD0_IS_RAW}")

    report = {}
    print("\n===== MACD0 gap =====")
    for d in ("short", "long"):
        sub = df[df.direction == d]
        if len(sub) == 0:
            print(f"\n{d.upper()}: (no rows)"); continue
        rows = summarise(sub, "macd0_pct", direction_aware=True)
        print_table(f"{d.upper()} (n={len(sub)}) — MACD0 gap", rows)
        report[("macd0", d)] = rows

    print("\n\n===== Gap/ATR (committed variable: >=2.0 ideal, <1.5 avoid) =====")
    for d in ("short", "long"):
        sub = df[df.direction == d]
        if len(sub) == 0:
            continue
        rows = summarise(sub, "gap_atr", direction_aware=False)
        print_table(f"{d.upper()} (n={len(sub)}) — Gap/ATR magnitude", rows)
        report[("gapatr", d)] = rows

    if md_out:
        with open(md_out, "w") as f:
            f.write("# Gap / MACD0 vs win rate — reproduced\n\n")
            f.write(f"Input: `{path}` · {len(df)} trades · MACD0_IS_RAW={MACD0_IS_RAW}\n\n")
            for (var, d), rows in report.items():
                f.write(f"## {var} — {d} (n={sum(df.direction==d)})\n\n")
                f.write("| bucket | N | win% | avg_ret% | med_ret% |\n|---|---|---|---|---|\n")
                for lab, n, wr, ar, med in rows:
                    f.write(f"| {lab} | {n} | "
                            f"{wr:.1f} | {ar:+.2f} | {med:+.2f} |\n" if wr is not None
                            else f"| {lab} | {n} | - | - | - |\n")
                f.write("\n")
        print(f"\nwrote {md_out}")


if __name__ == "__main__":
    main()
