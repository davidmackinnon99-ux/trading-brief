# analysis/gap-macd0

Reproduce the gap-to-signal (MACD0) vs win-rate / avg-return analysis — the one previously
shown only as a chart PNG (2,439 trades, 37 tickers). This bundle makes it verifiable.

## Contents
- `gap_macd0.py` — the analysis (buckets trades, prints win rate + avg return per bucket)
- `trades_all.csv` — input (symlink or copy of `data/trades/trades_all.csv`)
- `REPORT.md` — generated output (run with `--markdown REPORT.md`)
- the original chart PNG, if kept, for visual comparison

## Run
```bash
python3 gap_macd0.py ../../data/trades/trades_all.csv --markdown REPORT.md
```

## Required input columns (one row per trade)
`direction` (long|short) · `return_pct` (signed %) · `win` (0|1) ·
`macd0_pct` (MACD − signal, % of price) · `gap_atr` ((open − prev_close) / ATR)

## The one thing to verify: sign convention
`macd0_pct` appears to be stored **raw** (MACD − signal), not sign-normalised. The reference
chart's main axis is "gap ABOVE signal" for shorts and "gap BELOW signal" for longs, so the
script (with `MACD0_IS_RAW = True`) treats the favourable magnitude axis as **+macd0 for shorts,
−macd0 for longs**, and everything on the opposite sign as "wrong side".

**To confirm this matches the original chart:** run it and compare the per-bucket **N** to the
chart. If they line up (chart shorts ≈ 48 / 483 / 548 / 195 / 77 / 83 across
wrong-side→>1), the convention is right. If long/short look inverted, set
`MACD0_IS_RAW = False` and re-run. Do not trust the win-rate numbers until the N's match.

## Two different "gap" variables — do not conflate
- `macd0_pct` = MACD − signal (momentum gap). This is what the chart plots.
- `gap_atr` = overnight (open − prev_close) / ATR. The committed pre-entry danger flag
  (STRATEGIES.md: ≥2.0 ideal, <1.5 avoid). Reported here as a cross-check, separately.

## Reproducibility rule
Script + input + output stay together in this folder. Add a row to `/ARTIFACTS.md` when
committing. Never commit the chart alone.
