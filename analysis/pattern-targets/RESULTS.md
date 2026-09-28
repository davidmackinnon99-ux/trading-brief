# Chart patterns, pattern targets and entry candles vs SID trades (28 Sep 2026)

**Questions (David):** (1) would exiting SID trades at the chart-pattern measured-move target have
improved results? (2) does the chart-pattern context at entry matter? (3) do the masterclass entry
candle patterns (Caginalp & Laurent 1998) improve SID entries?

**Data:** `data/trades/trades_all.csv` — 2,373 SID trades with an exit date and matching price data
(890 long, 1,483 short, 45 symbols, 2005–2026; AVB had no Yahoo data). Daily bars from Yahoo
(split-adjusted, not dividend-adjusted) fetched on the Mac mini (`fetch.py`, cache outside the repo).
Patterns detected with `patterns.py`, a Python port of **SID Pattern Finder v2.5** at default settings,
replaying what the chart/panel would have shown at each date (no hindsight). `study.py` runs everything.
Price levels matched the recorded entry price (within 3%) on 2,316 trades; exit tests use only those.

## Verdict

1. **Pattern-target exits: not applicable to SID as traded.** Only 1 of 2,316 trades ever touched an
   aligned pattern's 50% or 75% target before its actual exit, and none touched the 100% target. Where a pattern
   pointed the same way as the trade, SID had usually entered *after* price had fallen back through the
   neckline (e.g. ABT Jun 2022: inverse H&S neckline 114.7, SID long entered at 105.4), so the target
   sat far beyond anything a 2–4 week bounce reaches. Another 18–28 trades had the target already
   passed at entry.
2. **Exit when an opposing pattern confirms during the trade: no help.** 23 longs / 33 shorts
   triggered; they were already heavy losers (-8.0% / -7.5% avg) and the rule left them at -8.2% / -8.0%.
   By the time a daily pattern confirms, the damage is done.
3. **Pattern context at entry: weak, inconsistent effect — not a rule.** A recently confirmed
   pattern *against* the trade lowered average returns (longs +0.56% vs +1.35%, shorts -1.40% vs
   -0.38%), but medians and win rates barely moved, the differences are not statistically reliable
   (t = -1.4 / -1.05) and they vanish entirely in 2013–2019. Aligned confirmed patterns looked good for
   longs (85% WR, +3.46%) but on only 26 trades.
4. **Entry candle patterns: no edge.** Longs 72% WR / +1.24% with an aligned pattern vs 72% / +1.10%
   without; shorts slightly worse with one (60% / -0.75% vs 63% / -0.63%). Three Outside Up (39 longs,
   +2.75%) is the only one that stands out and the sample is small.

**Implication:** keep the Pattern Finder as a visual/discretionary aid; do not add pattern targets,
pattern exits or candle-pattern gates to SID rules on this evidence. Worth revisiting if a specific
trade David flags shows a pattern the v2.5 rules are not detecting.

## A. Chart-pattern context at entry (as the indicator panel showed it)

| Context | Longs: n / WR / avg | Shorts: n / WR / avg |
|---|---|---|
| none | 594 / 73% / +1.35% | 1086 / 64% / -0.38% |
| aligned-forming | 25 / 76% / -0.40% | 32 / 62% / -0.76% |
| aligned-confirmed | 26 / 85% / +3.46% | 40 / 42% / -1.91% |
| opposing-forming | 0 | 1 / 100% / +1.30% |
| opposing-confirmed | 245 / 69% / +0.56% | 324 / 62% / -1.40% |

Opposing-confirmed vs none, by era (avg return): longs 2005–12 -0.84 vs +0.89, 2013–19 +1.71 vs +1.74,
2020–26 +0.49 vs +1.43; shorts 2005–12 -0.99 vs -0.42, 2013–19 -0.31 vs -0.36, 2020–26 -2.42 vs -0.38.

## B. Pattern-based exits (2,316 trades with matching price levels)

| Rule | Triggered | Their actual avg | With rule | WR actual → rule | All-trade avg actual → rule |
|---|---|---|---|---|---|
| Long · target 50 / 75 / 100% | 0 / 0 / 0 | – | – | – | +1.16% unchanged |
| Long · opposing pattern confirms | 23 | -8.04% | -8.15% | 9% → 4% | +1.16% → +1.15% |
| Short · target 50% | 1 | -2.38% | +4.86% | 0% → 100% | -0.66% unchanged |
| Short · target 75% | 1 | -2.38% | +6.45% | 0% → 100% | -0.66% unchanged |
| Short · target 100% | 0 | – | – | – | -0.66% unchanged |
| Short · opposing pattern confirms | 33 | -7.47% | -8.02% | 15% → 9% | -0.66% → -0.68% |

Target already passed at entry: 28 (50%), 20 (75%), 18 (100%) trades.

## C. Entry candle patterns (entry bar or up to 2 bars before)

| Group | Longs: n / WR / avg | Shorts: n / WR / avg |
|---|---|---|
| No candle pattern | 676 / 72% / +1.10% | 1191 / 63% / -0.63% |
| Aligned pattern present | 208 / 72% / +1.24% | 284 / 60% / -0.75% |
| Opposing pattern present | 6 / 83% / +2.16% | 9 / 67% / -0.11% |

| Aligned pattern | Longs | | Aligned pattern | Shorts |
|---|---|---|---|---|
| Three Inside Up | 120 / 69% / +0.90% | | Three Inside Down | 126 / 56% / -0.44% |
| Three Outside Up | 39 / 74% / +2.75% | | Three Outside Down | 81 / 62% / -0.34% |
| Three White Soldiers | 15 / 80% / +0.82% | | Three Black Crows | 32 / 72% / +0.26% |
| Morning Star | 36 / 78% / +1.12% | | Evening Star | 53 / 58% / -2.62% |

Candle definitions follow Caginalp & Laurent (1998) as in the masterclass slides; "downtrend/uptrend"
before the pattern = close lower/higher than 5 bars earlier. Morning/Evening Star: long first body
(> 10-bar average), small gapped middle body, third bar closing beyond the first body's midpoint.

## Caveats
- Trade returns are as recorded in `trades_all.csv`; bar data is Yahoo, so a handful of trades (57)
  were excluded from exit tests where prices did not line up.
- Pattern detection is the indicator's objective rules; a discretionary read may see patterns it
  does not (and vice versa).
- Target touches on the actual exit bar are ignored because intraday order is unknown.
