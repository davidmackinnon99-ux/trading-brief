# Live Outcome vs Entry Distance — LORP longs (journal 2026-07-06)

Pairs the live journal R-multiples (screenshot 2026-07-06) with the Distance-from-Kernel
at the matching Buy entry in each ticker's CSV. This is GROUND-TRUTH outcome (not the
systematic sim) on a set that now includes winners, so it breaks the earlier selection bias.

| Ticker | Opened | Live R | Live P&L% | Entry Dist | Type | MACD0 at signal |
|---|---|---|---|---|---|---|
| OUST | 2026-06-30 | −1.01R | −18.95% | 2.88 | Breakout | ok |
| BEAM | 2026-06-22 | −0.47R | −4.31% | 1.95 | Breakout | ok |
| BE | 2026-06-22 | −1.04R | −11.36% | 2.56 | Breakout | ok |
| CIFR | 2026-06-18 | −0.95R | −11.62% | 1.80 | Breakout | ok |
| RSI | 2026-06-15 | −1.00R | −5.25% | 2.68 | Breakout | ok |
| **TGTX** | 2026-06-09 | **+5.72R** | +9.69% | **2.15** | Breakout | ok |
| TSM | 2026-06-15 | −1.03R | −3.53% | 0.87 | Trend | **FAILED** |
| AVLV | 2026-06-12 | −1.03R | −1.30% | 1.14 | Trend | **FAILED** |

(AAL live 2026-06-12 winner not matched: its CSV Buy is 2026-06-24, not near the live open — needs a look.)

## Read — the losses have TWO different causes, not one

1. **Extended entries account for the −1R cluster.** OUST/BE/CIFR/RSI/BEAM all entered
   Breakout-zone (Dist 1.80–2.88) and all took ~−1R. Live R matches the systematic outcome, so
   these are **entry-driven, not management-driven** — the breakeven-move concern did not sink them.
2. **But extension is not a veto — it produced the best trade.** TGTX entered at Dist 2.15
   (extended) and returned **+5.72R**, the biggest winner in the book. A hard "skip Breakout"
   filter would have blocked it. Confirms the SID wide-gap-longs lesson: extension is a penalty on
   the odds, not a disqualifier.
3. **The two non-extended losers are a SEPARATE problem — MACD0 gate violations.** TSM (0.87) and
   AVLV (1.14) were not extended at all; both **failed the MACD0 gate** (MACD below its signal line
   at the signal bar). Per CONFLUENCE_CHECKLISTS the canonical LORP entry is *MACD0 up AND LC Buy* —
   these should not have been entered. Fix is gate enforcement, unrelated to distance.
4. **Management shows up on the winner, not the losers.** TGTX was closed live in 1 day (+9.69%);
   the systematic trailing would have held ~15 bars for +20.4%. So the tendency is to bank winners
   early while losers run to the full stop — the expectancy-eroding direction, worth watching.

## Implication
Two independent fixes, not one: (a) MANAGE extended entries (wait-for-pullback / size-down, never a
hard skip — TGTX proves why); (b) ENFORCE the MACD0 gate at entry (removes TSM/AVLV-type trades).

## Caveats
Small sample; next-bar-fill means MACD0 at signal may differ slightly from fill; AAL unmatched;
live R depends on the discretionary stop actually used. Confirm TSM/AVLV were LORP (not another book).
