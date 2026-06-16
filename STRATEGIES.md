# Strategy Confluence Factors

Quick reference for what the morning brief checks for each strategy.
Each factor is marked as a **hard filter** (tickers excluded/moved if it fails) or **context** (shown for manual assessment only).

---

## LORP — Trend-Following Pullback (Long-only, Daily)

**Layout:** OWHfyWBq · Hint: `CAP Tools Supplement`  
**Indicator:** ML: Lorentzian Classification Premium + LORP layout indicators

### Hard filters (brief code)

| Factor | Rule |
|--------|------|
| LC data | No LC data → excluded entirely |
| RVOL | < 1.0 or ≥ 4.0 → excluded |
| Aroon | ≤ 0 → excluded |
| Aroon direction | Aroon ≤ Signal Line (falling) → excluded |
| VD — Trend/Breakout | VD ≤ 0.5 → moved to Sell VD ⚠️ section (context only) |
| VD — Pullback | Negative VD is expected (pullback = selling pressure) → always shown in Buy section with `↓ (PB x)` note |

### Pre-filtered upstream by TV Screener (before scan)
ATR <5%, MACD>0, EMA21>EMA34, Vol>500K, RelVol>1.0, Price>EMA34, Aroon Down>0%, RSI 45–75, Price>=$10, Mkt Cap 1B to 100B, ADX>=20

### Entry type (Distance from Kernel)
- Pullback 🔄 — Dist < 0.5
- Trend ↗ — Dist 0.5–1.5
- Breakout 🚀 — Dist > 1.5

### Context columns (shown, not filtered)
ATR%, RVOL, VD, Aroon, ADX, DI+/DI-, %B, WRB, Range%, vs Open, EMA50, SMA200, VIDYA, Chandelier Stop, Backtest Adapter History

### Sig column flags
`🟢 LC` / `🔴 LC` — LC Premium Buy/Sell · `🟢 A` / `🔴 A` — Aroon signal · `★ PP` — Pocket Pivot · `🔥 CD` — Climax Demand · `💪 SD` — Strong Demand · `🔥 CS` — Climax Supply · `💪 SS` — Strong Supply

---

## SID — OB/OS Bounce (Long + Short, Daily)

**Layout:** XN1LuowU · Hint: `SID Trading Signals Pro`  
**Indicator:** SID Trading Signals Pro v8.5.10 (entry + confluence), NOT v10.5.4.15 strategy

### Hard filters (brief code)

| Factor | Rule |
|--------|------|
| Entry signal | `Long Entry Signal = 1` or `Short Entry Signal = 1` from v8.5.10 must be true |
| 10-bar rule | Built into indicator — entry can only fire within 10 bars of initial OB/OS cross |

### Context columns (shown, not filtered)

| Column | Notes |
|--------|-------|
| Weekly RSI | Raw value for manual direction check |
| Gate ✅/⚠️ | Indicator-calculated: ✅ = weekly RSI direction aligns with trade, ⚠️ = does not. **Not a hard filter — assess by eye** |
| SMA200 | Price position vs SMA200 (conviction reference) |
| Aroon | Direction context |
| ADX | Trend strength context (<20 choppy, 20–25 danger zone) |
| ATR% | Risk sizing reference |
| RVOL | Volume confirmation |
| VD | Buy/Sell pressure reference |
| GP Zone | 🟡 NEAR / 🟢 IN — proximity reference only |

**Gap/ATR Ratio:** ≥2.0 ideal · <1.5 avoid (shown in context, not a hard filter)

---

## Pullback v2.0 — Long-only Trend Pullback (Daily)

**Layout:** 6Qpm8oT7 · Hint: `ADX + EMA21 Trend Setup`  
**Indicators used:** ADX + EMA21 Trend Setup [Booker Method], CM_SlingShotSystem, GP Zone Exporter, Pocket Pivot, RVOL, Volume Delta v2, WRB Confluence, CAP Tools Supplement

### Hard filters (brief code)

| Factor | Rule |
|--------|------|
| Band validity | EMA38 < EMA62 (band inverted) → ticker suppressed entirely |
| GP Zone | GP_Flag ≥ 1 (inside zone) at close → ticker suppressed entirely |
| Stage | Stage 0 WATCH → hidden from output (not suppressed — still in data) |
| Section gate | Only tickers from PULLBACK SCREENER or PULLBACK BRIEF sections shown |

### Stage classifier (ADX + EMA21 Trend Setup — Booker Method)

| Stage | Condition |
|-------|-----------|
| 🟢 Stage 3 BREAKOUT | `Breakout = 1` (up arrow) at close AND price ≥ EMA21 |
| 🔵 Stage 3 IN-BAND | price inside EMA38/EMA62 band at close AND price ≥ EMA21 |
| 🟠 Stage 2 EMA21 | `Pullback = 1` AND price 0–3% above EMA21 |
| 🟡 Stage 1 PB | `Pullback = 1` (further from EMA21) |
| ⬜ Stage 0 WATCH | Neither condition met — hidden |

**Entry gate — price must be at or above EMA21 (non-negative % EMA21).** A negative
% EMA21 means price has pushed back down *through* EMA21 — a broken pullback, not a
valid long entry — so it is never classified as Stage 3.

**Note:** the EMA38/EMA62 band sits below EMA21 in a normal uptrend, so an IN-BAND
candidate is usually below EMA21 (negative %) and therefore filtered out. IN-BAND only
appears when the band is tight/near EMA21 and price holds at/above EMA21.

### Pre-filtered upstream by TV Screener
ADX 20–40, MA alignment

### Context columns (shown, not filtered)
EMA38, EMA62, EMA21, % EMA21 (signed distance of price from EMA21), Band↑, VD (▲/▼), GP Zone distance (xR), PP (Pocket Pivot), CAP (see below)

### CAP Tools Supplement — Demand/Supply flags (CD · SD · CS · SS)
**These are single-bar candle + volume signals on the last closed bar. They are
NOT related to the supply/demand zones drawn on the chart** — a ticker can fire SD
while sitting far above any supply zone. The flag only describes the most recent
candle's shape and volume.

Candle classification (last closed bar):
- **demand candle** = bullish body (close > open), or a strong lower-wick rejection — without a strong upper wick
- **supply candle** = bearish body, or a strong upper-wick rejection — without a strong lower wick

Volume vs 20-bar volume average:
- **> Volume Confirm Multiplier × avg** = "above average" (multiplier set to **1.5** in CAP Tools settings)
- **> 2.0 × avg** = "climax"

| Flag | Condition |
|------|-----------|
| 💪 SD (Strong Demand) | demand candle + volume > 1.5× avg + NOT climax |
| 🔥 CD (Climax Demand) | demand candle + volume > 2.0× avg |
| 💪 SS (Strong Supply) | supply candle + volume > 1.5× avg + NOT climax |
| 🔥 CS (Climax Supply) | supply candle + volume > 2.0× avg |

All firing signals are shown (demand and supply both appear if both fire).

### Indicators on layout NOT currently used in brief
- HH LL HL LH Marker — on layout, captured in scan, not read by code
- HTF Reversal Divergences [LuxAlgo] — on layout, captured in scan, not read by code (manual chart check required)
- Aroon Oscillator [BigBeluga] — on layout, captured but not displayed for Pullback

---

## ADX Breakout — Rob Booker Coiling/Breakout (Long + Short, Daily)

**Layout:** 6hvBVx9e · Hint: `Rob Booker - ADX Breakout DM Final`  
**Indicators used:** Rob Booker ADX Breakout DM Final, Bollinger Bands (BBWP), Rob Booker Quality Volume Breakout, ADX and DI, Volume Delta, RVOL, GP Zone Exporter

### Hard filters (brief code)

| Factor | Rule |
|--------|------|
| BBWP | Must be ≤ 5 (coiling) OR ≥ 98 (extended) to appear at all. BBWP 6–97 → excluded entirely |
| Section gate | Only tickers from ADX BREAKOUT SCREENER shown |

### Output sections
- ⚡ **BBWP COILING (≤5)** — bandwidth at multi-year low, impending move
- ⚠️ **BBWP EXTENDED (≥98)** — bandwidth at multi-year high, caution

### Pre-filtered upstream by TV Screener
ADX 15–18

### Context columns (shown, not filtered)
Close price, ADX value, BBWP value, vs SMA20 direction (↑/↓), Booker Quality signal (🔔 BQ↑ / 🔔 BQ↓)

### Chart checklist before acting (manual)
- Price breaking above Box Upper (Long) or below Box Lower (Short)?
- Breakout bar a WRB?
- ADX visibly rising?
- DI+ crossing above / already above DI-?
- Supply zone overhead that could reject breakout?

**VD note:** Reference only — a valid breakout entry can have positive or negative VD

---

## Cross-Strategy Notes

- **Also column** — shows if a ticker also appears in another strategy's output: `LORP`, `SID📈`, `SID📉`, `PB🟢/🟠/🟡`, `ADX📦`
- **GP Zone flags** require GP Zone Exporter indicator on all layouts
- **Brief Output watchlist** — merged, deduplicated, alphabetically sorted list of all signals pushed to TradingView after each brief
- **Sell VD ⚠️ section** (LORP) — shown for context only, not actionable entry signals
