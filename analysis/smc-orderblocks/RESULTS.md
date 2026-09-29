# BigBeluga SMC order blocks & structure vs SID trades (29 Sep 2026)

**Question (David):** SID longs such as SYK (Sep 2026) bounce off SMC bullish order blocks — do order
blocks, SMC structure or liquidity sweeps at entry make a difference to SID results?

**Method:** `smc.py` is a Python port of BigBeluga "Smart Money Concepts [1.0.0]" at default settings
(swing structure mslen 5 / Adjusted Points, sweeps on, order blocks 'Length' = 1× ATR(200), mitigation
on body close, Hide Overlap 'Recent', last 5 blocks per side). It is replayed bar by bar and snapshots
exactly what the chart showed at each entry (no hindsight). Checked against David's SYK chart of
29 Sep: it reproduces the bullish block 266.93–272.65 (anchored Nov 2023), the 255–261 block below it
and the bearish block 344.45–349.77. `smc_study.py` runs the test. Data: 2,317 SID trades (864 long,
1,453 short) from `data/trades/trades_all.csv`, Yahoo daily bars (cache from the pattern study).
"Near" = within 1 ATR(14) of the block edge.

## Result

| Condition at entry (n / WR / avg / median) | Longs | t | Shorts | t |
|---|---|---|---|---|
| All | 864 / 72% / +1.11% / +1.69% | | 1453 / 63% / -0.60% / +0.90% | |
| Favourable block in/near (bull block under a long, bear block over a short) | 127 / 67% / -0.17% / +1.76% | -2.0 | 198 / 61% / -0.59% / +0.77% | 0.0 |
| … price inside that block | 13 / 77% / +2.57% / +3.06% | +1.1 | 38 / 66% / -0.13% / +1.20% | +0.4 |
| Opposing block in/near (bear block over a long, bull block under a short) | 37 / 84% / +1.64% / +1.90% | +0.8 | 83 / 64% / +0.55% / +0.93% | +2.4 |
| No block near either way | 704 / 72% / +1.32% / +1.68% | +1.7 | 1180 / 63% / -0.67% / +0.93% | -0.6 |
| SMC structure trend aligned with trade | 37 / 81% / +3.29% / +1.61% | +1.4 | 50 / 66% / -0.81% / +1.08% | -0.2 |
| Liquidity sweep in trade direction, last 3 bars | 41 / 71% / +0.27% / +1.53% | -1.0 | 49 / 61% / -1.59% / +1.00% | -0.7 |

By era (avg return): longs with a bull block under them were worse in every era (2005–12 -2.12 vs
+1.04; 2013–19 +1.20 vs +1.80; 2020–26 +0.49 vs +1.11). Shorts with a bull block under them were better
in every era (+1.27 vs -0.60; +0.09 vs -0.34; +0.63 vs -1.06).

Loss size: longs with a bull block under them lost -7.8% on average when wrong (vs -6.0% otherwise),
same share of < -10% losers (5.5% vs 5.3%). Shorts with a bull block under them lost only -3.0% when
wrong (vs -6.4%) and only 1.2% of them lost more than 10% (vs 5.6%).

## Verdict

1. **Order blocks do not act as the SMC theory says for SID trades.** A bullish block under a SID long
   did *not* help — win rate 67% vs 72% and a lower average (driven by bigger losses; median unchanged).
   The direction is consistent across all three eras, but the overall difference is only borderline
   (t = -2.0). Price sitting *inside* the block looks good (n = 13) — too few to act on.
2. **Shorts with a bullish block just below did better, with far smaller losses** (t = +2.4, consistent
   across eras, n = 83). Cross-checked against the DI-spread short gate: it is *not* the same thing —
   median DI spread is identical (15.9) with or without the block, and the effect shows up where the
   DI gate is weakest: shorts with spread ≥ 10 averaged +0.61% with a bull block just below (n = 61) vs
   -0.87% without (n = 1,108); with spread < 10 the difference is small (+0.36% vs +0.16%, n = 22).
   Promising but based on 61 trades — a candidate to watch, not yet a rule.
3. **SMC structure trend and liquidity sweeps: no reliable edge.** Structure is rarely aligned with SID
   longs (SID buys bounces in down-structure), and the 37 that were aligned are too few.

**Implication:** keep the SMC indicator as visual context (levels like SYK's 267–273 zone are real
reference points), but do not add order-block or sweep conditions to SID rules. Do not lean on "bull
block underneath" as extra confidence for a long — the data says the opposite, if anything.

## Caveats
- The port follows the Pine logic line by line, including its quirks (e.g. the Adjusted-Points update
  runs every 5th bar); it matched the SYK chart but tiny differences from TradingView's pivot tie
  handling are possible.
- The indicator's 5,000-bar calculation window is ignored (full history used), and trades in the first
  400 bars of a symbol's data are skipped (ATR 200 warm-up).
