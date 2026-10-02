# Student SID journals — patterns and SID-port check (2 Oct 2026)

Journals: Richard, Leen, Cathie, D-Soh (David's copies) → `student_trades.csv`, 747 unique trades
(deduped across sheets); 688 priced on Yahoo (London listings matched by price: III, ANTO, AUTO, AV, AZN,
AAL, ABF, ADM, ALW, AAF on .L; AHT, AMT, DRIP, FDX, KHC, LLOY, NEM, SBUX unpriced). Scripts:
`student_study.py`, `second_test.py` (run on the Mac).

## 1. SID port vs the student trades
Generated SID v10.5.18 entry (same direction, ±3 days) found for 50% of student trades (Cathie 68%,
Leen 53%, Richard 51%, D-Soh 43%) vs 98% for David's automated trades_all.csv. The students' trades are
manual, discretionary back-tests (different entry timing, MACD crossed/pointing judgements, entering a
day later, early closes) — they are not the mechanical strategy.

## 2. Hand-labelled patterns (what the student saw)
| Pattern recorded | Longs (n / WR / avg) | t | Shorts | t |
|---|---|---|---|---|
| none | 140 / 78% / +3.29% | | 170 / 79% / +2.33% | |
| aligned (DB / inv H&S long; DT / H&S short) | 170 / 89% / +4.43% | +1.7 | 161 / 85% / +3.24% | +1.9 |
| opposing | 5 / 80% / +1.60% | | 13 / 69% / +1.49% | |
Aligned beat none for D-Soh (+3.61% vs +2.37%), Leen (+4.20% vs +3.48%) and Richard (+1.77% vs +1.57%).

## 3. Objective, no-hindsight check
Is the SID entry itself at a second bottom/top? Recent 10-bar extreme within 0.75 ATR of a prior swing
5–60 bars earlier, ≥ 2 ATR rally/drop between, using only bars up to entry.
| Sample | Longs at 2nd bottom | other | t | Shorts at 2nd top | other | t |
|---|---|---|---|---|---|---|
| Generated SID (8,642) | 470 / 62% / +0.41% | 2900 / 58% / +0.75% | -1.0 | 541 / 51% / -0.54% | 4731 / 46% / -0.51% | -0.1 |
| Student trades | 60 / 88% / +3.64% | 263 / 83% / +3.91% | -0.4 | 52 / 81% / +2.47% | 313 / 81% / +2.68% | -0.3 |
Only 21% of the trades students labelled as an aligned double/H&S pass this test (11% of unlabelled
ones do). Labelled trades that fail it still averaged +3.94% — the label tracks the outcome, not a
structure visible at entry.

## Verdict
- Students' labelled patterns line up with better results, but an objective second-bottom/top at entry
  (no future bars) does not — in their own trades or in 8,642 generated SID trades. The likeliest
  reason is hindsight in manual back-testing: a second low that held gets called a double bottom; one
  that failed becomes a lower low and doesn't.
- Student back-test results (≈80%+ WR, ≈+3% per trade) are far above mechanical SID (58% WR, +0.7% long)
  and only half their entries match the rules — another sign of discretion/hindsight in manual
  back-tests. Forward-recorded (live or replay without peeking) trades with the pattern noted at entry
  would settle it.
- No change to the earlier conclusions: patterns don't improve SID as a filter; early double bottoms
  are the one stand-alone edge.
