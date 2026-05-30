# Strategy Confluence Factors

Quick reference for what the morning brief checks for each strategy.

---

## LORP — Trend-Following Pullback (Long-only, Daily)

**Layout:** OWHfyWBq · Hint: `CAP Tools Supplement`

**Entry signal:**
- LC Premium Buy or StopBuy signal on last closed bar
- Buy VD (Volume Delta > 0.5) — required for actionable entry
- Sell VD shown as context only — not entry signals

**Brief filters (applied after TV Screener):**
- RVOL > 1.0 and < 4.0
- Aroon > 0 and rising (above signal line)
- LC data present (Distance from Kernel available)

**Entry type by Distance from Kernel:**
- Pullback 🔄 — Dist < 0.5 (price touching/inside kernel)
- Trend ↗ — Dist 0.5–1.5 (price above kernel, not extended)
- Breakout 🚀 — Dist > 1.5 (price launching from kernel)

**Context columns:** ATR%, RVOL, VD, Aroon, ADX, DI+/DI-, %B, WRB, EMA50, SMA200, VIDYA, Chandelier Stop, CAP signals

**Pre-filtered by TV Screener:** ATR <5%, MACD>0, EMA21>EMA34, Vol>500K, RelVol>1.0, Price>EMA34, Aroon Down<30%, RSI 45–75

---

## SID — OB/OS Bounce (Long + Short, Daily)

**Layout:** XN1LuowU · Hint: `SID Trading Signals Pro`  
**Indicator:** SID Trading Signals Pro v8.5.10

**Long entry:** RSI crossed below 30 (OS touch within last 10 bars) · RSI rising · MACD rising 1 bar  
**Short entry:** RSI crossed above 70 (OB touch within last 10 bars) · RSI falling · MACD falling 1 bar

**10-bar rule:** Entry must fire within 10 bars of the initial OB/OS cross — built into the indicator

**Context columns:** Weekly RSI · Gate (⚠️ = weekly RSI direction not aligned) · SMA200 · Aroon · ADX · ATR% · RVOL · VD · GP Zone

**Weekly RSI Gate:** Indicator-calculated — 1 when weekly RSI direction aligns with trade direction. Shown as ✅/⚠️ for manual assessment — not a hard filter.

**Conviction tiers (SMA200):**  
- Above SMA200 ≥5% — HIGH CONVICTION long  
- Below SMA200 ≥5% — HIGH CONVICTION short  

**Gap/ATR Ratio:** ≥2.0 ideal · <1.5 avoid (indicator-calculated)

---

## Pullback v2.0 — Long-only Trend Pullback (Daily)

**Layout:** 6Qpm8oT7 · Hint: `ADX + EMA21 Trend Setup`

**Hard gates (ticker suppressed if failed):**
- Band not inverted — EMA38 (fast) must be above EMA62 (slow)
- Not inside GP Zone — GP_Flag < 1

**Stage classifier (ADX + EMA21 Trend Setup — Booker Method):**
- 🟢 Stage 3 ENTRY — Breakout=1 (up arrow) OR price inside EMA38/EMA62 band
- 🟠 Stage 2 EMA21 — Pullback=1 AND price within 3% above EMA21
- 🟡 Stage 1 PB — Pullback=1 (further from EMA21)
- ⬜ Stage 0 WATCH — hidden from output

**Context columns:** EMA38, EMA62, EMA21, Band↑, VD, GP Zone (xR proximity), PP (Pocket Pivot), CAP (Climax/Strong Demand+Supply)

**Chart check required:** LuxAlgo HTF Divergence (not available in data window)

**Pre-filtered by TV Screener:** ADX 20–40, MA alignment

---

## ADX Breakout — Rob Booker Coiling/Breakout (Long + Short, Daily)

**Layout:** 6hvBVx9e · Hint: `Rob Booker - ADX Breakout DM Final`

**BBWP filter (primary):**
- ⚡ BBWP ≤ 5 — COILING (bandwidth at multi-year low — impending move)
- ⚠️ BBWP ≥ 98 — EXTENDED (bandwidth at multi-year high — caution)
- BBWP 6–97 — ignored entirely

**Context columns:** Close, ADX, BBWP, vs SMA20 (↑/↓), Booker Quality signal (🔔 BQ)

**Chart checklist before acting:**
- Price breaking above Box Upper (Long) or below Box Lower (Short)?
- Breakout bar a WRB?
- ADX visibly rising?
- DI+ crossing above / already above DI-?
- Supply zone overhead that could reject breakout?

**VD note:** Reference only — a valid breakout entry can have positive or negative VD

**Pre-filtered by TV Screener:** ADX 15–18

---

## Cross-Strategy Notes

- **Also column** — shows if a ticker also appears in another strategy's output (e.g. `LORP`, `SID📈`, `PB🟢`, `ADX📦`)
- **GP Zone flags** require GP Zone Exporter on all layouts
- **Brief Output watchlist** — merged, deduplicated, alphabetically sorted list of all signals pushed to TradingView after each brief
