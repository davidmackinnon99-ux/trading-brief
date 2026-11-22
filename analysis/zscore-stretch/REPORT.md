# Price stretch (Z-score / ATR distance) at SID entry — 22 Nov 2026

**Question:** does how stretched price is at entry predict SID outcomes?
**Data:** `data/trades/trades_all.csv` (2,621 trades, 2005–Jun 2026); 2,541 matched to Yahoo
daily bars (8 symbols unmatched). Longs n=1,060, shorts n=1,481.
**Scripts:** `zscore_stretch.py` (adds features; output kept out of repo at
`~/Trading Indicators/data/trades/trades_with_z.csv`), `analyse_z.py` (buckets).

"Depth" = stretch against the trade direction (below the mean for longs, above for shorts).
Measures: Z vs SMA20/50/80, (close − SMA50)/ATR14, Z of the day's return.

## Findings
- **Longs — weak but real, best measure is distance from SMA50 in ATR units.**
  Mid-stretch (2–3 ATR below SMA50) 79% WR vs 68% when shallow (<1 ATR) or very deep (>4 ATR).
  Swing ~11pp, about half of Gap/ATR (22.6pp). Not monotonic — a sweet spot, not "deeper is better".
- **Post-2020 the pattern is clearer:** <1 ATR 54% WR / −3.5% mean (n=24); 1–2 ATR 69%;
  2–3 ATR 82%; 3–4 ATR 79%; >4 ATR 76% with best mean return. Pre-2020 flat (61–77%).
- **Shorts — no predictive value.** Rank correlation with return ≈ 0 on every measure;
  apparent swings come from small buckets.
- **Z of today's return — no value** for either side.
- **Largely independent of Gap/ATR** (rank corr |≤0.22|), so it would add information, not duplicate.
- SID entries are rarely extreme: most longs sit 0–1.5 SD below SMA20. The TradeDots
  ±2.8 threshold would almost never coincide with a SID entry.

## Verdict
Candidate Tier 3 *advisory* flag for longs only: caution when price is <1 ATR below SMA50
(shallow pullback). Sample in the weak bucket is small (24 post-2020), so watch on live
trades before making it a rule. Do not use for shorts.
