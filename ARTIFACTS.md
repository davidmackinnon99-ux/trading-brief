# ARTIFACTS — Repository Index

**This is the findability index. Every surface (Chat, Cowork, Code) reads this file first.**
If an artifact is not listed here, assume it is stranded / not durable. Adding an artifact to
the repo means adding a row here in the same commit.

**Rule of continuity:** the git repo is the only memory shared across Chat, Cowork, and Code.
If it isn't committed, it doesn't persist. Commit + push DAILY (see autocommit setup).

**Rule of reproducibility:** never commit a chart/output alone. Commit the SCRIPT + its INPUT
data + its OUTPUT together in one `analysis/<name>/` folder. A picture isn't verifiable; a
script plus its data is.

**Last updated:** 3 July 2026 · **Maintainer:** update on every commit.

---

## Canonical criteria & strategy authority

| Artifact | Path | What it is | Reproduced / defined by |
|----------|------|------------|-------------------------|
| Strategy Confluence Factors | `STRATEGIES.md` | **Canonical** criteria/gates for SID, LORP, Pullback, ADX Breakout | Hand-maintained; wins over all satellites on any criterion |
| Confluence Checklists | `CONFLUENCE_CHECKLISTS.md` | Manual chart-side SID + LORP confluence scoring checklists (from TV AI) | Hand-maintained; gated by STRATEGIES.md |
| LORP verdict tool | `scripts/confluence_check.py` | PASS/FLAG/CAUTION/AVOID verdict; LORP = MACD0 up AND LC Buy | Script |
| SID factor grading | `scripts/sid_factor_grade.py` | Per-trade factor snapshot (MACD, MACD0, Gap/ATR, wRSI, ADX/DI, RVOL) | Script (yfinance) |

## Continuity / project-state docs

| Artifact | Path | What it is | Notes |
|----------|------|------------|-------|
| SID project continuity | `SID_Project_Continuity.md` | SID living doc — state, history, reconciliation log | Supersedes old numbered `_9` copies |
| LORP optimization log | `LORP_optimization_log.md` | LORP parameter/optimization results | |
| Research notes | `RESEARCH.md` | Meta-project research (agent/tooling), NOT trading findings | |
| _Per-project continuity_ | `analysis/<name>/CONTINUITY.md` | Written at project start, updated at end, committed both times | Habit — one per activity |

## Analysis bundles (script + input + output together)

| Artifact | Path | What it is | Status |
|----------|------|------------|--------|
| Gap / MACD0 vs win rate | `analysis/gap-macd0/` | Bucket SID trades by gap-to-signal (MACD0); win rate + avg return per bucket | **Done (2026-07-03)** — `gap_macd0.py` + `README.md` committed; `MACD0_IS_RAW` set to `False` (trades_all.csv already sign-normalises macd0_pct — see its README). Reference-chart N's (2,439/37-ticker) don't apply as-is: trades_all.csv is the full 2,621-row merge, a superset, so bucket N's won't match 1:1 — treat as a fresh run, not a reproduction check. |
| _(add rows as analyses land)_ | | | |

> Note on the gap analysis: "Gap/ATR" (overnight open gap ÷ ATR, ≥2.0 ideal) and "MACD0 gap"
> (MACD − signal, % of price) are DIFFERENT variables. State which one any report uses.

## Data

| Artifact | Path | What it is | Status |
|----------|------|------------|--------|
| Merged trade history | `data/trades/trades_all.csv` | Canonical merged SID trades, one row per trade (trimmed: trade_id, direction, entry_date, entry_price, return_pct, win, macd0_pct, gap_atr) | **Done (2026-07-03)** — 2,621 rows. Full 19-column version (symbol, strategy, macd_line/signal, exit, RSI/ADX/RVOL context) lives in the Indicators repo, not here — see below. LORP: 0 rows, no closed-trade LORP history exists yet. |
| Source trade CSVs | `data/trades/` | Individual per-symbol/per-export trade files | **Not planned for this repo** — this repo is code + docs only, not data (explicit standing instruction). Source CSVs and the full merge stay in the Indicators repo's own `data/trades/`. |

> ⚠️ Repo is PUBLIC and now contains real trade fills (the trimmed trades_all.csv above, pushed 2026-07-03 with explicit approval) — this line in the doc predates that decision. Full fills (symbol/strategy/raw macd/context) are NOT here; they're in the separate `trading-indicators-private` repo (private).

## Tooling / pipeline scripts

| Artifact | Path | What it is |
|----------|------|------------|
| Morning brief | `scripts/morning-brief.sh` | Brief entrypoint |
| Brief analyzer | `scripts/analyse-brief.cjs` | Brief post-processing / annotation |
| Watchlist sync | `scripts/sync-watchlist.cjs` | Full watchlist ingestion |
| LORP open-trades report | `scripts/lorp_open_trades_report.py` | Reads local `open_trades.csv` (LORP rows), fetches bars, reports |
| Autocommit | `autocommit-brief.sh` + `com.davidmackinnon.brief-backup.plist` | Daily commit/backup — extend to cover data/ + analysis/ |

---

## How to add an artifact (checklist)
1. Put the file in the right folder (`analysis/<name>/`, `data/trades/`, or root doc).
2. If it's an analysis, include script + input + output in the same folder.
3. Add a row to the correct table above.
4. `git add` everything, commit with a descriptive message, push to `personal`.
5. If public and it contains trade fills — STOP; wait for private.
