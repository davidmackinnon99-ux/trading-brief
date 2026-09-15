# analysis/sid-btw-universe

Three source documents for the SID "BTW" universe backtest (BTW = the named 99-ticker
master ticker list SID is backtested/scanned across — NOT "Buy The Weakness"; that label
in the old LORP doc Section 8 is stale and should be corrected). Filed 15 Sep 2026 after
being sent in chat repeatedly with no permanent home — see SID_Project_Continuity.md
CURRENT STATE for the full note.

- `Backtesting_Sheet_300_SID.xlsx` — David's own hand-logged trade journal, 300 individual
  SID trades (real dates, entry/exit, stop, gap, ATR%, RVOL, MACD-at-entry, reversals-in-trade,
  chart pattern, TradingView screenshot link per trade). The most granular of the three SID
  datasets in this repo — distinct from `data/trades/trades_all.csv` (2,618-row automated
  merge) and distinct from the 2,932-signal automated backtest below. Primary/manual source;
  treat as the highest-trust dataset where it conflicts with automated results.
- `SID_Analysis_Synopsis_v2.pdf` — synopsis of the automated "BTW Universe" strategy-tester
  backtest, SID Strategy v10.5.4, 99 tickers, Bearish/Bullish Regime Filter ON, March 2026.
- `SID_Confluence_Report_v4.html` — full confluence factor analysis behind the synopsis:
  99 tickers, 2,932 signals, 2010–Mar 2026. Same underlying backtest as the PDF, more detail
  (per-factor tables: regime filter, ADX band, MACD histogram band, bars-to-entry, RSI
  re-entry exit signal, sector breakdown, strong-performer ticker list).

## Headline findings (automated 99-ticker/2,932-signal backtest, regime filter ON)
- Regime filter (SMA50 vs SMA200) is the primary quality gate — longs only when SMA50>SMA200,
  shorts only when SMA50<SMA200. Long WR 55.5% post-2020 (61.3% full history) vs Short WR
  47.0% post-2020 (48.8% full history).
- ADX 25–30 and 30–40 preferred (70.3% / 61.7% WR); 20–25 is the worst band (transition
  zone) — consistent with SID_Project_Continuity.md's existing "20–25 danger zone" note.
- MACD histogram (MACD−Signal) at entry: moderately negative (−1.0 to −0.3) is the best band
  (63.7% WR); near-zero/about-to-cross is marginal (53.9%). Consistent with MACD0 being a
  supplementary quality check for SID, not a gate (per SID_Project_Continuity.md §3/§4).
- Entry timing: 2–4 bars after the OS/OB touch is optimal (63.8% WR) vs firing immediately
  (0–1 bars, 55.7%) or waiting 5+ bars (61.6%).
- Strongest exit signal in the dataset: RSI re-entering the OS/OB zone during the trade
  (36.1% WR) vs a clean bounce with no re-entry (70.7% WR) — a 34.6pp gap.
- Shorts are viable only in confirmed bear regime (55.1% WR) and only in Real Estate,
  Healthcare, Communication sectors; avoid Technology, Industrials, Energy, Materials,
  Utilities, Consumer Defensive shorts.

Not yet reconciled against the 300-trade manual journal or against trades_all.csv in detail —
flagged as an open item below and in SID_Project_Continuity.md.
