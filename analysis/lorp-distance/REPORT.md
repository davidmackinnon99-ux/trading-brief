# LORP Entry-Extension Audit — Distance from Kernel vs Outcome

**Question:** Do extended LORP entries (high Distance from Kernel) underperform, and if so
should extension become a gate?

**Method:** `lorp_distance_audit.py` reads the per-bar LORP CSV export for each ticker,
takes every Buy entry, and simulates the **v2.11 systematic exit** (1.5 ATR hard stop +
1.5 ATR trailing, breakeven OFF, next-bar-open fill) forward to a realised outcome. Outcome
is therefore defined by the *systematic* rule, not by discretionary live management, so it
measures the **entry**, not the stop-jockeying.

**Inputs:** 5 tickers (BE, BEAM, CIFR, OUST, RSI) — the names that carried recent losing
trades. 30 entries total (29 closed, 1 open). See `inputs/`, full run in `output.txt`.

## Result

| Bucket | Trades | Win rate | Avg win | Avg loss | Expectancy |
|---|---|---|---|---|---|
| **Extended** (Dist > 1.5) | 17 | 47% | +12.0% | −7.9% | **+1.49%/trade** |
| **Not extended** (Dist ≤ 1.5) | 12 | 58% | +13.9% | −7.5% | **+4.97%/trade** |

## Read

1. **Extension degrades edge but does not invert it.** Extended entries are ~3.3× worse on
   expectancy, but still **positive**. This mirrors the SID finding that wide-gap *longs* stayed
   profitable even as wide-gap *shorts* were catastrophic — "extended" is a penalty, not a veto.
2. **So a hard skip is the wrong handling** — it would discard positive-expectancy trades.
   Size-down or wait-for-pullback (re-anchoring entry nearer the kernel) fit the evidence better.
3. **Stop-vs-kernel geometry is the mechanism.** Distance is ATR-normalised, and the 1.5 stop
   multiple equals the 1.5 Breakout threshold by design: above Dist 1.5 the stop sits *above*
   the kernel, and only a partial reversion (fraction 1.5/Dist) stops the trade out. Extended
   losers here were stopped by reversion fractions of 0.36–0.65 — half-way retraces to fair value.
4. **Deepest extension is not uniformly fatal.** BE's +21% winner entered at Dist 4.13; OUST's
   Dist 3.10 entry won small. The extended bucket carries a fatter right tail alongside the lower
   hit rate.

## Caveats (important)

- **Tiny, non-random sample.** These 5 tickers were selected *because* they held recent losers —
  selection bias. Absolute expectancies are unreliable; the relative pattern is only suggestive.
- **The expectancy gap is outlier-driven — do NOT lean on it.** The not-extended bucket's
  +4.97% is almost entirely one trade (BE 2026-01-05, +41%). Remove that single outlier and the
  not-extended bucket falls to ~+1.7%/trade, indistinguishable from extended's +1.49%. So on this
  sample the *only* stable signal is the win-rate gap (47% vs 58%), and even that is small-sample.
  The geometry rationale stands on its own; the P&L numbers do not yet.
- **Systematic ≠ live.** These outcomes are the v2.11 rule's, not the discretionary results
  actually taken (which included breakeven moves). Divergences between the two are themselves
  informative about management vs entry.
- **Confirmation needed:** re-run on an *unbiased* ticker set (winners included from the start,
  not just names that lost) before treating any threshold as validated.

## Next

Fold in the forthcoming winner tickers, then re-cut the buckets. If the pattern holds, implement
extension handling as **size-down or wait-for-pullback**, not a skip — and revisit whether the
Breakout cut should track the stop multiple rather than sit at a fixed 1.5.
