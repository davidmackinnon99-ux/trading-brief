# SID Gap/ATR — independent recalculation brief (for ChatGPT)

**Purpose.** Recalculate SID's Gap/ATR from scratch using SID's *actual* stop-loss rule, and
confirm or correct the results in Section 6. Earlier work (including any you did) used a
**10-bar swing low/high** as the stop. That was a proxy and is wrong. Do not reuse it.

---

## 1. Input file

`trades_all.csv` — 2,621 SID trades, Oct 2005 – Jun 2026 (attached).
Columns used: `trade_id, symbol, direction (long/short), entry_date, entry_price, return_pct,
win (1/0), gap_atr` (`gap_atr` = the OLD 10-bar proxy, kept only for comparison).

Price data: daily OHLC for each symbol (Yahoo Finance or TradingView), **split-adjusted but
NOT dividend-adjusted**, from 2004 onward so indicators are warmed up.

---

## 2. SID stop-loss rule (authoritative — unchanged since inception)

- **Long:** stop = the **lowest low** from the bar RSI enters the **oversold** zone until the bar
  it exits the zone, **rounded DOWN to the whole number** (e.g. 13.60 → 13.00).
- **Short:** stop = the **highest high** from the bar RSI enters the **overbought** zone until
  the bar it exits, **rounded UP to the whole number** (e.g. 13.60 → 14.00).

Indicator settings: RSI(14) on close (Wilder); oversold < 30, overbought > 70; ATR(14) Wilder.

## 3. Calculation steps

1. For each trade, locate the entry bar (the bar dated `entry_date`).
2. Find the most recent OB/OS episode at or before the entry bar (longs: RSI < 30; shorts: RSI > 70).
   SID entries follow the zone exit within ~10 bars, so look back no more than 40 bars.
3. Episode window = first bar RSI closes inside the zone → bar RSI closes back outside (include the exit bar).
4. Stop = floor(min Low over window) for longs; ceil(max High over window) for shorts.
5. Gap = entry close − stop (long) or stop − entry close (short).
6. **Gap/ATR = Gap ÷ ATR(14) at the entry bar.**
7. Also record: episode length (closes inside the zone), bars from zone exit to entry,
   and Gap/ATR without rounding.

## 4. Open question — please test BOTH versions

Claude's run treated every dip into the zone as its own episode. RSI often dips in for one bar,
pops out, then dips back in a bar or two later. A trader would usually read that cluster as
**one** episode, which gives a longer window and a wider stop.

- **Version A (strict):** an episode ends the first bar RSI closes outside the zone.
- **Version B (merged):** dips separated by **≤ 3 bars** outside the zone are one episode
  (the window runs from the first dip to the final exit).

Report episode-length statistics and the Section 6 tables for both, and say which looks
closer to how SID is traded.

## 5. Sanity checks to report

- Trades where no episode is found within 40 bars (Claude: 82).
- Trades where the entry bar is still inside the zone (Claude: 191 — "exit→entry = 0").
  For SID the entry should follow the exit, so check these individually.
- Trades where exit → entry > 10 bars (SID's MACD-cross window).
- Any negative Gap (entry beyond the stop).

## 6. Claude's results to confirm (Version A, 2,539 trades)

**Distribution**
- Episode length (closes inside the zone): median 2, mean 3.0, 75th pct 4, 90th pct 7; 1,016 are 1 bar.
- Exit → entry: median 1–2 bars.
- Median Gap/ATR — longs: true 2.04 · unrounded 1.61 · old proxy 1.53.
  Shorts: true 1.91 · unrounded 1.33 · old proxy 1.28.
- Rank correlation true vs proxy: about 0.4.

**Win rate by true Gap/ATR — longs (n = 1,061, base 74.5%)**

| Bucket | ≤1.0 | 1.0–1.5 | 1.5–2.0 | 2.0–3.0 | 3.0–4.0 | >4.0 |
|---|---|---|---|---|---|---|
| n | 55 | 177 | 276 | 366 | 129 | 58 |
| WR % | 70.9 | 67.8 | 80.1 | 76.5 | 68.2 | 72.4 |
| Mean return % | 0.8 | 0.7 | 1.4 | 0.9 | 0.2 | 3.5 |

**Shorts (n = 1,478, base 62.8%)**

| Bucket | ≤1.0 | 1.0–1.5 | 1.5–2.0 | 2.0–3.0 | 3.0–4.0 | >4.0 |
|---|---|---|---|---|---|---|
| n | 148 | 300 | 334 | 440 | 163 | 93 |
| WR % | 68.9 | 61.3 | 62.3 | 62.0 | 62.6 | 63.4 |
| Mean return % | 0.4 | −0.5 | −0.3 | −0.4 | −1.4 | −3.7 |

Also split each table into pre-2020 and 2020+ (entry year).

## 7. Spot-check trades (Claude's Version A values)

Verify these by hand on a chart (RSI 14, 30/70):

| Symbol | Dir | Entry date | Entry close | Zone bars | Exit→entry | Stop | Gap/ATR true | Old proxy |
|---|---|---|---|---|---|---|---|---|
| IBM | long | 2024-05-06 | 168.61 | 7 | 1 | 162 | 1.81 | 1.64 |
| CLX | short | 2026-02-17 | 122.96 | 8 | 1 | 128 | 1.54 | 1.39 |
| KHC | long | 2024-06-21 | 32.95 | 3 | 4 | 32 | 1.46 | 1.45 |
| ABT | long | 2023-09-28 | 98.12 | 4 | 1 | 94 | 2.51 | 2.05 |
| C | long | 2024-08-13 | 58.15 | 1 | 4 | 55 | 1.69 | 2.49 |
| MCO | long | 2026-02-18 | 450.76 | 10 | 1 | 402 | 2.95 | 2.93 |
| C | short | 2024-07-12 | 64.52 | 2 | 2 | 67 | 1.73 | 1.72 |
| V | short | 2023-01-18 | 219.46 | 1 | 3 | 224 | 1.10 | 1.34 |
| XLU | long | 2024-12-24 | 38.24 | 2 | 3 | 37 | 2.16 | 1.55 |
| SPY | long | 2026-03-25 | 656.82 | 1 | 3 | 644 | 1.34 | 1.26 |

## 8. What to send back

1. Do you reproduce Section 6 for Version A (within ~1 point of WR)? If not, where and why?
2. Version B results and episode-length stats.
3. Spot-check table with your stop, episode dates and Gap/ATR.
4. Recommended thresholds for longs and shorts, with the bucket evidence.
5. Caveats: `win`/`return_pct` come from the backtest's own exits, not necessarily the SID stop;
   rounding on pre-split prices is approximate.
