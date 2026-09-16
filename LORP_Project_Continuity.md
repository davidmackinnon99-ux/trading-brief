**Living doc — git is the version history, matching SID_Project_Continuity.md (see its §0).**
Migrated from the Google Drive copy 15 September 2026, after that copy caused a real
continuity/trust problem (content only findable if it happened to be resent in chat).
The Google Doc it came from is now marked archived/superseded and points back here — do
not create a new canonical copy there. This migration also corrects a stale label: BTW is
the SID master ticker universe (99-ticker backtested list), not "Buy The Weakness" — see
the corrected watchlist-sections note in Section 8 below and SID_Project_Continuity.md.

---

╔══════════════════════════════════════════════════════════════════╗
║ CURRENT STATE — updated 13 September 2026 (supersedes items below ║
║ where they conflict; original 11 May 2026 document retained       ║
║ beneath as history)                                                ║
╚═══════════════════════════════════════════════════════════════════════╝

STATUS: Active development. Bar set by David: LORP stays in the toolkit
only if it produces reversion winners with losses controlled.

KEY FINDING — kernel distance is not repaint-proof:
Kernel-based distance metrics (Section 13 below, "Distance from Kernel"
as an entry-quality filter) proved unreliable in practice — sensitive to
indicator settings and subject to repainting. David's live-recorded
signal dates are the only repaint-proof anchor for backtesting; do not
trust historical kernel-distance values pulled after the fact.

KEY FINDING — reversion vs trend split (34 tickers / 653 entries):
A clean 65% reversion / 35% trend split was found across entries.
Entering at the revert-low (rather than on signal) improves the
reversion bundle's profit factor from 0.75 to 1.61.

KEY FINDING — retracement discipline (June 2026 trade review):
Retracements deeper than ~30% of the prior swing failed catastrophically.
MACD0 discipline alone (exiting/avoiding entries once MACD crosses below
zero) could have cut ~40% of losses. MACD0 is now treated as the prime
indicator for LORP, same as for SID.

CURRENT TOOLING:
• LORP_Backtest_Adapter_v2.13.pine (strategies/ in ~/Trading Indicators, committed
  2 Aug 2026): adds Wait-to-Enter (arm on signal, enter on a 2/2 higher-low
  turn = REV tag, or a close reclaiming the signal-bar high = TREND tag;
  15-bar timeout with no trade if neither happens), MACD0-cross exit,
  kernel-break exit (close < kernel — confirmed break, not low <= kernel,
  fixing a v2.12 bug where the default close-source exit fired every bar).
  Confirmed compiling clean in TradingView (2 Aug 2026).
• GP Reduxe DM v1.1 (committed): Fib bands retuned 0.30/0.45 (provisional,
  pending calibration against real rebound lows), Max Closed GPs raised
  4→30 for a ~2-month lookback.

OPEN THREADS:
  [ ] Forward-monitor First Pullback + kernel colour/direction vs the v2.13
      adapter behaviour.
  [ ] Run Wait-ON + MACD0-exit-ON and split the export by REV/TREND tag —
      test whether the reversion bundle moves from ~0.75 toward the ~1.61
      seen in the 34-ticker study.
  [ ] Calibrate GP Reduxe DM 0.30/0.45 Fib bands against real rebound lows
      (currently provisional).

FIXES — Brief Output bloat, stale footer line, ASX/invalid bug (13 Sep
2026): Three bugs fixed in analyse-brief.cjs, all committed to git.
(1) The "Brief Output" watchlist push had been carrying forward any
LORP-screener ticker with a positive Buy Volume Delta regardless of
actual signal state (58 tickers pushed on the 12 Sep brief vs ~14 tickers
actually shown in the printed tables) — same bloat pattern already fixed
once for the printed Trend table on 9 Sep 2026 but never mirrored into
the Brief Output feed. Corrected per David's standing instruction: only
Pullback-table tickers showing a reversion signal that has NOT yet fired
an actual LC entry are carried forward as a watchlist; once an entry
fires, it's David's own call to act on immediately, so it's evicted from
the watch list right away rather than lingering. (2) Removed the stale
duplicate "Distance from Kernel (Pullback/Trend/Breakout)" line from the
confluence-factors footer, which repeated the Type legend already printed
above it. (3) Fixed the "ASX/invalid" watchlist bug: genuinely new
tickers (e.g. MLYS, PBR, RHI, SHG on 9 Sep) were being excluded from the
Brief Output push because the sidecar JSON wrote bare tickers without an
exchange prefix, which push-watchlist.cjs could only recover by matching
against tickers already elsewhere in the TradingView watchlist — brand
new tickers have no such match and got silently dropped, mislabelled as
an ASX-listing issue even though none were ASX-listed. Fixed by carrying
the fully-qualified EXCHANGE:TICKER form through to the push instead of
the bare symbol.

NEW FEATURE — live sector/industry support tagging (13 Sep 2026): see the
SID continuity doc for full detail (identical feature, applies to both
the SID and LORP brief tables) — each row now tags Supported / Neutral /
Unsupported by comparing the ticker's own sector against live SPDR
sector-ETF-vs-SPY rotation, direction-aware against the LORP Long/Short
signal.

FIX — Sector support tag inverted on MR rows; TV REMIX source unlabelled
(16 Sep 2026): David flagged the Sector column on the 16 Sep brief as
wrong, and asked why some tickers showed Src "TV". Two bugs in
analyse-brief.cjs, both fixed and committed:
(1) The direction fed into the sector-support check (sectorTagDisplay)
was read off backtestStream's raw sign, but the native code's sign only
tracks Long/Short (+-1) and First Pullback (+-3) — Standard/Strong MR is
inverted (+4/+5 = "Downward MR" = bearish, -4/-5 = "Upward MR" = bullish).
Every row in the LORP Screener - Pullback table (all the Standard/Strong
Upward/Downward MR rows) was tagged against the opposite direction —
e.g. KR and GRDN showed Unsupported when Supported was correct, GE and
MLTX the reverse. Fixed by mapping from the actual backtestStream code
instead of its sign. (2) The new "TV REMIX" watchlist section (David's
tvremix.xyz dashboard picks, added to the watchlist ~15 Sep — see the
morning-brief-pipeline note on TV Remix) had no explicit case in
normalizeSrc(), so it fell through to the generic "first word of the
section name" fallback — "TV REMIX" -> "TV". Not a new data source, just
this section going unrecognised; given an explicit "TVX" label instead.
Also fixed autocommit-brief.sh to push whenever local main is ahead of
personal/main, not only right after this script's own commit, so a fix
committed directly to the repo (as these were) doesn't sit unpushed until
something else changes.

REPO HOUSEKEEPING (13 Sep 2026): the working repo copy on David's Mac had
forked from its GitHub backup — 3 commits existed on GitHub (5 Aug + 11
Sep 2026) never pulled into this working copy, and one of them (11 Sep)
was, unbeknownst to whoever fixed it locally today, an EARLIER fix of the
exact same stale kernel-distance footer line described in fix (2) above —
done independently on the GitHub-only copy on 11 Sep, never seen by this
working copy. Reconciled via git merge, resolved in favour of the working
copy (which had already superseded all three GitHub-only commits more
completely — later RVOL threshold change, VD/Aroon/WRB already dropped
from the footer legend), and pushed back to GitHub; both copies confirmed
back in sync as of 13 Sep 2026.

── Everything below this line is the 11 May 2026 document as originally
   written. Treat Sections 1-12 (indicator/brief architecture) as still
   broadly accurate; treat Section 13's kernel-distance filter proposal
   as superseded by the repaint finding above. ──

LORP Strategy Development — Project Continuity Document
Last updated: 11 May 2026
Status: Morning brief redesigned with dual-layout scanning (LORP + SID layouts).
        TV Screener is the sole gate for LORP. SID section added using SID
        Confluence indicator data window. Brief architecture: LORP scan first
        (120s wait), then SID scan. vs Open column replaces PB% (prev_close
        not available from TV MCP API). See Section 8 for full brief design.

1. Project Overview
LORP is a Lorentzian Classification-based trend-following strategy using the
Lorentzian Classification Premium v3.0 indicator by Justin Dehorty. It identifies
the nearest-neighbour patterns in feature space and fires Long/Short signals
accordingly. David trades LORP Long-only on the daily timeframe.

Key people: David (Brisbane, retired trader)

2. Strategy Characterisation
LORP is a trend-following pullback system, not a mean-reversion strategy.
It works best when:
1. A clear trend is established (EMA21 > EMA34, EMA21 > SMA200)
2. Price has pulled back close to EMA21 (within ~2% — Booker Proximity)
3. The Kernel Regression Estimate supports the direction
4. Institutional accumulation is present (RVOL surging then normalising)
5. Price is in the upper half of Bollinger Bands (%B > 0.5)

This characterisation is validated by the factor study (Section 5).
LORP is fundamentally different from SID — do not apply SID factors to LORP.

3. Current Indicator
Indicator: Lorentzian Classification Premium v3.0
Alert condition: "Open Long" — fires once per bar close
Bar max setting: 3000 (user-configured, not default)
Timezone: Exchange

CSV Export Structure (confirmed 8 May 2026):
  Col A  time                      Unix timestamp
  Col B  open
  Col C  high
  Col D  low
  Col E  close
  Col F  Kernel Regression Estimate
  Col G  Distance Above Kernel     — populated when price above upper envelope
  Col H  Distance Below Kernel     — populated when price below lower envelope
  Col I  Buy                       — entry price when buy signal executes
  Col J  Sell                      — entry price when sell signal executes
  Col K  StopBuy                   — stop level (empty when dynamic exits selected)
  Col L  StopSell                  — stop level (empty when dynamic exits selected)
  Col M  Distance from Kernel      — distance % from kernel regression estimate
  Col N  Upper Envelope: Far
  Col O  Upper Envelope: Average
  Col P  Upper Envelope: Near
  Col Q  Envelope Midline
  Col R  Lower Envelope: Near
  Col S  Lower Envelope: Average
  Col T  Lower Envelope: Far
  Col U  Chars (Regular Down Reversion)
  Col V  Chars (Strong Down Reversion)
  Col W  Chars (Regular Up Reversion)
  Col X  Chars (Strong Up Reversion)
  Col Y  Shapes                    — price level when ShapeY fires (Sell warning 4hr)
  Col Z  Shapes                    — price level when ShapeZ fires (Buy warning 1D)

Key insight (8 May 2026): The Buy column (Col I) records the ENTRY PRICE when
the entry executes — it is NOT a binary flag. The Chars columns (U-X) record
the ML reversion signal. These are separate events that can fire on different bars.

Entry signal logic (confirmed from 4hr INDV CSV analysis):
  Pullback entries: Kernel rising AND Distance from Kernel declining from recent peak
  Breakout entries: Price above Upper Envelope Far (Col G populated)
  Entries fire at different times on 4hr vs 1D — both valid timeframes

ShapeZ (Col Z) on 1D chart:
  Very rare signal — only one instance in INDV 1D history (22 Oct 2025)
  Value = price level when shape appears
  Fired 8 trading days before the subsequent Buy entry (3 Nov 2025)
  Represents a pre-entry warning — watch ticker closely when ShapeZ appears
  Very small visual size on chart — hard to see. Request jdehorty to increase size.

Known Alert Lag Bug (reported to jdehorty 8 May 2026):
  Symptoms observed across 4 tickers on 6-8 May 2026:
  - INDV:  Chars signal 30 Apr, Buy entry 1 May (correct — 1 bar lag)
  - AROC:  Chars signals 30 Apr + 5 May, alert fired 6 May, NO label on chart
  - MDLZ:  Chars signal 29 Apr, Buy entry 8 May (7 trading days late)
  - COLM:  Chars signal 17 Apr, Buy entry 8 May (~3 weeks late)
  Evidence: CSV timestamps confirm exact signal dates. Alert firing dates confirmed
  from TradingView alert notifications received in Brisbane.
  Hypothesis: Alert fires when price re-crosses a level related to original signal,
  not when the Chars signal fires. Possibly Distance from Kernel threshold crossing.
  Status: Under investigation by jdehorty. CSVs and screenshots provided.
  Previous workaround: "Signal must be within 2 bars to be actionable" —
  THIS IS NO LONGER SUFFICIENT given multi-week lags observed.
  New approach: Always verify Buy column (Col I) in CSV for entry date before acting.

4. TradingView Chart Setup (current)
Indicators on LORP chart:
• Lorentzian Classification Premium v3.0 (signal source)
• LORP Moving Averages: MA#1 = EMA50, MA#2 = SMA200
• LORP Confluence v1.4 (companion confluence indicator — see Section 7)
• Bollinger Bands (Basis, Upper, Lower)
• MACD_Cross Zero
• WRB Confluence v1.0
• Average True Range Stop Loss Finder v2.4
• Aroon Oscillator [BigBeluga]
• ADX and DI for v4
• RVOL + Volume Z-Score v2.1
• Volume Delta
• HTF Reversal Divergences [LuxAlgo]
• Sharpe and Sortino Ratios

NOTE: EMA20 is not currently in the export. LORP Moving Averages outputs
EMA50 (MA#1) and SMA200 (MA#2) only. Full EMA stack (8>20>50) validated by
factor study (Section 5) is not fully checkable with current export.
LORP Confluence v1.4 adds EMA21 and EMA34 to the data window.

5. Factor Validation Study
Source: LORP_MultiTicker_Confluence_Report_v2.html
Study: 10 tickers — TSLA, GTES, WFC, CF, JNJ, LUNR, ODFL, CSWC, MTSI, IBKR

Validated factors — KEEP:
Factor                      Verdict       Notes
Aroon Oscillator > 0        9/10          Strongest universal factor. +6.7pp to +40pp.
EMA Stack (20>50, P>50)     8/10          TSLA and MTSI only outliers.
MACD > Zero                 8/10          Same outliers as EMA.
%B above 0.5                8/10          CF edge 0.47 — largest single factor gap.
RVOL declining from peak    7/10          Direction matters, not level alone.
                                          Surge then normalise = accumulation pattern.
WRB Prior 5 Bars            6/10          Moderate positive. Same pattern as RVOL.
PP Prior 3 Bars             6/9           Prior-bar PP > entry-bar PP.
                                          PP on entry bar may mean move has started.

Removed factors — NEGATIVE EDGE:
Factor                      Verdict       Notes
MACD > Signal Line          9/10 fail     Universally counterproductive. Never use.
WRB on Entry Bar            7/10 fail     Chasing the move — wide bar at entry = bad.
Distance from Kernel        7/10 fail     Used internally by LORP. No additive value.

6. Current Analysis Files
File                                          Description
LORP_MultiTicker_Confluence_Report_v2.html    10-ticker factor study (primary reference)

7. LORP Confluence v1.4 — TradingView Indicator

Purpose: Companion indicator showing whether the environment is right for
a LORP entry. Does NOT replace LORP — LORP makes the entry decision.

Current version: v1.4 (deployed May 2026)
File: LORP_Confluence_v1.4.pine

Tier 1 — Hard filters (ALL must pass):
  EMA21 > EMA34        (CAP short-term ribbon bullish)
  EMA21 > SMA200       (broad trend health)
  ADX >= 17            (trend strength present)
  DI+ > DI-            (bullish trend direction)
  ATR% 1–8%            (volatility in tradeable range)

Tier 2 — Confluence scoring (7 effective factors):
  Booker Proximity     DISABLED in Pine Script — hardcoded true, not scored
                       (re-enable when using as pre-entry warning tool)
  Booker Bullish Close close > open on signal bar
  BB %B > 50           or price walking upper band
  Stochastic RSI       K > 20 and K > D
  Aroon Oscillator     >= 15
  RVOL + Vol Delta     RVOL >= 1.0 AND bullish close (or Aroon >= 60)
  WRB                  wide range bar within lookback bars
  MACD                 MACD > Signal AND gap widening

Pass threshold: tier2_min = 4 of 7 effective factors

Visual output:
  Green circle above bar  = Full Confluence Pass (Tier 1 + Tier 2)
  Yellow diamond          = Tier 1 Pass / Tier 2 Marginal
  Red X                   = Tier 1 Fail (shown on last 5 bars only)
  Label on current bar    = status, T2 score/7, proximity tier, dist from EMA21

Data window outputs (for morning brief scanner):
  Full Confluence Pass             — plot on all bars (barstate.islast issue — see bug below)
  Tier 1 Pass / Tier 2 Marginal   — plot on all bars
  Tier 1 Fail                     — plot on all bars
  EMA21                           — current value (reliable)
  EMA34                           — current value (reliable)

Known bug: barstate.islast plots are intended to output 1 only on the
current bar, but the CDP scanner reads historical bar values rather than
the live bar. This causes the indicator flags to be unreliable for scanner use.
The morning brief now calculates Tier 1 and Tier 2 directly from raw data window
values and ignores the indicator pass/fail flags entirely.
This bug should be fixed in the Pine Script when time permits (separate task).

8. Morning Brief — Architecture (as of 11 May 2026)

The morning brief runs at 6:30 AM AEST Tue–Sat via launchd.
Script: ~/tradingview-mcp-jackson/scripts/morning-brief.sh
Analyser: ~/tradingview-mcp-jackson/scripts/analyse-brief.cjs

DUAL-LAYOUT SCAN ARCHITECTURE:
  Scan 1 — LORP layout (runs FIRST):
    Switch to LORP layout → wait 120s → scan LORP SCREENER + LORP BRIEF
    + PULLBACK SCREENER → save brief-DATE-lorp.json
    LORP layout must be open at 6:30am for LC Premium to be pre-calculated.
    Do NOT leave TV on SID layout overnight.

  Scan 2 — SID layout:
    Switch to SID layout → wait 90s → scan SID SCREENER + BTW
    → save brief-DATE-sid.json

  Analysis: analyse-brief.cjs reads both JSON files → combined email output

BRIEF SECTIONS:
  LORP section  — LORP SCREENER + LORP BRIEF tickers
                  TV Screener is sole gate (no additional filtering in code)
                  Columns: Price | Type | Dist | ATR% | RVOL | VD | Aroon |
                           WRB | Range% | vs Open | EMA50 | SMA200
                  Type: Pullback (Dist<1.5) | Trend (1.5-2.5) | Breakout (>2.5)
                  Sorted: Pullback→Trend→Breakout, within each by Dist ascending
                  Split: Buy VD first, Sell VD second (context only)
                  Footer: LORP BRIEF import list (Buy VD tickers alphabetical)

  SID section   — SID SCREENER + BTW (combined, deduplicated)
                  Gate: SID Armed Long/Short = 1 AND Weekly RSI Gate = 1
                  Columns: Price | Dir | SMA200 | Aroon | ADX | ATR% | RVOL | VD | Source
                  Source: BTW flagged separately from SID Screener
                  Split: Long candidates first, Short candidates second

  Pullback section — PULLBACK SCREENER tickers
                  Elevated RVOL (≥2x) table first, then Buy VD, then Sell VD
                  All same-table format with SMA50/SMA200/RVOL/ATR%/VD

  ADX Breakout  — all watchlist tickers with ADX < 18
                  Columns: ADX | RVOL | VD
                  Split: Buy VD first, Sell VD second

KEY COLUMN NOTES:
  Dist      = Distance from Kernel in ATR units (from LC Premium data window)
              Col M in CSV export. Always positive. Low = near kernel.
  vs Open   = (close - open) / open × 100. Negative = pulling back from open.
              Note: prev_close not available from TV MCP API — open used as proxy.
  Range%    = (high - low) / low × 100. Intraday range size.
  WRB       = Wide Range Bar in prior bars (from WRB Confluence indicator)
              Note: currently ~95% pass rate — consider removing if still true
              after 2+ weeks of live data.

WATCHLIST SECTIONS (in TV):
  LORP SCREENER     — LORP tickers from TV Screener (primary)
  LORP BRIEF        — LORP early warning candidates (imported from prior brief)
  SID SCREENER      — SID tickers from TV Screener
  BTW               — SID master ticker universe (99-ticker backtested list; NOT an
                       acronym for a strategy — corrected 15 Sep 2026, see
                       SID_Project_Continuity.md / analysis/sid-btw-universe/)
  PULLBACK SCREENER — Pullback strategy candidates

TV SCREENER CRITERIA (LORP):
  ATR 1–5%, MACD>0, EMA21>EMA34, Vol>500K, RelVol>0.8,
  Price>EMA34, Aroon Down<30%, RSI 45-75

INDICATORS REQUIRED ON LORP LAYOUT:
  ML: Lorentzian Classification Premium  (Kernel, Distance from Kernel)
  LORP Confluence v1.4                   (EMA21, EMA34)
  LORP Moving Averages                   (MA#1=EMA50, MA#2=SMA200)
  WRB Confluence v1.0                    (WRB Prior Bars)
  Volume Delta                           (Vol Delta)
  RVOL + Volume Z-Score v2.1             (RVOL ratio)
  Average True Range Stop Loss Finder    (ATR%)
  ADX and DI for v4                      (ADX — for ADX Breakout section)
  Aroon Oscillator [BigBeluga]           (Aroon Oscillator)

INDICATORS REQUIRED ON SID LAYOUT:
  SID Confluence v1.0 (SID-C)  — outputs to data window:
    SID Armed Long, SID Armed Short, Weekly RSI Gate,
    Weekly MACD Align, Aroon Osc, ADX, ATR%, Gap/ATR Ratio,
    Weekly RSI, SMA200

9. LORP Confluence Checker (Mac Automator) — Version History

Background
Evaluates confluence context for LORP Long signals. All factors INFORMATIONAL
ONLY. No hard gates, no pass/fail, no scoring. The only gate is signal presence.
Signal detection: Long (Chart) = 1 within 2 bars.

CSV export requirements (v3.3):
  Signal:  Long (Chart) col 60
  MA#1:    EMA50 (combined MA indicator, slot 1)
  MA#2:    SMA200 (combined MA indicator, slot 2)
  Other:   Upper, Lower (BB), MACD, Aroon Oscillator, RVOL ratio,
           WRB Prior Bars, Pocket Pivot, Volume Delta (Close),
           ATR% raw (buffer ref), Volume

v3.3 (7 April 2026) — current production
• FIX: RVOL corrected to declining-from-5-bar-peak check (was level-based).
• FIX: "HTF RSI Div" renamed to "Daily RSI Div" throughout output.

v3.2 (7 April 2026)
• FIX: Column detection for new combined MA indicator
• FIX: EMA stack replaced with separate EMA50 + SMA200 context lines
• FIX: Earnings date warning removed (SID-specific)

v3.1 (7 April 2026)
• FIX: Weekly RSI/MACD removed from header (not gates for LORP)

v3.0 (7 April 2026)
• REWRITE: fully informational, no scoring, no threshold
• CHANGE: Signal detection to Long (Chart) = 1, 2-bar lookback
• ADD: Weekly RSI/MACD (informational), HTF Divergence, HTF Pattern, SMA200, ATR%
• REMOVE: Pass/fail, MACD>Signal, WRB on Entry Bar

v2.1 (prior — zsh)
• 7 scored factors, pass threshold 5/7
• Signal: Buy column (now empty in current exports)

10. LORP Daily Scanner — Scope (7 April 2026)
Status: Scoped, not yet built. Morning Brief now partially fulfils this role.

Design Decisions
• Universe: Extended US large-cap/ETF list (~327 tickers in current morning brief)
• Timeframe: Daily bars, weekly HTF
• Scan timing: End of day (GitHub Actions)
• Signal logic: Cannot replicate LORP ML classification in Python. Scanner checks
  confluence conditions that make a LORP signal worth acting on.
• Long-only at this stage.

NOTE: The morning brief (Section 8) now provides a real-time LORP screen at
6:30 AM using live TradingView data. This may reduce the need for a separate
end-of-day scanner.

11. Pending Items (11 May 2026 — see CURRENT STATE at top for Aug 2026 status)
• Fix LORP Confluence v1.4 barstate.islast bug in Pine Script
• Investigate ShapeZ detection in data window for pre-entry warning
• Request jdehorty increase ShapeZ visual size on chart
• Alert lag bug — awaiting response from jdehorty (reported 8 May 2026)
• Review exit signal columns (Col K StopBuy) — empty due to dynamic exits selected
• Confirm envelope band ATR calculation method with jdehorty
• Monitor clean vs full layout for label rendering differences
• Monitor WRB pass rate — if still ~95% after 2 weeks, remove from brief
• Investigate No LC data tickers (CBT, CVS, LINC, MAS, P, POWI) — consistently
  failing to return Distance from Kernel despite LC Premium being on chart
• Validate SID section signal quality over 2–4 weeks of live runs
• Update SID Project Continuity document with new brief architecture

12. LOR HC Nano — Version History

Current version: R5.4 (11 April 2026)
File: LOR_HC_Nano_R5.4.pine
Pine Script overlay indicator for trailing stop management on LORP trades.

R5.4 (11 April 2026) — current
• ADD: Trade Context input group — Entry Price, Initial SL, Manual Stop Override,
  Min Return % Floor, Show RR Levels, Show Live Return Label
• CHANGE: Default Ratchet Mode changed from "Chandelier" to "Both"
• NOTE: ATR multiplier for LORP: 2.0–2.5 for trending names.
  Default 1.4 too tight for higher-volatility stocks. Use 1.4–1.5 for low-vol
  large caps, 2.0–2.5 for higher-volatility names.

R5.3 (February 2026)
• ADD: Manual Stop Override

R5.2 (January 2026)
• ADD: Show Warnings toggle, LL/HH lines in Data Window

R5.1 (prior)
• Core hybrid stop: Chandelier + Structure, more conservative chosen
• Ratchet Mode: None / Chandelier / Chosen / Both

Core mechanics (all versions):
• Chandelier stop: highest(high, lookback) - ATR_mult × ATR
• Structure stop: lowest(low, window) - struct_mult × ATR
• Chosen stop: more conservative (higher for longs) of the two
• Ratchet: one-way tightening — stop can only move in profitable direction

Document originally written: 11 May 2026. See CURRENT STATE section at
top of file for 2 August 2026 status.
Google Doc: https://docs.google.com/document/d/1khM5Pr5ozYhAbsSBiX131hqXaKxMe5I94paVbdo2h5Y/edit

13. LORP Entry Signal Analysis — CSV Findings (8 May 2026, HISTORICAL —
    see CURRENT STATE at top: kernel-distance proved unreliable/repainting)

Findings from CSV analysis of 7 tickers (ARWR, IYW, VSAT, ACA, SPMO, IRM,
INDV), 8 May 2026:
  1. Entry trigger: the Lorentzian Buy price (CSV Col I) = the session LOW
     of the entry bar — the ML classifier fires at the bar extreme.
  2. Two entry types: Kernel Touch (Distance from Kernel < ~1.5 ATR, kernel
     rising) and Breakout (price breaks above Upper Envelope Far).
  3. Pullback-to-trend structure: strong multi-bar rally, mild pullback on
     lower volume, price holds above rising MAs, Lorentzian captures the
     dip as a continuation buy.
  4. Distance from Kernel as a quality indicator (tighter = cleaner pullback)
     — this specific use was later found unreliable; see CURRENT STATE.
  5. ShapeZ (Col Z) sometimes fires days-to-weeks before the Buy entry as
     an early warning, observed on the 1D chart only.
  6. Chars columns (U-X) are ML reversion signals, not entry triggers —
     Buy can fire with all Chars = 0.

The proposed kernel-distance-based morning-brief filter that followed from
these findings was tested and abandoned — see the repainting finding in
CURRENT STATE at the top of this document. David's live-recorded signal
dates remain the reliable anchor going forward.
