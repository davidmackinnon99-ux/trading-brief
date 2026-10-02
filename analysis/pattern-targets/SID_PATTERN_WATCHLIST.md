# SID signals x chart patterns — the "watchlist" test (2 Oct 2026)

**Question (David):** keep double bottoms/tops on a watchlist when they form and take the SID signal if
one comes while the pattern is live — does that improve SID?

**Method:** `sid.py` — Python port of SID Strategy v10.5.18 at defaults (RSI 30/70 touch within 10 bars,
RSI <50 rising + MACD rising for longs and mirror for shorts, stop = floor/ceil of the setup extreme,
RSI-50 exit, 20-bar time stop, fills at bar close). Generated on the 101-ticker set (BTW + journal
symbols), 2004–2026: **8,642 trades** (3,370 long, 5,272 short). **Validation: 98% of the 2,552
recorded trades in trades_all.csv have a generated entry in the same direction within 3 days.**
Pattern state at each entry = what Pattern Finder (v2.7 logic) showed on that bar (`patterns.py`).
`sid_pattern_study.py` runs it.

## Result (n / WR / avg / median; t vs no pattern showing)

| Pattern showing at SID entry | Longs | t | Shorts | t |
|---|---|---|---|---|
| none | 2385 / 58% / +0.89% / +1.48% | | 4144 / 46% / -0.44% / -0.71% | |
| aligned, still forming (watchlist case) | 73 / 63% / +0.10% / +1.55% | -0.8 | 114 / 56% / +0.22% / +0.99% | +1.1 |
| aligned, confirmed ≤20 bars | 98 / 60% / -0.03% / +1.57% | -1.1 | 110 / 40% / -2.16% / -1.61% | -2.1 |
| opposing, confirmed ≤20 bars | 811 / 62% / +0.28% / +1.60% | -2.0 | 901 / 49% / -0.76% / -0.41% | -1.2 |

Aligned forming = double bottom for longs (72 of 73), double top for shorts (111 of 114).
Confirmed H&S under a SID short: 37 trades, -4.82% average.

## Verdict
- **The watchlist combination doesn't add anything.** SID longs taken while a double bottom was forming
  averaged +0.08% vs +0.89% with no pattern (not significant, inconsistent by era: 2005–12 -0.25%,
  2013–19 +1.43%, 2020–26 -1.72%). Shorts with a forming double top were a little better (+0.22% vs
  -0.44%) but not reliably.
- **The two signals rarely coincide** — only 73 of 3,370 SID longs fired while a double bottom was live.
  SID needs RSI to have just left oversold; the early double-bottom entry comes when the second low is
  confirmed, usually earlier. They are mostly different moments, not one setup.
- **A recently confirmed pattern hurts SID in both directions** (longs after a confirmed bearish pattern
  +0.28% vs +0.89%, t -2.0; shorts after a confirmed bearish pattern -2.16%, t -2.1). Consistent with the
  first study (1f): by the time a pattern confirms, SID is either late or fighting the new move.
- **The best SID trades come with no pattern showing.** The early double-bottom edge (PATTERN_TRADES.md)
  stands on its own as a separate setup, not as a SID filter.
