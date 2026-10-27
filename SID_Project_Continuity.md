# SID Strategy — Project Continuity

**Living doc — git is the version history (no more numbered copies).**
**Last updated:** 27 October 2026
**Supersedes:** SID_Project_Continuity_9 (29 Mar 2026) + the iCloud `v10` draft — both archive only.
**Strategy:** SID Strategy v10.5.21 (backtest) · **Indicator:** SID Trading Signals Pro v8.5.22 (entry+confluence) — code in `~/Trading Indicators` repo, `current/` folder; what is on each chart is in that repo's `CHART_INVENTORY.md`

---

## 0. Source of truth
- **Criteria authority = `STRATEGIES.md`** (this repo). If this doc disagrees with it on a
  *criterion*, STRATEGIES.md wins.
- This doc = project history + current state. It lives in the repo on purpose: version-
  controlled, autocommitted, never drifts from the code. Do not keep a separate canonical
  copy in iCloud / Google Docs (that is what caused the March→June drift).
- LORP criteria: STRATEGIES.md + `confluence_check.py` + `LORP_optimization_log.md`.

---

## 1. Reconciliation log — 30 June 2026
Audit found the live criteria had drifted from the docs. STRATEGIES.md confirmed canonical;
satellites realigned:
- `analyse-brief.cjs` — Gap/ATR (3 spots) corrected to **≥2.0 ideal · <1.5 avoid**.
- `rules.json` — Gap/ATR fixed; stale LORP/SID notes rewritten; template risk-rules pruned
  (kept: no-first-15-min, Gap/ATR, RVOL>1, prefer-ETFs).
- `lorp_monitor.py` (+ checklist) — verdict now the canonical MACD0 + LC Buy gate; six
  factors demoted to "context, not validated."
- Versions corrected: strategy → v10.5.4.15; indicator → v8.5.12 (STRATEGIES.md updated).
- **ADX band resolved:** defer to STRATEGIES.md — SID danger zone = **20–25** (<20 choppy).
  v9 §25's "30–40 danger" (4-ticker set) is archived as superseded.

---

## 1b. Findings update — 7 July 2026 (validated on the 2,618-trade `trades_all.csv`)
Committed analyses: `Indicators/sid-adx-analysis/` (ADX, MACD0-distance, DI-spread) + broad-39 OOS
verdict in `sid-macd-analysis/results/FINDINGS_out_of_sample.md`. Criteria authority stays STRATEGIES.md.

- **ADX is direction-dependent, not one band.** LONGS positive across *every* ADX bucket, *best* at
  high ADX (40–50 +1.71, 50+ +3.0) — rising/high ADX does NOT hurt a SID long (RVOL-like intuition
  holds). SHORTS net-negative: hard-avoid ADX 40–50 (run-over −3.16, avg loss −13.6%), 15–30 negative.
  Refines the "20–25 danger" note into the long/short split; 20–25 stays weakest for shorts.
- **MACD0 distance** (normalised = (MACD−Signal)/price×100) does NOT gate longs. Shorts: below-signal
  favourable; far-above (≥+0.25%) is the loss zone.
- **DI+/DI− now captured** (`merge_trades.py`, backfilled all 2,618). **DI spread (DI+−DI−) is the real
  short gate:** shorts fire in uptrends (median spread +16); spread ≥20 = run-over (−1.02). SHORT rule:
  spread < ~10, ideally DI− leading. LONGS not gated by spread.
- **Curated MACD0 "Goldilocks" (0.25–0.5% above signal) is IN-SAMPLE overfitting** — inverts on 1,403
  broad OOS shorts. `macd0_pct` changed to objective signed distance (no favourable flip).
- **Consolidated SID entry rules:** LONGS — take the oversold bounce, no ADX/MACD0/DI veto. SHORTS —
  gate hard (DI spread < ~10, MACD0 at-or-below signal, avoid ADX 40–50); most current short signals
  fail this, which is why the short book is net-negative as taken.
- **DI-spread short gate WIRED into the brief** (`analyse-brief.cjs` `sidShortCaution`): flags DI
  spread ≥ 20 (run-over veto) and 10–20 (weak-short caution), alongside the ADX-40–50 and
  MACD0-≥+0.25% flags. **3-bar spread change captured** (`di_spread_chg_3b` in merge_trades) — but
  the 3-bar change ALONE does not discriminate shorts (all bands ~−0.62); the spread LEVEL is the
  gate. `merge_trades.py` now dual-writes both repo copies (no manual cp).
- **Open:** fold the short-gate rules into STRATEGIES.md (criteria authority — not changed here); a
  level-conditional look at the spread change (narrowing TO a low level, per the TV-AI doc).

---

## 1c. Findings update — 15 September 2026

**BTW definition correction:** BTW is the name of the SID master ticker universe (the
99-ticker backtested list) — confirmed directly from `SID_Analysis_Synopsis_v2.pdf` /
`SID_Confluence_Report_v4.html`, both titled "BTW Universe Analysis." It is NOT "Buy The
Weakness" — that label appears in the LORP Continuity doc's Section 8 architecture notes and was stale/wrong there.
Fixed 15 September 2026 as part of migrating that doc into the repo (see below) — LORP
Continuity now lives at LORP_Project_Continuity.md, same convention as this doc; the old
Google Doc copy is archived with a banner pointing here.

**Three source documents filed into the repo** (previously only ever sent as chat
attachments, with no permanent home — filed today after that caused a real trust problem):
see `analysis/sid-btw-universe/README.md` for the full index and headline findings. Files:
`Backtesting_Sheet_300_SID.xlsx` (David's hand-logged 300-trade manual journal — the most
granular/highest-trust SID dataset in this repo), `SID_Analysis_Synopsis_v2.pdf` and
`SID_Confluence_Report_v4.html` (99-ticker / 2,932-signal automated BTW-universe backtest,
March 2026).

Headline findings from the automated backtest are consistent with what's already validated
above (ADX 20–25 danger zone, MACD0 as supplementary/non-gating quality check, regime filter
as primary gate). **Not yet done:** a line-by-line reconciliation of the 300-trade manual
journal against `data/trades/trades_all.csv` and against the automated BTW backtest — open
item, added to Section 5 below.

---

- **MACD0 display = RAW (MACD−Signal)** — as on the chart, LORP brief, and STRATEGIES.md. The
  (MACD−Signal)/price×100 normalisation is used ONLY inside the cross-ticker bucket analysis and the
  short-gate flags, never for display. SID brief MACD0 column corrected to raw (had shown %).
- **Brief is SID-universe-scoped:** the SID scan only evaluates SID SCREENER + SID BRIEF + BTW. A
  ticker armed on the chart but living only in another watchlist section (SBT SCANS, PULLBACK
  SCREENER, BRIEF OUTPUT…) is never scanned as a SID candidate — the chart arms on any symbol opened.
  To catch such setups in the SID brief, add them to a SID-universe section.
- **Weekly MACD Align + Weekly RSI Gate REMOVED from the SID indicator** (Trading Systems Pro
  v8.5.13, 2026-07-07). They were deprecated non-gating context (derived from the armed state,
  never gated any signal — confirmed: armed shorts fired with Weekly MACD Align = 0) that only
  cluttered the data-window export. Raw Weekly RSI value retained. There is NO weekly-alignment
  requirement anywhere in the SID pipeline (indicator, brief, or STRATEGIES.md).
- **Repo reorganised 8 Jul 2026:** Indicators content now under `Repository/{indicators,strategies,analysis,data}` (see repo README). SID analysis paths: `Repository/analysis/sid-adx-analysis/`, `Repository/analysis/sid-macd-analysis/`, data at `Repository/data/trades/trades_all.csv`. Open trades unified into one `Repository/data/open_trades.csv` (strategy column).

## 1d. Findings update — 24 September 2026: MACD cross quality (MACD Sep v1.3)

Tested whether a fresh MACD/signal cross can be judged at the close of the cross bar
instead of waiting for confirming candles (6,673 crosses, 44 journal tickers, 2018–2026 —
`analysis/macd-cross-quality/RESULTS.md`). Baseline: ~20% of crosses re-cross within 3 bars.
- **Cross-bar separation is the key factor:** >=0.22x normal cuts failure to ~10%; >=0.35x to ~8%.
- **Longs crossing below zero** (far side) fail least (6% with >=0.22x) and have the best 10-bar
  returns. Shorts crossing above zero fail less but return worse — info only, consistent with
  the existing wide-gap-short avoidance.
- Ticker whipsaw history: no useful effect (dropped). WaveTrend alignment (WT3D proxy): adds
  little once separation is known; treat "weak separation + WT not aligned" (~37% fail) as avoid.
- Filtering halves whipsaws but only modestly lifts returns — a timing aid, not a gate. Not yet
  validated against actual SID trade outcomes (open item).
- Implemented in **MACD Separation & Convergence v1.3** (Last cross grade, Cross depth, fast-expansion
  flag, quality-cross alerts, data-window exports).
- **Brief (24 Sep):** new "MACD Cross" column on SID and LORP tables — Supported (right side of
  signal, separation >=0.22x), Neutral (right side, weak), Unsupported (MACD against the trade).
  Uses v1.3's cross-bar value when on the layout, else v1.2's current separation.
- **Scan guard (24 Sep):** the 24 Sep SID scan ran 2.5h with every lower-pane study returning
  no values ("SID indicator not found"). Scan now aborts after 8 consecutive symbols missing
  the required study; morning-brief.sh reloads the SID tab and retries once.
- **US-close guard (25 Sep):** launchd still fires at 7:00 AM AEST, but from US standard time
  (Nov–Mar) that is exactly the 16:00 NY close. morning-brief.sh now waits until 16:25 New York
  time when started between 15:00 and 16:25 NY, so the final daily bar is settled. No-op in US summer.
  Separate cloud scheduled task 'Daily sector rotation report' runs 16:15 NY (6:15 AEST summer /
  7:15 winter, always before the brief): 5-day vs prior-month sector + sub-industry rotation with SID Trigger/Setup/Watch stages.
- **Clean-tab fix (26 Sep):** brief failed 26 Sep (REQUIRED STUDY MISSING) because the "SID Clean"
  tab reports the same /chart/XN1LuowU/ URL as the real SID layout and was picked first. src/connection.js
  now ignores any layout named "*Clean*" and picks the page that actually carries READY_REQUIRE_STUDY
  (SID Trading Signals / Lorentzian), preferring the pinned layout ID. SID-tab reload retry also uses it.
- **SID ready-wait (2 Oct):** brief of 2 Oct lost SID again (REQUIRED STUDY MISSING on the correct SID layout;
  reload-retry also failed) though the indicator computed fine minutes later. Likely the heavier layout since
  Pattern Finder v2.7. src/core/morning.js now re-reads study values every 2s for up to ~20s when the required
  study is missing before counting the symbol as missing. SID re-run the same afternoon from the morning watchlist.
- **Empty-screener warning (14 Oct):** brief of 14 Oct scanned only 228 symbols because SID Screener, LORP Screener
  and SBT Scans were empty at 07:00 (not refilled after the 13 Oct brief cleared them); TV SID ENTRY watchlist alerts
  dropped for the same reason. morning-brief.sh now checks those three sections after the watchlist sync and, if any
  are empty, logs a warning, adds "⚠ screeners empty" to the notification and puts a warning line at the top of the
  email. Notification LORP count fixed (pattern now matches "LORP — N LC entries").

## 2. SID = trend pullback continuation (confirmed)
Works when: clear underlying trend (SMA50/200 aligned) + temporary counter-move pushes RSI
to OB/OS + (**ideal, NOT required**) a visible **H&S / Inv H&S** structure — flat is
lower-quality, not an auto-skip + a clean bounce (RSI does NOT re-enter OS/OB) + MACD
histogram keeps converging post-entry.

---

## 3. SID entry/exit logic — from indicator source v8.5.18 (authoritative; MACD-turn entry re-confirmed 29 Sep 2026, see 1g)
- **Long entry:** OS touch (RSI ≤ 30) within last **10 bars** · RSI < 50 · RSI rising ·
  **MACD line rising** (`macd_slope_bars`=1; note: SID uses MACD-line *slope*, NOT MACD-vs-
  Signal like LORP) · valid SL · flat · >5 bars since last exit.
- **Short entry:** OB touch (RSI ≥ 70) within 10 bars · RSI > 50 · RSI falling · MACD line
  falling · valid SL · flat · >5 bars since exit.
- **SL (ADOPTED baseline — not varied):** the SID strategy stop — `floor(lowest_low)`
  (long) / `ceil(highest_high)` (short) from the setup swing — adjusted at David's
  discretion at the time. The SL1/SL2 variants were evaluated and NOT adopted; no reason
  to vary the baseline.
- **Exit:** RSI crosses 50 (long: crossover; short: crossunder), >3 bars after entry.
- **MACD vs Signal (MACD0):** a SUPPLEMENTARY check used both before entry and during/after
  the trade — but NOT the primary driver once the entry signal has fired (the SID entry signal
  + RSI-50 exit remain primary). Distinct from the entry trigger above, which uses MACD-line slope.
- **Weekly RSI:** (superseded 12/16 Oct — now a hard direction gate on completed weeks, see 1p) raw value, for a manual visual direction check only. (The computed **Weekly
  RSI Gate** & **Weekly MACD Align** were REMOVED — proved unreliable in coding.)
- **Gap/ATR Ratio** (data-window): `(close−swing_low or swing_high−close)/close ÷ ATR%`,
  10-bar swing as SL proxy. **Indicator comment confirms ">=2.0 ideal."** ✅ matches canonical.
- Data-window outputs: SID Armed Long/Short, **ADX + DI+/DI-** (Aroon dropped in favour of
  ADX+DI), ATR%, Gap/ATR Ratio, Weekly RSI (raw), SMA200. REMOVED: Weekly RSI Gate, Weekly
  MACD Align, Aroon Osc.

---

## 4. Validated findings still standing
- **Pre-entry danger flags (2+ = avoid):** F1 Gap/ATR < 1.5 · F2 ADX 20–25 (per STRATEGIES.md)
  · F3 MACD0 normalised <5 or >95 · F4 RVOL < 0.75. Worst combo F1+RVOL<1.0 = 64% SL.
- **RVOL:** <0.75 = 50–68% SL; >2.0 = 72% WR. **ATR%:** <2% tight-SL trap; >3% reduce size.
- **SL distance:** main stop-hit predictor — <2% hit >70%; wider safer.
- **Sectors:** favour Financials, Real Estate, Utilities, Consumer Defensive, **ETFs** (~4.0
  PF). Avoid Energy, Technology, Materials, Communication.
- **Direction:** longs primary (~55% post-2020, PF ~2); shorts weaker (~47%) — bear regime,
  viable sectors, ADX>25, smaller size.
- **Exit:** strongest signal = RSI re-entry into OS/OB (10% vs 70% WR).

---

> **2 Oct 2026:** the pattern, SMC and student-journal analyses (sections 1e–1k) live in the private
> **trading-indicators** repo (`~/Trading Indicators/analysis/`), not here — this repo is public.

## 1e. SID Pattern Finder — 28 September 2026 (v1.0 → v2.0 same day)

Stand-alone overlay `SID_Pattern_Finder_v2.5.pine` (in the `~/Trading Indicators` repo) for directional context before a SID entry:
Head & Shoulders, Inverse H&S, Double Top, Double Bottom.
- **v1.0 rejected on first look (ANF):** fixed 4-bar pivots picked up tiny wiggles as shoulders; no
  neckline-slope limit (an "H&S" was drawn with a steeply rising neckline); breakout labels sat far from
  their pattern; failed patterns cluttered the chart.
- **v2.0 rules:** a swing only counts once price reverses >= 1.5 ATR from it. H&S needs shoulders
  within 1 ATR of each other, head >= 0.5 ATR beyond the higher shoulder, the two neckline points within
  1 ATR (no steep necklines), shoulder timing no more than 2.5x lopsided, and a prior trend into the
  pattern (the swing before the left shoulder sits beyond the neckline). Doubles: tops/bottoms within
  0.75 ATR, middle swing >= 2 ATR deep, >= 8 bars apart, prior trend required. Max width 60 bars; no
  overlapping patterns in the same direction. Confirmed = close through neckline within 15 bars.
- **v2.0 display:** shaded shape between the swings and the neckline, LS/RS markers, name tag on the
  head/top ("forming" until broken), triangle on the break bar, labelled target. Failed / never-broken
  patterns hidden by default. Data Window "Pattern Bias": +2/+1/-1/-2.
- Offline check of the v2 rules on ANF (Feb–Sep 2026): Double Bottom 23 Jun/8 Jul confirmed 15 Jul
  (target 102.7); Double Top 26 Aug/9 Sep confirmed 15 Sep (target 117.1); one Jun double top failed
  (hidden). The false April H&S from v1 no longer appears.
- **v2.1:** a new pattern may no longer reuse the final swing of the previous same-direction pattern (GLD Jun–Jul showed two chained double bottoms sharing the 17 Jul low, each with its own target).
- **v2.2:** GLD Aug 2026 H&S (LS 12 Aug 407.4 / head 24 Aug 429.4 / RS 3 Sep 413.5, neckline ~397)
  was missed because the left-shoulder pullback was only ~1.25 ATR. Default swing size now 1.25 ATR;
  double tops/bottoms may span minor swings (kept ANF's Jul double bottom at the smaller swing size);
  trend-into-pattern now = price beyond the neckline somewhere in the 20 bars before the pattern.
  Offline check: GLD H&S confirmed 14 Sep (target 363.2) + Jul double bottom; ANF unchanged.
- **v2.3:** EMBJ Aug 2026 double top (79.76 on 10 Aug / 79.53 on 19 Aug, neckline 71.12) was missed because
  the tops were 7 bars apart (min was 8) — now 5. Note the neckline was never closed below (lowest close
  71.56), so it shows as "formed, no break"; such patterns are now shown in grey by default (failed ones
  stay hidden).
- **v2.4:** EMBJ showed a Double Top AND a Double Bottom built from the same swings (79.76 / 71.12 / 79.53
  then 71.12 / 79.53 / 71.29) — really one 71–80 range. A pattern sharing 2+ swings with one already
  shown is now held back and only replaces it if its own neckline breaks (keeps GLD's confirmed Jul
  double bottom, which overlapped a failed double top). Offline: EMBJ shows only the double top.
- **v2.6 (29 Sep):** SYK double top (352.49 / 317.62 / 349.77, broke 1 Sep, target 282.74) hit its target
  on 8 Sep but the panel still read "confirmed 18 bars ago". Patterns now switch to "target reached"
  once price touches the target: bias drops to 0, and the target line stays on the chart as a level
  (60 bars by default). File: `SID_Pattern_Finder_v2.6.pine` in the trading-indicators repo.
- **v2.7 (1 Oct):** AMPH panel showed a June double bottom as "target reached 19 bars ago" in October (hit came
  49 bars after the break) — misleading. A target now only counts if hit within 20 bars of the break;
  reached level kept 20 bars (was 60); target labels name their pattern (SECZ showed an orphaned target).
- Status: David to test against past SID entries.

## 1f. Pattern study — targets, pattern context, entry candles (28 September 2026)

Tested against 2,373 SID trades (`trading-indicators: analysis/pattern-targets/RESULTS.md`; Pattern Finder v2.5 rules
replayed without hindsight; masterclass entry candles per Caginalp & Laurent 1998).
- **Measured-move target exits don't apply to SID as traded:** 1 of 2,316 trades touched an aligned
  pattern's 50%/75% target before exit, none the 100% target. SID enters after price has fallen back
  through the neckline, so targets sit far beyond a 2–4 week bounce.
- **Exit on an opposing pattern confirming mid-trade:** no help (those trades were already -8% avg).
- **Recently confirmed pattern against the trade at entry:** lower averages (longs +0.56 vs +1.35,
  shorts -1.40 vs -0.38) but not statistically reliable and absent in 2013–19 — context only, not a rule.
- **Entry candles (TIU/TOU/3WS/MS and bear equivalents):** no edge on either side.
- Decision pending David: keep Pattern Finder as a discretionary aid; no rule changes on this evidence.

## 1g. Entry trigger reverted to MACD TURN — 29 September 2026
- **Decision (David):** SID entry goes back to the original **MACD turn** — MACD line turning in
  the same direction as RSI (`macd_slope_bars`=1) — replacing the MACD/signal **crossover-in-window**
  trigger used since v10.5.12 / v8.5.16 (25 Aug 2026). Reason: the cross was the cleaner signal but
  got him into trades too late.
- **Entry judgement aid:** MACD Separation & Convergence **v1.3** (see 1d) read alongside the turn to
  decide whether to take it — discretionary, not coded as a gate.
- **Code:** SID Strategy **v10.5.18** + SID Trading Signals Pro **v8.5.18**. Only change is the
  "Require MACD Crossover" input default true → false in both; crossover logic (incl. the v10.5.13 /
  v8.5.17 still-on-confirming-side fix) kept as a one-click option. Both must match. Not backtested yet.

## 1g. SMC order-block study — BigBeluga SMC vs SID trades (29 September 2026)

Python port of BigBeluga "Smart Money Concepts [1.0.0]" (defaults), replayed without hindsight and
checked against the SYK chart; 2,317 SID trades (`trading-indicators: analysis/smc-orderblocks/RESULTS.md`).
- **Bull order block under a SID long does not help** — 67% WR / -0.17% avg vs 72% / +1.32% (bigger
  losses, same median); consistent across eras, t = -2.0. Don't treat it as extra confidence.
- **Shorts with a bull order block within 1 ATR below did better, with much smaller losses** (+0.55% vs
  -0.60%, t = +2.4, all eras). Independent of the DI-spread gate: within DI spread >= 10, +0.61% (n 61)
  vs -0.87%. Candidate to watch, not a rule.
- SMC structure trend and liquidity sweeps: no reliable edge. Indicator's buy/sell "activity" bars are
  cosmetic (fixed 2:1 cycle), OB volume % = one candle's share among shown blocks.

## 1h. Trading the patterns directly (2 October 2026)

`trading-indicators: analysis/pattern-targets/PATTERN_TRADES.md`. Breakout (neckline) entries: no edge for double tops/bottoms
or H&S after a same-stock placebo control. **Early double-bottom longs** (enter when the second bottom is
confirmed, stop under the lower bottom, 75% measured-move target, 30-bar time stop): +1.12%/trade,
42% WR, +0.19R over placebo (t 4.2), consistent 2013–26, weak 2005–12. Candidate for a scan — David to
choose route (morning-brief Python scan vs TradingView Pine Screener).
Re-run on 101 tickers (BTW + journal symbols): early double bottoms +0.16R over placebo (t 5.2, n 4,774,
+1.34%/trade, 42% WR) — confirmed; breakout entries still no edge. David prefers using patterns as a
watchlist (not necessarily an immediate trade).

## 1i. SID x patterns watchlist test + SID Python port (2 October 2026)

`trading-indicators: analysis/pattern-targets/SID_PATTERN_WATCHLIST.md`. **SID v10.5.18 ported to Python** (`sid.py`): 8,642
generated trades on 101 tickers 2004–26; 98% of the 2,552 recorded trades in trades_all.csv matched
(same direction, ±3 days) — usable for future SID research on any universe.
- SID longs while a double bottom is forming (watchlist idea): +0.08% vs +0.89% with no pattern, n 73 —
  no benefit; the two signals rarely coincide.
- Recently confirmed pattern at SID entry hurts in both directions (longs +0.28% vs +0.89%, shorts
  -2.16% vs -0.44%). Best SID trades: no pattern showing.
- Early double bottoms remain a stand-alone setup (1h), not a SID filter. David may add student journals
  for extra validation.

## 1j. Student journals (Richard, Leen, Cathie, D-Soh) — 2 October 2026

`trading-indicators: analysis/student-journals/RESULTS.md`. 747 trades (688 priced). Only 50% match the SID port (vs 98% for
David's automated trades) — manual, discretionary back-tests. Hand-labelled aligned patterns did better
(longs +4.43% vs +3.29%, shorts +3.24% vs +2.33%, t ≈ 1.7–1.9), but an objective no-hindsight
"entry at a second bottom/top" test shows no benefit in their trades or in 8,642 generated SID trades;
only 21% of labelled patterns pass it. Likely hindsight in labelling. Student back-test results
(~80% WR, ~+3%) far exceed mechanical SID — treat manual back-tests with caution.

## 1k. Target exhaustion (2 October 2026)

`trading-indicators: analysis/pattern-targets/EXHAUSTION.md`. David's observation confirmed on timing: a third of SID trades
fire within 15 bars of an opposing pattern reaching its measured-move target. But those trades do no
better (longs +0.49% vs +0.84%, shorts -0.79% vs -0.42%; students the same). Neckline breaks show no
drift-adjusted follow-through at 10–60 bars. Look-ahead fix in patterns.py (breakout bar recorded);
breakout-entry edges now ≈ 0; early double bottom still +0.17R (t 5.4).
Re-run with MACD crossover entry (Pine option, ±5 bars of RSI touch): 2,988 trades, longs 68% / +0.55%,
shorts 58% / -0.11% — crossover lifts win rate and shorts vs slope mode. Patterns/exhaustion still no help.
Only 9% of trades_all.csv match this crossover rule — David's crossover definition to be confirmed.

## 1l. SID brief rebuilt as triage & review — 7 October 2026
Spec: `SID_DAILY_BRIEF_REQUIREMENTS.md` (David with Sid & ChatGPT). Problem: OS alert "feast" (16–44/day)
— too many to review. SID section of `analyse-brief.cjs` now answers (1) is there a credible price path
to the RSI-50 objective, then (2) do momentum/participation/context support taking it now.
- **Code:** logic in `scripts/sid-triage.cjs` (pure functions, all thresholds in `CFG`, printed in the
  brief footer); glue `buildSidTriage()` in `analyse-brief.cjs`; tests `tests/sid-triage.test.cjs`
  (long/short × below/inside/above CAP, missing data, MACD, DI, events — `node --test`).
- **Statuses (workload aid, not grades):** Review now · Conditional (≤1 named open condition; data gaps
  cap at Conditional) · Learning only (earnings ≤5 trading days, after-hours move ≥1 ATR, missed entry)
  · Exclude today (inside opposing CAP zone, hurdle <0.25 ATR, MACD opposed unless converging *fast*,
  2+ open conditions, fund/trust) · Data incomplete. Every alert stays in the table or appendix.
- **Path:** first hurdle = nearest direction-ahead level among BB mid (RSI-50 proxy), SMA50, SMA200,
  opposing CAP zone edge; levels within 0.5 ATR cluster. Open/Cleared ≥1 ATR room, Hurdle near <1 ATR.
- **DI:** only the four tags (DI Control/Shift – Buyers/Sellers); control alone never rejects.
  **MACD:** Aligned/Opposed · converging/expanding/stable/fresh cross · fast/slow (MACD Sep v1.4
  Closing Speed ≥0.15) · chop (≥2 side flips in 6 daily snapshots). No SPEED/SEP wording.
- **History** (3-bar DI/MA, prior-day MACD, earlier alerts) comes from prior saved SID scan files — no
  extra scans. Earnings date + after-hours move from ONE batched TV scanner call (same endpoint as sectors).
- **Scan fix:** CAP Tools v1.7 zone exports were missing from every SID scan 2–6 Oct (on chart, not read
  in time). `src/core/morning.js` now soft-waits ≤3 s for studies in `READY_SOFT_STUDIES` (set to
  "CAP Tools Supplement" for the SID scan in `morning-brief.sh`); stops waiting after 12 consecutive misses.
- **Not available in the SID Data Window → n/a:** pivots (Pivot points standard exports nothing),
  pattern targets (Pattern Finder exports Pattern Bias only), Weekly MACD, sector structure/turn.
  Sector result relabelled "Rotation supportive/opposed/neutral". WT3D/OBV-MACD excluded by design.
- **Audit:** `brief-YYYY-MM-DD-sid-audit.json` (briefs dir) per alert — raw inputs, derived states,
  status, reason codes. `scripts/sid-outcomes.cjs` (run by morning-brief.sh after the tables) fills
  RSI50/BB-mid/SMA reached + bars, MFE/MAE (ATR), CAP touch; expiry 15 bars.
- **Known tension to test with outcomes:** 1b found MACD0 does NOT gate SID longs; the new spec treats
  an opposing MACD as a practical exclusion for live review. Implemented per spec (fast-converging
  carve-out), audit records will show whether excluded MACD-opposed longs actually worked.
- 7 Oct morning SID scan failed (SID layout XN1LuowU not open at 7am); re-run manually same morning.
- **Follow-ups same day (David):** (a) SMA50/SMA200 now read from Moving Average Ribbon MA #2/#4
  (his chart reference), not SID Strategy. (b) Review list = TradingView alert-fire log ∪ scan entries:
  `scripts/sid-alert-log.mjs` saves `brief-DATE-sid-alerts.json` ("SID ENTRY" fires for the latest bar)
  after the SID scan; rows tagged A+S / A (alert only) / S (scan only). 6 Oct bar: 35 alerts vs 34 scan
  entries (AIR, FTSM alert-only; GOVI scan-only). (c) **Wrong-instrument bug:** bare watchlist tickers
  resolved to foreign listings (AIR→EURONEXT Airbus, NHC→ASX, SU→EURONEXT, ~25 symbols). Fixed:
  `sync-watchlist.cjs` writes `watchlist_qualified` (bare→EXCHANGE:TICKER) to rules.json and
  `morning.js` loads the qualified symbol (affects LORP scan too — correct instruments). Mismatched
  rows are flagged Data incomplete (INSTRUMENT_MISMATCH). (d) Review table split into two narrow tables.
- **Spec rev. 2 (7 Oct, David):** MACD state now read from **MACD Separation & Convergence v1.5** exports
  `MACD Gap State` (−1 closing / 0 stable / 1 expanding) and `MACD Fast Slow State` (1 fast / 0 slow);
  saved-scan history is only a fallback, and a missing earlier scan never makes a row Data incomplete
  (opposed MACD with unknown state = Conditional + data gap). Equity ETFs are now reviewed (TradingView
  files every ETF as sector "Miscellaneous"); bond/cash ETFs → Exclude (BOND_CASH_ETF); closed-end
  funds/trusts stay excluded. Sector ETFs (XL*) use their own rotation vs SPY. Conditionals sort with the
  fewest data gaps first. David filtered the ETF screener sections to equity ETFs only.
- **Sector & events table (7 Oct pm):** review list now has a third table — Sector name, SPDR ETF and
  Sector Support (🟢 Supported / ⚪ Neutral / 🔴 Unsupported = 3-day sector-vs-SPY rotation in the trade
  direction), plus Event and Src. Fixed: history lookups broke when review rows became exchange-qualified
  (NYSE:NKE) — saved scans are keyed by bare ticker, so DI shift/MA arrows had all gone n/a.

## 1m. Rotation header at the top of the brief — 8 October 2026
- The cloud scheduled task "Daily sector rotation report" (16:15 NY) now also writes a JSON sidecar
  `sector_rotation_<date>.json` (fixed schema) next to the .md in `~/Downloads/Briefs/`.
- New `scripts/rotation-header.cjs` reads the newest sidecar and prints a 7-line ROTATION header: SPY 5D vs
  prior month and groups beating SPY · SID triggers · SID setups (+ watch) · money in (flags inflows still
  below both 50/200-day) · money out (heavy volume) · overbought (+ near) · path to the full report.
- `morning-brief.sh` prepends it to the brief right after `analyse-brief.cjs`, so it is at the top of the
  saved brief, the Downloads/Briefs copy and the email body. Missing JSON → "no report found" line; older
  than 4 days → STALE flag; never fails the run. Sector-level context only — not a SID entry signal.

## 1n. SID Tramlines overlay — 9 October 2026
- New stand-alone overlay `SID_Tramlines_v1.0.pine` (trading-indicators repo, `indicators/`): auto-drawn trend
  channel over the last 10 candles (lookback adjustable) — no manual trendlines. Midline = linear regression of
  closes; rails parallel, fitted to the window's extreme wicks (alt modes: Closes, StdDev). Redrawn every bar.
- Label shows direction (UP/DOWN/FLAT, flat = |slope| < 0.05%/bar) and price position in the channel (0–100%).
- BB use: triangle markers + alerts when price tags a tramline rail AND the same-side BB (set BB length/mult to
  match the chart's BB). Data window exposes slope, state, position, rails for future brief use.
- Status: on trial — visual aid only, not a SID gate. Assess after a few weeks of use.
- v1.1 (same day): v1.0 could never show a breakout (rails included the current bar and moved to contain it).
  Channel now fitted to the 10 completed bars and projected one bar forward. Added: "BO" breakout markers +
  alerts (optional ATR buffer), BB-midline cross diamonds + alerts, label shows distance to BB mid in ATR.
  v1.0 kept for history.
- v1.2 (same day, current): plainer names for the two ATR settings ("Touch: how close to rail", "Breakout: how
  far past rail"); data-window values (incl. Tram position %) hidden from the price pane — they were drawing a
  jagged line on the chart. Use `SID_Tramlines_v1.2.pine`.
- **v1.3 (19 Oct 2026):** draws the tramlines as they stood at each **past SID entry** (fitted to the N bars
  before the entry, projected forward) with a small label: slope %/bar and position in channel. Link the two
  new "Past SID entries" inputs to SID Trading Signals Pro's Long / Short Entry Signal outputs (corrected 19 Oct); keeps the last 25 by default.
  Unlinked = identical to v1.2. Not yet compiled in TradingView. Use `SID_Tramlines_v1.3.pine`.
  Offered next: a test of channel slope / position at entry vs SID outcome on the trade list.
- **Tramlines study (26 Oct 2026)** — `analysis/sid-tramlines/` in trading-indicators, 2,547 trades. Slope is
  uninformative (98% of longs enter on a falling 10-bar channel, 98% of shorts on a rising one); the flat-base
  "FDL" picture occurs once each side. Longs: no position effect. **Shorts candidate:** entries still inside the
  rising channel 69.4% WR / +0.32% (n=307) vs at/through the lower rail 60.9% / −0.91% (n=1,176); holds in both
  eras and both Gap/ATR groups. A "BO" down at a short entry is not confirmation. Candidate only — confirm on new
  trades before any rule.
  Follow-up: 99% of SID entries already sit on the target side of the BB mid (median 1.6–1.7 ATR room), so a
  BB-mid-side tag carries no information; a "flat tramline" tag would fire on ~1% of entries. Longs > ~2.1 ATR
  from the BB mid: 67% WR vs 73–79% (weak candidate). Shorts inside-channel effect holds at any BB room.

- **v1.4 (27 Oct 2026):** David saw only older entry channels on the morning's SID names (TJX, CL, WMG, KO, MO).
  Cause: v1.3 drew past entries only on `barstate.isconfirmed` bars, and the last daily bar on a reloaded chart is
  not confirmed until the next session opens — the same issue as SID v8.5.21/22 — so the newest entry never drew.
  v1.4 uses the v8.5.22 closed-bar test, links to SID's Scan Long/Short Entry, and draws the latest-bar entry in
  white labelled "NEW". Live channel colour is unchanged: it shows slope (teal up / red down / grey flat), not a
  signal — a fresh SID long usually sits in a red (falling) live channel. File: `testing/indicators/SID_Tramlines_v1.4.pine`.
  Not yet compiled.

## 1r. SID Pattern Finder v2.8 — 19 October 2026
- `indicators/SID_Pattern_Finder_v2.8.pine`: three new Data Window values (Recent Pattern Kind 1-4/0, Recent
  Pattern Bars, Recent Pattern State 0 forming / 1 confirmed) = most recent forming/confirmed, non-held-back
  pattern within 'Recent pattern window' (default 20) bars. Drawing and detection logic unchanged — swap in on the
  SID layout freely. Now also on the LORP layout: 40 live LORP trades with a pattern in the 20 bars before entry
  averaged +3.4% (11) vs -0.9% (29) without (backtest +0.75% vs +0.14%); see LORP continuity. Not yet compiled.

## 1o. RVOL direction in the brief + RVOL-Z display tidy — 16 October 2026
- **Which RVOL-Z line matters:** the brief's RVOL = Volume ÷ SMA(Volume) (20-bar SMA), and the σ bands sit
  on the 21-bar mean — so the SMA is the reference. HMA/ALMA/LSMA are smoothing overlays only (not used
  for RVOL or Z). The indicator's own "RVOL ratio" export (30-bar avg excl. today) is only a fallback.
- **Brief (Option A, David):** RVOL now shows direction — `1.6 ↑` building / `↓` fading / `→` flat — from
  HMA(Volume) vs SMA(Volume) on the current bar (±5% band). `rvolDirOf()` / `fmtRvol()` in analyse-brief.cjs;
  SID triage RVOL cell (sid-triage.cjs) and LORP tables. Context only — no gate or status change.
- **RVOL-Z v2.1b** (`~/Trading Indicators/indicators/RVOL_Z_v2.pine`, title unchanged): Pine v6; ALMA & LSMA
  off by default; SMA (purple), +1σ (teal), +2σ (deep orange) bold; HMA dashed grey; volume bar colours
  unchanged. Display only — no values changed. Server compile check passed. Re-add to layouts to pick up.
- **LORP scan missing RVOL-Z — FIXED same day.** Cause: the price pane on the LORP layout was MAXIMISED, so
  TradingView stopped rendering the lower panes and RVOL-Z, ADX/DI, MACD Sep v1.4, WaveTrend 3D and OBV MACD
  returned no Data Window values (1–3 Oct and 11–16 Oct; same symptom as the 24 Sep SID failure). Pane restored
  live and all 11 studies confirmed reading. Guard added: `data.restoreMaximizedPanes()` runs at the start of
  every scan (`src/core/morning.js`, both layouts) and logs a WARNING if it had to restore a pane.
  LORP briefs 1–3 Oct and 11–16 Oct ran without RVOL, ADX and DI context.

## 1p. Weekly RSI gate made non-repainting — v8.5.20 / v10.5.20 — 16 October 2026
- **Background:** v8.5.19 / v10.5.19 (11–12 Oct, David) re-introduced Weekly RSI DIRECTION as a hard entry gate
  (longs need weekly RSI rising, shorts falling; toggle default ON). This supersedes the 7 Jul note below that
  there is no weekly requirement in the SID pipeline.
- **Bug:** the gate used request.security(..., lookahead_off). Live bars compared the IN-PROGRESS week with last
  week; on reload / scan / backtest each daily bar only sees COMPLETED weeks. Result: TradingView alerts fired with
  no entry marker on the reloaded chart — every SID alert 13–16 Oct was alert-only (2, 22, 18; 0 scan entries).
  E.g. CHTR 15 Oct: live week up 103.38→109.99 (pass); last completed week down 109.29→103.38 (blocked).
  Recreating the alert (15 Oct) could not fix it.
- **Fix:** gate uses completed weeks only — `ta.rsi(close,len)[1]` vs `[2]` with lookahead_on (standard
  non-repainting form) in both SID Trading Signals Pro **v8.5.20** and SID Strategy **v10.5.20**. Alerts, chart,
  brief scan and backtest now see the same thing. "Weekly RSI" in the Data Window = last completed week.
  Both compile clean. Effect: fewer mid-week alerts; ones that fire will show on the chart.
- **David to do:** replace v8.5.19 with v8.5.20 on the SID layout, then delete and recreate the "SID ENTRY"
  alert (message must still start "SID ENTRY"); swap the strategy to v10.5.20 for backtests.

## 1q. Anchored VWAP Levels v1.0 — on trial — 18 October 2026
- `~/Trading Indicators/indicators/Anchored_VWAP_Levels_v1.0.pine` (overlay, no extra panel). VWAP since start of
  Year / Quarter / Month and since last Earnings (dashed). Data Window: distance from each in ATR + "Above count".
- Purpose (David): big-picture context to sit alongside RVOL-Z v2.1b's short-term volume direction.
  Ideas: SID — nearest anchored VWAP overhead/under as a hurdle or floor; LORP — above all anchors = trend confirm.
- Status: visual trial on the chart first, context only, not a gate. Next step if it looks useful: capture in the
  brief, then back-check SID trades above vs below their quarter-to-date VWAP before giving it any ranking weight.

## 1s. Brief shows SID 0 although alerts fire — last-bar marker gate — 21 October 2026
- **Symptom:** briefs 20 and 21 Oct reported SID 0. 21 Oct: 13 "SID ENTRY" alerts fired on the 20 Oct bar
  (CBL, CHTR, CRUS, FNF, FRT, HAE, HUBG, KBE, KMX, MRP, OZK, T, TCBI) but the scan read Long/Short Entry Signal = 0
  on all 13, and the charts show no marker.
- **Cause:** the entries are genuine. On all 13 the indicator's own position ledger opened a trade on the last bar
  (DBG hold_days = 0, DBG active_sl set; Weekly RSI Long Pass = 1). But the Long/Short Entry plotshapes (and the
  alertcondition) are gated by `barstate.isconfirmed`. Live, the bar closes → confirmed → alert fires. On a reloaded
  chart / morning scan the chart's last bar is not "confirmed" until the next session opens, so the marker and the
  Data Window value read 0. The marker appears once the next bar starts. Not the v8.5.19 weekly repaint (that is fixed).
- **20 Oct:** 6 ledger entries on the 19 Oct bar (AVNT, INCY, IRTC, MIAX, RVTY, RXO) hidden the same way; no alerts
  because the v8.5.20 alert was created at 20:27 UTC, 27 min after that bar closed.
- **Fix (David chose B, 21 Oct): SID Trading Signals Pro v8.5.21** (`~/Trading Indicators/indicators/`) adds Data Window
  values "Scan Long Entry" / "Scan Short Entry" (1/0, not gated by isconfirmed). Chart markers and the alert are
  unchanged. Server compile check passed (0 errors). analyse-brief.cjs (entry detection + 3-bar history) and
  confluence_check.py now read the Scan values first, falling back to Long/Short Entry Signal, so they still work
  on v8.5.20 until the swap. Strategy stays v10.5.20 (no change needed).
- **Done 21 Oct (verified):** v8.5.21 on the SID layout (XN1LuowU); watchlist "SID ENTRY" alert now runs on v8.5.21
  ("SID Entry (Long or Short)", message unchanged). First brief to use it: 22 Oct.

## 1t. Chart markers fixed (v8.5.22) + alerts back as a brief cross-check — 23 October 2026
- **Markers:** v8.5.21 fixed the brief only; chart markers were still hidden on the closed last bar.
  **v8.5.22** gates the plotshapes with `bar_closed = barstate.isconfirmed or (barstate.islast and timenow >= time_close)`,
  so the marker shows as soon as the daily bar has closed. Alerts and alertcondition are unchanged, and the alert does not
  need recreating. Compile: 0 errors. Committed 3c17ceb. **Installed by David 23 Oct; he confirmed the markers now show.**
- **Brief alert cross-check (4c1f713):** the completed-bar scan still decides the review list. `brief-DATE-sid-alerts.json`
  is read again: rows show **A+S** (alert + scan) or **S** (scan only), and alerts the scan doesn't confirm are listed on one
  line and not reviewed. Matching uses the bare ticker on US listings. Tested on 23 Oct: alerts DT and PAGS matched the scan;
  GBX, DHT and MRNA were scan only (all excluded for earnings).

## 1u. Repo restructured to match the charts — 24 October 2026
- **Why:** what was on the TradingView charts and what was in the repo had drifted apart. Read every layout
  (hidden scripts included) and all 181 saved Pine scripts straight from TradingView.
- **Trading Indicators repo now has `current/`, `testing/`, `archive/`** (each with `indicators/` and
  `strategies/`). `current/` = the version that should be on a live layout, taken from the chart's own code.
  `CHART_INVENTORY.md` (repo root) maps every script on every layout to its file and flags mismatches.
  Committed d7592b1, pushed to both remotes.
- **Added — on SID/LORP charts but never in the repo:** MACD_Cross Zero (the MACD0 prime indicator), Golden
  Pocket Reduxe DM2, ADX Bottom Readout, RVOL + Volume Z-Score v2.1 (v2.1b display). Pullback layout set and
  Pullback Screener v1.0 also added.
- **`.gitignore` was dropping all `.md` files** — research reports and the TrendSpider specs had never been
  backed up. Now tracked (32 files added).
- **Chart mismatches found (SID):**
  - SID layout and ETF SECTORS run **Tramlines v1.1**, not v1.3. SID CLEAN runs an early v1.3 that links
    to Bullish/Bearish Trigger Cross (pre-correction). The corrected v1.3 is in `testing/` and is not on any chart.
  - ETF SECTORS runs SID Trading Signals Pro **v8.5.18** (current v8.5.22).
- **Later on 24 Oct:** Pullback and ADX Breakout retired (layouts deleted, scripts archived); GP Reduxe DM2 and
  GP Zone Exporter removed from the SID and LORP layouts and archived.
- **BB + RSI Trend v1.0/v1.1** are loaded hidden on the SID layout → filed under `testing/` (see the
  BB/Tramlines discussion of 24 Oct: they trade shallow dips with RSI > 50, the opposite state to SID; candidate
  v2 = tramline slope UP + rail/BB double touch, to be checked against the Pullback strategy first).

## 1v. BB midline + tramlines — agreed reading of a SID entry (26 October 2026)
Agreed with David after the Tramlines study (1n). Entry context only — not a gate, and the SID trigger
(RSI OS/OB touch, then RSI and MACD turning) is still the signal. Not tested outside SID entries.
- **Long:** the SID trigger fires below the BB mid as price turns up. Up to ~2 ATR below the mid is normal
  (73–79% WR); more than ~2 ATR below = **Stretched**, a caution not a veto (67%). Tramline angle and
  position make no difference for longs.
- **Short:** the SID trigger fires above the BB mid as price turns down. Distance to the mid makes no
  difference. Prefer entries still **inside** the rising tramline channel (69% WR vs 61% when price has
  already closed through the lower rail — candidate, confirm on new trades). A "BO" down at entry is not
  confirmation.
- **BB mid is the objective, not a filter:** 99% of SID entries already start on the target side of it. A
  close through the mid after entry (Tramlines blue/orange diamond) means the trade is at or near its RSI-50
  objective.
- **How to tag from the Tramlines entry label:**
  Tramline — long: pos < ~80% = Inside, ≥ 80% = Through rail; short: pos > ~20% = Inside, ≤ 20% = Through
  rail; add "Flat" only if slope is within ±0.05%/bar (rare, ~1% of entries).
  BB room — more than 2 ATR from the BB mid at entry = Stretched, otherwise Normal.
  Used alongside the existing Trend – Supports / Does Not Support tag.
- Worked example: AEP long, 5 Oct 2026 — label "−0.01%/bar, pos 60%" → Tramline Inside, Flat; ~1 ATR to the
  BB mid → BB room Normal; crossed the mid within two bars, RSI-50 exit.

## 5. Open items (need input — not resolvable from files)
- [ ] Reconcile the 300-trade manual journal (`analysis/sid-btw-universe/Backtesting_Sheet_300_SID.xlsx`) against `data/trades/trades_all.csv` and the automated BTW-universe backtest — three SID datasets now exist and haven't been cross-checked against each other.
- [x] ~30% of brief candidates were funds/trusts, not equities — fixed 17 Sep 2026 by excluding sector "Miscellaneous" tickers from both `lorpAll` and `sidPass` in `analyse-brief.cjs`; see `LORP_Project_Continuity.md`'s 17 Sep entry for the full writeup (applies to both strategies).
- [ ] Test SID Pattern Finder v2.5 against past SID entries (David, manual). Automated study (1f) found no rule-worthy edge; send any trade where a clear pattern was missed or a target exit would have helped.
- [ ] Watch: SID shorts with a bull order block within 1 ATR below (SMC study 1g) — revisit with more trades before any rule.
- [ ] Strategy changes v10.5.4.12 → .15 detail (what changed since 29 Mar).
- [ ] BTW universe re-export status (v10.5.4.10+, Ticker Regime ON).
- [ ] SID triage (1l): after ~4–6 weeks of audit records, test whether CAP room, BB-mid distance, MACD
      opposition/chop, DI shift and event risk improve selection; only then consider upstream alert changes.
- [ ] Re-add SID Tramlines to the SID and ETF SECTORS layouts at the intended version (now v1.4; chart runs v1.1), and SID Trading Signals Pro v8.5.22 on ETF SECTORS.
- [ ] Confirm the Tramlines shorts candidate (inside rising channel vs through lower rail) on trades after Oct 2026.
- [ ] Decide whether the hidden scripts on the SID layout (10 of them) stay or move to a test layout.
- [ ] Recent live-trade findings (39-trade journal is in `SID DATA/`; losers catalogued in
      `scripts/sid_factor_grade.py`).

---

## 6. References
- Canonical criteria: `STRATEGIES.md` · LORP validation: `LORP_optimization_log.md`,
  `confluence_check.py` · SID indicator: SID Trading Signals Pro v8.5.12 (Pine).
- Historical archive: SID_Project_Continuity_9 (29 Mar) · Google Doc (legacy; stop using as
  canonical): https://docs.google.com/document/d/1Ymq2gQa2abj6GgtyYgIk71tteZiWs6b_7TD2KnNcUdM/edit

- **CORRECTION (9 Jul):** the "shorts favour below-signal MACD0" finding is the BROAD short population; genuine SID OB fades (RSI>=70) are ~99% ABOVE signal, so MACD0 side is NOT a SID-short discriminator. The MACD *turn* is the trigger; gate shorts on DI spread + ADX. SID short score changed to /3 (MACD0 dropped).
