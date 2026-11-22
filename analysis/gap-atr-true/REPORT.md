# Gap/ATR rebuilt on SID's actual stop — 22 Nov 2026

**Why:** Gap/ATR (a measure Claude introduced) used the 10-bar swing low/high as a stand-in for
the stop. SID's stop has always been: highest high (shorts) / lowest low (longs) from RSI entering
the OB/OS zone until it exits, taken to the next whole number (13.6 → 14.00 for a high, 13.00 for a low).
**Data:** trades_all.csv, 2,539 of 2,621 trades with an identifiable OB/OS episode (RSI14 30/70).
Scripts: `true_gap_atr.py`, `compare.py`. Output kept out of repo
(`~/Trading Indicators/data/trades/trades_gap_true.csv`).

## What differs
- True Gap/ATR runs higher: median longs 2.04 vs 1.53 proxy; shorts 1.91 vs 1.28.
- Almost all of that is the whole-number rounding (unrounded true = 1.61 / 1.33). OB/OS episodes
  are short (median 2 bars, 96–98% under 10 bars), so the window itself changes little.
- Rank agreement with the proxy is only ~0.4: many trades land in a different bucket.

## Win rate by true Gap/ATR
| Longs (n=1,061) | <1.0 | 1.0–1.5 | 1.5–2.0 | 2.0–3.0 | 3.0–4.0 | >4.0 |
|---|---|---|---|---|---|---|
| WR | 71% | **68%** | **80%** | 77% | **68%** | 72% |
| 2020+ WR | 82% (n=28) | 75% | 80% | 78% | 61% (n=33) | 70% (n=10) |

Shorts (n=1,478): WR flat at 61–69% in every bucket, but mean return deteriorates as the
stop widens: >3 ATR mean −1.4% / −3.7%; since 2020 −4.6% (3–4) and −19.4% (>4, n=13).

## Implications for current rules (no changes made)
- Longs: best band 1.5–3.0; "<1.5 avoid" partly holds (1.0–1.5 weakest common band) but <1.0 is
  not weak; "≥2.0 ideal" does not hold above 3.0 — wide stops underperform, especially since 2020.
- Shorts: Gap/ATR does not predict WR, but true >3.0 flags tail-loss risk (wide stop).
- The +22.6pp swing from the earlier study is not reproduced here on either measure (~10–12pp).
- Caveat: `win`/`return_pct` come from the backtest's own exits, not necessarily the SID stop.
  Pre-split trades use split-adjusted prices, so whole-number rounding there is approximate.
