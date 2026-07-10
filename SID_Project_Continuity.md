# SID Strategy — Project Continuity

**Living doc — git is the version history (no more numbered copies).**
**Last updated:** 7 July 2026
**Supersedes:** SID_Project_Continuity_9 (29 Mar 2026) + the iCloud `v10` draft — both archive only.
**Strategy:** v10.5.4.15 (backtest) · **Indicator:** SID Trading Signals Pro v8.5.12 (entry+confluence)

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

## 2. SID = trend pullback continuation (confirmed)
Works when: clear underlying trend (SMA50/200 aligned) + temporary counter-move pushes RSI
to OB/OS + (**ideal, NOT required**) a visible **H&S / Inv H&S** structure — flat is
lower-quality, not an auto-skip + a clean bounce (RSI does NOT re-enter OS/OB) + MACD
histogram keeps converging post-entry.

---

## 3. SID entry/exit logic — from indicator source v8.5.12 (authoritative)
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

## 5. Open items (need input — not resolvable from files)
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
