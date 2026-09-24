# MACD cross quality — can a fresh signal-line cross be judged on the cross bar? (24 Sep 2026)

**Question (David):** fresh MACD/signal crosses often reverse unless the gap is wide or the move
rapid; waiting for confirming candles makes entries late. Is there information available
*at the close of the cross bar* that separates crosses that hold from crosses that fail?

**Data:** 44 tickers from the 300-trade SID journal universe, daily bars 2018 → 23 Sep 2026
(yfinance), 6,673 crosses (3,329 bullish, 3,344 bearish). `fetch.py` → `cross_quality.py` →
`combo.py`. Raw tables: `RESULTS_raw.txt`, `RESULTS_combo.txt`.
**Failure** = opposite cross within the next 3 bars. Baseline failure ≈ 20% both directions.

## Findings

| Factor (at cross-bar close) | Effect on 3-bar failure | Verdict |
|---|---|---|
| Cross-bar separation (MACD Sep "Separation") | lowest quintile 35% → highest 7% | **Strongest — use** |
| Punch-through (bar-on-bar histogram jump) | 40% → 6% | Same information as separation (redundant) |
| Cross depth vs zero (MACD / σ100) | longs: below zero 9% vs above zero 32% | **Useful for longs**; shorts see fewer fails when crossing above zero but *worse* 10-bar returns (consistent with the earlier wide-gap-short warning) — info only for shorts |
| Approach speed into the cross | 24% → 14% | Weak |
| Ticker's own whipsaw history (last 10 crosses) | ~20% → 23–28% | **No useful effect — dropped** |
| WaveTrend alignment (classic WT as WT3D proxy) | not aligned 33–39% vs aligned ~19% | Only ~6% of crosses are unaligned; adds little once separation is known |

**Combined rules**

| Rule | Crosses kept | Fail (L / S) | 10-bar return long |
|---|---|---|---|
| All crosses | 100% | 20.4% / 20.1% | +0.75% |
| Separation ≥ 0.22× | 40% | 9.8% / 10.2% | +0.97% |
| Separation ≥ 0.35× | 23% | 7.7% / 8.0% | +1.07% |
| ≥ 0.22× + far side of zero | 22% (L) | 6.2% / 7.9% | +1.10% |
| < 0.22× and WT not aligned | 6–8% | 36% / 39% | — (avoid) |

## Caveats
- Filtering halves the whipsaw rate but only modestly lifts 10-bar returns — a raw MACD cross has
  little standalone edge; this is a timing / avoid-the-fake tool inside SID and LORP, not a strategy.
- WT3D (jdehorty kernel version) not reproduced; classic WaveTrend used as proxy.
- 44-ticker universe, daily bars only. Thresholds not yet tested on David's actual SID/LORP trade outcomes.

## Implemented
MACD Separation & Convergence **v1.3** (`trading-indicators/indicators/`): "Last cross" row
(grade Strong ≥0.35× / OK ≥0.22× / Weak, with bars since cross), "Cross depth" row (σ, far/near
side of zero), Speed row now flags fast expansion as well as fast closing, two new quality-cross
alerts, and data-window exports (Cross Bar Separation, Cross Depth, Bars Since Cross).
