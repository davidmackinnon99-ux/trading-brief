# SBT merge apps

One script (run.sh), three app bundles in /Applications:
- Nightly Merge.app (was SBT Nightly Merge.app until 16 Nov 2026): everything (incl. tvremix)
- SBT Merge SID.app: SID-named + unlabelled files (skips LORP-named and tvremix)
- SBT Merge LORP.app: LORP-named + unlabelled files (skips SID-named and tvremix)

Named source files (16 Nov 2026), saved to ~/Downloads/SBT_Latest (or ~/Downloads):
- TS_SID_LONG_<date>.csv, TS_SID_SHORT_<date>.csv (TrendSpider scanner exports)
- SBT_SID_<date>.csv, SBT_LORP_<date>.csv (SwingTradeBot exports)
- TVX_SID_<date>.csv, TVX_LORP_<date>.csv (cloud nightly pull via Drive pickup; ex-tvremix)

Also recognised: David's own SBT export names starting SID / SID2 / LORP / LORP2 (e.g. "SID combo-scan-<date>.csv",
"LORP New52WeekClosingHigh-<date>.csv") -> source SBT. Rule: optional TS/SBT/TVX, then SID or LORP (+digits), at the
start of the name, separated by _ - or space.

Outputs:
- SID files  -> ~/Downloads/SID_Merged_<date>.txt
- LORP files -> ~/Downloads/LORP_Merged_<date>.txt
- unlabelled files: mode apps -> their strategy file; combined app -> SBT_Processed_Today/SBT_Merged_<date>.txt
SID_/LORP_Merged are also copied into SBT_Processed_Today. Repeat runs on the same day add to the day's files. Older days' SID_/LORP_Merged files move to SBT_Archive/<date>/.

Symbol column matched case-insensitively (Symbol / symbol / tradingview_symbol, quoted or not).
Bare tickers are qualified to EXCHANGE:TICKER from rules.json watchlist_qualified, then TradingView's
public US scanner (primary listing preferred); unresolved tickers are left out and listed in the log.
Logs are Merge_Log_<mode>_<date>.log (not .txt, so they can't be imported as a watchlist by mistake) and append per run (a second run no longer wipes the first). Logs (per-file source and counts, SID overlap by source combination, e.g. TS 20, SBT 15, SBT + TVX 4) in ~/Downloads/SBT_Processed_Today.
To update the apps, copy run.sh into each bundle at Contents/MacOS/run.sh.
