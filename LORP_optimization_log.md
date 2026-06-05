# LORP Optimization Log

Record of LORP (Lorentzian Classification Premium v3.0, daily, long-only)
parameter tuning. Authoritative metrics come from the **TradingView Strategy
Tester** (LORP Backtest Adapter on the full layout) — NOT from data-window
CSV reconstruction (see Methodology note).

---

## 2026-06-05 — February sweep closed; Crossover Lag 2→5 validated (ODFL)

### Confirmed current LC Premium kernel settings
| Parameter        | Value | Status                                  |
|------------------|-------|-----------------------------------------|
| Relative Weight  | 20    | moved 8→20 (Feb rec) — in target band   |
| Neighbors        | 15    | moved 10→15 (Feb rec) — in target band  |
| Regression Level | 15    | (was 25)                                |
| Lookback Window  | 10    | unchanged                               |
| Crossover Lag    | 5     | moved 2→5 — validated this session      |
| Max Bars Back    | 3000  | truncates signals to Aug 2014 (~12 yr)  |

### ODFL Crossover Lag sweep (TV Strategy Tester, full layout, MBB 3000)
| Metric        | Lag = 2 | Lag = 5 |
|---------------|---------|---------|
| Total trades  | 41      | 45      |
| Win rate      | 58.5%   | 62.2%   |
| Profit factor | 1.41    | 1.56    |

Lag=5 improved all three simultaneously (+4 trades, +3.7pp WR, +0.15 PF / +11%).
→ Adopt Crossover Lag = 5 for ODFL.

### February sweep — now fully validated forward
- Relative Weight 8 → 20 ✓
- Neighbors 10 → 15 ✓
- Crossover Lag 2 → 5 ✓ (this session)

ODFL real baseline moved 1.41 → 1.56 PF.

### Open items
- **Multi-ticker Lag=5 check** — ODFL improving ≠ basket improving. Run the same
  Lag 2→5 Strategy Tester comparison on a handful of names (mix of stocks + ETFs;
  ETFs carry higher PFs historically) before making Lag=5 a universal default.
  Feb multi-ticker median lag ≈ 4.5 (ODFL wanted 9; AAPL/MSFT 5–6) — supports 5
  as a default, but confirm on the engine.
- **MBB 3000 → 2000** — would recover signals to ~2011 (+~3 yr, ~half-again more
  trades) to firm up the 45-trade / ~12-yr sample. Hold MBB constant within any
  single comparison.

### Methodology note (important)
Data-window CSV exports CANNOT reproduce the Backtest Adapter's results. Two
reconstruction methods were tried this session and both diverged from TV:
- signal-based (Buy→next stop signal): 38 / 63.2% / 1.90 — too optimistic
- stop-based (Buy→Long Stop Hit): collapsed to 3 trades (Long Stop Hit is the
  ATR flag, not the Chandelier exit)
The CSV even pointed the WRONG direction on the Lag change. The "PF 1.90" figure
that circulated this session was a reconstruction artifact — disregard it.
**Use the TV Strategy Tester panel for all LORP backtest metrics.**

### Related pipeline fix (same session)
`ADX and DI for v4` indicator: final smoothing changed `sma(DX,len)` → `rma(DX,len)`
(Wilder). The original sma under-read ADX ~3–5pts vs standard Wilder during
accelerating trends; the morning brief reads this study for its ADX≥20 LORP
screen, so it was silently dropping valid candidates. Now matches LC Premium's
internal ADX gate and the ADX Bottom Readout (~22 on ODFL). Brief ADX values from
2026-06-05 onward read ~3–5pts higher than archived briefs. Saved to indicators
repo as `ADX and DI for v4 (Wilder mod).pine`.
