# SID Strategy — Project Continuity

**Living doc — git is the version history (no more numbered copies).**
**Last updated:** 29 September 2026
**Supersedes:** SID_Project_Continuity_9 (29 Mar 2026) + the iCloud `v10` draft — both archive only.
**Strategy:** SID Strategy v10.5.18 (backtest) · **Indicator:** SID Trading Signals Pro v8.5.18 (entry+confluence) — code in `~/Trading Indicators` repo

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
- **Weekly RSI:** raw value, for a manual visual direction check only. (The computed **Weekly
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
- Status: David to test against past SID entries.

## 1f. Pattern study — targets, pattern context, entry candles (28 September 2026)

Tested against 2,373 SID trades (`analysis/pattern-targets/RESULTS.md`; Pattern Finder v2.5 rules
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
checked against the SYK chart; 2,317 SID trades (`analysis/smc-orderblocks/RESULTS.md`).
- **Bull order block under a SID long does not help** — 67% WR / -0.17% avg vs 72% / +1.32% (bigger
  losses, same median); consistent across eras, t = -2.0. Don't treat it as extra confidence.
- **Shorts with a bull order block within 1 ATR below did better, with much smaller losses** (+0.55% vs
  -0.60%, t = +2.4, all eras). Independent of the DI-spread gate: within DI spread >= 10, +0.61% (n 61)
  vs -0.87%. Candidate to watch, not a rule.
- SMC structure trend and liquidity sweeps: no reliable edge. Indicator's buy/sell "activity" bars are
  cosmetic (fixed 2:1 cycle), OB volume % = one candle's share among shown blocks.

## 5. Open items (need input — not resolvable from files)
- [ ] Reconcile the 300-trade manual journal (`analysis/sid-btw-universe/Backtesting_Sheet_300_SID.xlsx`) against `data/trades/trades_all.csv` and the automated BTW-universe backtest — three SID datasets now exist and haven't been cross-checked against each other.
- [x] ~30% of brief candidates were funds/trusts, not equities — fixed 17 Sep 2026 by excluding sector "Miscellaneous" tickers from both `lorpAll` and `sidPass` in `analyse-brief.cjs`; see `LORP_Project_Continuity.md`'s 17 Sep entry for the full writeup (applies to both strategies).
- [ ] Test SID Pattern Finder v2.5 against past SID entries (David, manual). Automated study (1f) found no rule-worthy edge; send any trade where a clear pattern was missed or a target exit would have helped.
- [ ] Watch: SID shorts with a bull order block within 1 ATR below (SMC study 1g) — revisit with more trades before any rule.
- [ ] Strategy changes v10.5.4.12 → .15 detail (what changed since 29 Mar).
- [ ] BTW universe re-export status (v10.5.4.10+, Ticker Regime ON).
- [ ] Recent live-trade findings (39-trade journal is in `SID DATA/`; losers catalogued in
      `scripts/sid_factor_grade.py`).

---

## 6. References
- Canonical criteria: `STRATEGIES.md` · LORP validation: `LORP_optimization_log.md`,
  `confluence_check.py` · SID indicator: SID Trading Signals Pro v8.5.12 (Pine).
- Historical archive: SID_Project_Continuity_9 (29 Mar) · Google Doc (legacy; stop using as
  canonical): https://docs.google.com/document/d/1Ymq2gQa2abj6GgtyYgIk71tteZiWs6b_7TD2KnNcUdM/edit

- **CORRECTION (9 Jul):** the "shorts favour below-signal MACD0" finding is the BROAD short population; genuine SID OB fades (RSI>=70) are ~99% ABOVE signal, so MACD0 side is NOT a SID-short discriminator. The MACD *turn* is the trigger; gate shorts on DI spread + ADX. SID short score changed to /3 (MACD0 dropped).
