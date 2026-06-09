
## 2026-06-09 — LORP confluence factor validation (26/27 screenshot-proven trades)

Method: real TV chart-export CSV values read at proven entry dates (no recompute —
custom indicator settings, e.g. two Aroons DM 29/25/10 + BigBeluga 21/x/x, can't be
reproduced offline). 17 winners / 9 losers. IAC (NASDAQ:IAC) outstanding.

RESULT — only ONE factor separates winners from losers:
- **MACD-direction (MACD vs Signal at entry): the gate.** 0/17 winners entered MACD-down;
  4/9 losers did (CURB, PRAX, BIPH, CSTM). Cleanest when isolated to Default-exit trades
  (system ran to its own exit): all Default winners MACD-up; both Default losers
  (BIPH, CSTM) MACD-down — perfect separation in-sample.
- The 5 MACD-up losers (CTOS, AAP, BUSE, NTLA, KC) are all STOP/Manual = managed out,
  not entry-signal failures.

Factors that do NOT gate (tested, rejected):
- Aroon (both DM and BigBeluga): no separation. BB<0 would reject winners NVTS/RUN/JBS
  to catch only BUSE. BUSE looked convincing as a single case but did not generalise.
- CCI_S: leans mildly BULLISH (winners 60.8 vs losers 49.3); overbought is NOT a red flag.
- ATR%: losers marginally hotter (4.0 vs 3.4) — weak context, hard >=5% reject kills
  winners NVTS/RUN/TNGX. Not a gate.
- ADX magnitude, RVOL: negligible.

Implication: LORP has no rich pre-entry confluence signature beyond MACD-up. Edge is in
the LC trigger + exit discipline (Default Exit = MVP). Next: validate exit behaviour on
this same proven-date set; add IAC; widen sample over time via forward capture.
