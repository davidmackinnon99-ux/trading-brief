# Trading the patterns directly (2 Oct 2026)

**Question (David):** SID gets in too late for pattern targets — would scanning for double bottoms/tops
(and H&S) and trading them directly work?

**Method:** `pattern_trades.py` on the 45-symbol SID universe (Yahoo daily, 2005–2026), patterns from
`patterns.py` (Pattern Finder v2.5 rules, no hindsight). Two entries: **breakout** (close of the
neckline-break bar) and **early** (close of the bar the second bottom/top is confirmed, before the
neckline breaks). Stop beyond the pattern extreme; target = 50/75/100% of the measured move; 30-bar time
stop; stop assumed if stop and target hit the same bar. **Control:** for every trade, 5 placebo trades on
the same stock at random dates with identical % stop/target distances — removes the stocks' general
uptrend and the bias of filling exits on wicks. On 30 random-walk series the method shows a residual
"edge" of about +0.05–0.09R, so treat anything under ~0.1R as noise.

## Results (edge = average R minus same-stock placebo R)

| Pattern / entry | n | WR | avg / trade | avg R | edge vs placebo |
|---|---|---|---|---|---|
| Double bottom · breakout · 75% tgt | 1016 | 69% | +0.60% | +0.09R | +0.04R (t 1.5) |
| **Double bottom · early · 75% tgt** | **2151** | **42%** | **+1.12%** | **+0.35R** | **+0.19R (t 4.2)** |
| Double top · breakout · 75% tgt | 1040 | 62% | -0.42% | -0.04R | -0.02R |
| Double top · early · 75% tgt | 2657 | 30% | -0.19% | -0.02R | +0.09R (≈ noise) |
| Inverse H&S · breakout · 75% tgt | 447 | 65% | +0.30% | +0.13R | +0.04R |
| Inverse H&S · early · 75% tgt | 571 | 58% | +0.64% | +0.12R | +0.04R |
| H&S · breakout · 75% tgt | 421 | 58% | -0.73% | -0.03R | +0.06R |
| H&S · early · 75% tgt | 598 | 49% | -0.55% | -0.02R | +0.09R (≈ noise) |

50% and 100% targets tell the same story (full table: `PATTERN_TRADES_raw.md` on the Mac run).

Early double bottom by era: 2005–12 +0.06R edge (t 0.8), 2013–19 +0.25R (t 3.0), 2020–26 +0.28R (t 3.6);
positive on 35 of 45 symbols; median stop distance 3.1%; ~13 bars average hold.

## Verdict
- **Breakout entries (the textbook entry) show no edge for any of the four patterns.** By the time the
  neckline breaks, the easy part of the move is gone — same reason SID is too late.
- **Early double-bottom longs are the one setup worth scanning for:** buy when the second bottom is
  confirmed (before the neckline breaks), stop under the lower bottom, target 75% of the measured move,
  30-bar time stop. +0.19R over placebo, consistent since 2013, weak 2005–12. Low win rate (42%) — it
  works through winners being ~2x losers.
- Double tops / H&S shorts: no edge after controlling for drift; don't scan for them.
- Caveats: SID-journal universe only (45 mostly large caps), no costs (~0.03R), single-path test —
  forward-track before sizing up.

## Re-run on 101 tickers — BTW list (69) + SID journal symbols (2 Oct 2026)

Same method, `cache_all` on the Mac (Yahoo; ABX → ABX.TO, LLOY → LLOY.L). Edge vs same-stock placebo
(random-walk noise floor ≈ +0.05–0.09R):

| Pattern / entry (75% target) | n | WR | avg / trade | avg R | edge vs placebo |
|---|---|---|---|---|---|
| **Double bottom · early** | **4,774** | **42%** | **+1.34%** | **+0.33R** | **+0.16R (t 5.2)** |
| Double bottom · breakout | 2,242 | 69% | +0.77% | +0.12R | +0.07R (≈ noise) |
| Double top · early | 5,649 | 31% | -0.11% | -0.01R | +0.12R (t 4.6) — above noise but still loses money in rising markets |
| Double top · breakout | 2,251 | 64% | -0.22% | -0.01R | +0.05R (≈ noise) |
| Inverse H&S · early / breakout | 1,253 / 975 | 58% / 65% | +0.80% / +0.57% | +0.12R / +0.10R | +0.03R (noise) |
| H&S · early / breakout | 1,330 / 927 | 50% / 58% | -0.14% / -0.39% | +0.01R / -0.03R | +0.08R / +0.05R (noise) |

Confirms the 45-symbol result: early double bottoms are the one robust setup; breakout entries have no
edge for any pattern.

**Momentum (David's point):** for doubles that did break their neckline, speed from the second
bottom/top to the break, in ATR per bar (descriptive — uses hindsight, not usable as an entry filter):
slow tercile 12 bars to break, target hit 47% (DB) / 41% (DT); medium 6 bars, 60% / 55%; fast 4 / 2
bars, 68% / 66%. A third of the moves break within 2–4 bars of the second bottom/top — too fast for a
SID-style entry to catch.

**Trade list for chart review:** `~/pattern-study/out_all/Pattern_Trades_List.xlsx` (also copied to the
Mac desktop) — 10,423 early-entry double top/bottom trades (75% target) with pattern dates, entry, stop,
target, neckline break, exit; first sheet = last 15 months (734 rows).
