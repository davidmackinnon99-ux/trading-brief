# Confluence Checklists — SID & LORP

**Living doc — git is the version history.**
**Captured:** 3 July 2026 (from the checklists worked out in TradingView AI, previously uncommitted).
**Authority:** `STRATEGIES.md` remains canonical for *criteria/gates*. This file records the
manual confluence-scoring checklists used at the chart before acting. Where a checklist item
would act as a gate, `STRATEGIES.md` + `confluence_check.py` win.

---

## SID Confluence Checklist — Long (mirror for Short)

Manual pre-entry score. Long shown; Short is the mirror (RSI ≥ 70, BB Upper, buyers
exhausting, resistance / supply zone).

| # | Condition | Source | Weight |
|---|-----------|--------|--------|
| 1 | RSI ≤ 30 → Armed Long = 1 | SID Pro | Trigger |
| 2 | MACD cross above signal (or divergence forming) | MACD_Cross Zero | 🔑 Highest conviction |
| 3 | Price touching / piercing BB Lower | Standard Bollinger Bands | Extreme reached |
| 4 | Volume Z-score > 1.0 | RVOL + Volume Z | Institutional |
| 5 | Delta decelerating (sellers exhausting) | Volume Delta | Exhaustion |
| 6 | Nearby structural support or demand zone | S&R + CAP Tools (S&D) | Floor beneath entry |

**Scoring:** 6/6 = highest conviction · 5/6 = take with caution · 4/6 or fewer = pass.

**Notes / reconciliation:**
- Item 1 (RSI touch) + the 10-bar staleness rule are the mandatory trigger — both are already
  enforced in the indicator (`Long Entry Signal = 1` within 10 bars of the OB/OS cross).
- Item 2 is the MACD0 condition (MACD line vs signal). Committed favourable zone: MACD0 ≥ −0.1%.
  This checklist item is the *highest-conviction* factor, consistent with MACD0 being the prime
  SID indicator.
- Weekly RSI direction is still assessed by eye (the computed Weekly RSI Gate was removed as
  unreliable in code — see STRATEGIES.md).

---

## SID validated direction rules — 7 July 2026 (on 2,618 trades; see `Indicators/sid-adx-analysis/`)

The 6-factor score above is the manual read. These are the DATA-VALIDATED direction rules that
override intuition — now also flagged live in the brief (`analyse-brief.cjs` `sidShortCaution`):

**LONGS — take the oversold bounce; NO veto.**
- ADX: positive across *every* band, best at high ADX (40–50 +1.71/trade). Rising/high ADX is fine (RVOL-like).
- MACD0 distance (normalised (MACD−Signal)/price): does NOT gate. Below-signal is normal.
- DI spread: does NOT gate (longs fire in downtrends, median spread −16).

**SHORTS — net-negative as taken; gate HARD (all three say "don't fade strength"):**
- DI spread (DI+−DI−): require **< ~10**, ideally DI− leading. **Avoid ≥ 20** (run-over −1.02, avg loss −9). ⛔ brief.
- ADX: **avoid 40–50** (run-over −3.16, avg loss −13.6%). 15–30 negative. ⛔ brief.
- MACD0 side: favourable **at/below signal**; **avoid ≥ +0.25% above signal** (premature fade −0.81). ⚠️ brief.

**CORRECTION:** the earlier curated "MACD0 0.25–0.5% above signal = Goldilocks" is IN-SAMPLE overfitting —
it *inverts* on 1,403 broad out-of-sample shorts (below-signal wins). Do NOT use above-signal as
short-favourable. See `sid-macd-analysis/results/FINDINGS_out_of_sample.md`.

> These short rules are validated *gates*, not just confluence colour. Per this file's own guardrail,
> promoting them into STRATEGIES.md (criteria authority) is a deliberate step — flagged, not done here.

---

## LORP Confluence Checklist (revised)

Revised from the saved checklist, which had dropped Aroon. Aroon is re-added **as context, not
as a gate** — this keeps it consistent with `confluence_check.py` (Aroon = "colour only / NOT
validated") and STRATEGIES.md (LORP verdict = MACD0 up AND LC Premium Buy).

| # | Condition | Source | Role |
|---|-----------|--------|------|
| 1 | ADX > 20 + DI direction | ADX and DI | Trend strength gate |
| 2 | RVOL Z-score > 1.0 | RVOL + Volume Z | Volume confirmation |
| 3 | Volume Delta confirms direction | Volume Delta | Directional conviction |
| 4 | BB width expanding | Bollinger Bands | Not compression |
| 5 | MACD line vs signal line | MACD_Cross Zero | Momentum alignment |
| 6 | Aroon not contradicting | Aroon Oscillator | No reversal warning ⚠️ (CONTEXT, not a gate) |

**How to read condition 6:** Aroon doesn't need to be bullish — it just shouldn't be screaming
the opposite direction. If all five other conditions are green but Aroon is −51% with no sign of
curling, that's a cue to pass or size down. If Aroon is −51% but *curling up* (the early reversal
pattern), that's constructive — the structure is about to confirm what momentum is already saying.

**Reconciliation guardrail:** LORP's canonical entry authority stays `MACD0 up (MACD ≥ Signal)
AND an LC Premium Buy` (STRATEGIES.md / `confluence_check.py`). An LC Buy is NOT excluded for
failing Aroon/RVOL/ADX. This checklist is the manual confluence read layered *on top of* that
verdict — do not promote any context item (esp. Aroon) back into a hard gate without updating
STRATEGIES.md first. That promotion is what caused the March→June drift.

---

## Where this fits
- Criteria / gates: `STRATEGIES.md`, `confluence_check.py`, `LORP_optimization_log.md`.
- SID project state / history: `SID_Project_Continuity.md`.
- This file: the manual chart-side confluence checklists (previously only in TradingView AI).
