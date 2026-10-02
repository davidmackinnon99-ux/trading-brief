# Target exhaustion — does SID fire when a pattern hits its target and reverses? (2 Oct 2026)

**David's observation:** SID entries come well after the pattern; when price reaches the pattern's
target it tends to reverse, and that reversal is where SID fires (e.g. SYK: double top target 282.74
hit 8 Sep, low 11 Sep, SID long 16 Sep). Patterns are proven directional, but not necessarily within the
target / 30-bar box used earlier.

**Method:** `exhaustion.py`, 101 tickers 2004–26, 8,642 generated SID trades (v10.5.18 port) + 659
student trades. Every confirmed pattern counts from its own breakout bar (patterns.py now records it —
this removed a look-ahead selection that had dropped patterns later replaced by an overlapping one).
Random-walk control run first (all cells ≈ 0).

## A. SID trades fired against a pattern that hit its target in the previous 15 bars
| Sample | Class | Longs (n / WR / avg / median) | t | Shorts | t |
|---|---|---|---|---|---|
| Generated | no opposing pattern | 2069 / 58% / +0.84% / +1.43% | | 3591 / 47% / -0.42% / -0.69% | |
| Generated | opposing, target not yet reached | 189 / 61% / +0.39% / +1.49% | -1.0 | 249 / 55% / -0.23% / +0.86% | +0.5 |
| Generated | **opposing, target just reached** | **1112 / 61% / +0.49% / +1.68%** | -1.2 | **1432 / 46% / -0.79% / -0.92%** | -1.8 |
| Students | no opposing pattern | 208 / 86% / +4.08% | | 251 / 81% / +2.56% | |
| Students | opposing, target just reached | 95 / 83% / +3.59% | -0.7 | 96 / 80% / +2.66% | +0.2 |

**David is right about the timing:** a third of all SID trades (1,112 of 3,370 longs; 1,432 of 5,272
shorts) fire within 15 bars of an opposing pattern reaching its target. But those trades do no better
than other SID trades — slightly worse — and the students' trades show the same.

## B. Follow-through after a neckline break (pattern direction, minus the stock's normal drift)
All four patterns ≈ 0 or slightly negative at 10, 20, 40 and 60 bars (largest: double bottom -0.79% at
60 bars, t -1.9). On these 101 names, a confirmed break does not out-move the stock's normal drift.

## C. Reversal after the target is first reached (move against the pattern, drift-adjusted)
Double top +2.0% at 20 bars (t 1.8, outlier-driven), inverse H&S +0.41% at 5 bars (t 2.5); double bottom
and H&S ≈ 0. Weak, inconsistent evidence of a reversal at the target.

## Verdict
Target hits do commonly precede SID entries, so the patterns help explain *why* SID fires where it does —
but knowing that a target was just reached doesn't improve the SID trade. Breakouts on their own show no
drift-adjusted follow-through. Early double bottoms (before the break) remain the only robust edge
(+0.17R vs placebo, t 5.4 after the look-ahead fix). Earlier pattern-context studies used the old
confirmed-state flag; re-checking them with the breakout bar would only change small subgroups.
