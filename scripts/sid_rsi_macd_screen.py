#!/usr/bin/env python3
"""
SID feasibility screen: RSI(14) / MACD(12,26,9) from raw OHLCV bars,
with the SID timing rule (RSI must have PASSED THROUGH the OB/OS zone
within ~10 candles of the MACD/signal confirmation cross -- it does not
need to still be there).

Input: one JSON file per symbol in the working directory, shaped as
    {"symbol": "NYSE:XXX", "last_close": 123.45, "bars": [{"t","o","h","l","c","v"}, ...]}
(bars in ascending time order, closes only are used for RSI/MACD).

Validation before any indicator is trusted:
  - bar count check (script was run with count=100 daily bars)
  - ascending timestamp check
  - the file's own claimed last_close must match bars[-1]["c"]
A symbol that fails any check is reported as an error and excluded,
rather than silently computed on bad data.

Usage:
    python3 sid_rsi_macd_screen.py *.json
"""
import json
import sys
import glob


def ema(values, period):
    """EMA series aligned to input length, seeded with an SMA of the first `period` values."""
    k = 2 / (period + 1)
    out = [None] * len(values)
    if len(values) < period:
        return out
    sma = sum(values[:period]) / period
    out[period - 1] = sma
    prev = sma
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi_wilder(closes, period=14):
    """Standard Wilder-smoothed RSI."""
    n = len(closes)
    out = [None] * n
    gains = [0.0] * n
    losses = [0.0] * n
    for i in range(1, n):
        d = closes[i] - closes[i - 1]
        gains[i] = max(d, 0.0)
        losses[i] = max(-d, 0.0)
    if n <= period:
        return out

    avg_gain = sum(gains[1:period + 1]) / period
    avg_loss = sum(losses[1:period + 1]) / period

    def rsi_from(g, l):
        if l == 0:
            return 100.0
        return 100 - (100 / (1 + g / l))

    out[period] = rsi_from(avg_gain, avg_loss)
    for i in range(period + 1, n):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        out[i] = rsi_from(avg_gain, avg_loss)
    return out


def macd(closes, fast=12, slow=26, signal=9):
    """Returns (macd_line, signal_line, histogram), each aligned to `closes`."""
    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)
    macd_line = [
        (ema_fast[i] - ema_slow[i]) if ema_fast[i] is not None and ema_slow[i] is not None else None
        for i in range(len(closes))
    ]
    first_valid = next(i for i, v in enumerate(macd_line) if v is not None)
    signal_tail = ema(macd_line[first_valid:], signal)
    signal_line = [None] * len(closes)
    for i, v in enumerate(signal_tail):
        signal_line[first_valid + i] = v
    hist = [
        (macd_line[i] - signal_line[i]) if macd_line[i] is not None and signal_line[i] is not None else None
        for i in range(len(closes))
    ]
    return macd_line, signal_line, hist


def find_recent_cross(hist, lookback=15):
    """Most recent sign-flip of the MACD histogram (== MACD line crossing its signal
    line) within the last `lookback` bars. Returns (index_in_full_series, direction) or None."""
    recent = [(i, h) for i, h in enumerate(hist) if h is not None][-(lookback + 1):]
    for k in range(len(recent) - 1, 0, -1):
        i, h = recent[k]
        _, h_prev = recent[k - 1]
        if (h >= 0) != (h_prev >= 0):
            return i, ("bullish" if h > 0 else "bearish")
    return None


def zone_pass_check(rsi, cross_idx, direction, max_lag=10):
    """SID timing rule: did RSI pass through the OB/OS zone in the `max_lag`
    candles up to and including the cross bar? OS = <30 (for a bullish/long
    setup), OB = >70 (for a bearish setup). Returns dict with the verdict."""
    lo = max(0, cross_idx - max_lag)
    window = [(i, rsi[i]) for i in range(lo, cross_idx + 1) if rsi[i] is not None]
    threshold_hits = (
        [(i, v) for i, v in window if v < 30] if direction == "bullish"
        else [(i, v) for i, v in window if v > 70]
    )
    if not threshold_hits:
        return {"qualifies": False, "reason": "RSI never entered zone in lookback"}
    zone_idx, zone_val = threshold_hits[-1]  # most recent qualifying touch
    lag = cross_idx - zone_idx
    return {
        "qualifies": lag <= max_lag,
        "zone_value": zone_val,
        "lag_bars": lag,
        "reason": "ok" if lag <= max_lag else "zone touch too far before cross (>10 bars)",
    }


def analyze_file(path):
    data = json.load(open(path))
    sym = data["symbol"]
    bars = data["bars"]
    expected_last_close = data["last_close"]

    if len(bars) != 100:
        return None, f"{sym}: expected 100 bars, got {len(bars)}"
    ts = [b["t"] for b in bars]
    if ts != sorted(ts):
        return None, f"{sym}: bars not in ascending time order"
    closes = [b["c"] for b in bars]
    if abs(closes[-1] - expected_last_close) > 1e-6:
        return None, f"{sym}: last close mismatch ({closes[-1]} vs {expected_last_close})"

    rsi = rsi_wilder(closes, 14)
    _, _, hist = macd(closes, 12, 26, 9)

    cross = find_recent_cross(hist, lookback=15)
    result = {
        "symbol": sym,
        "last_close": closes[-1],
        "rsi14_now": round(rsi[-1], 1) if rsi[-1] is not None else None,
    }
    if cross is None:
        result["setup"] = "no MACD cross in lookback window"
        return result, None

    cross_idx, direction = cross
    zone = zone_pass_check(rsi, cross_idx, direction, max_lag=10)
    result.update({
        "cross_direction": direction,
        "cross_bars_ago": (len(closes) - 1) - cross_idx,
        "zone_check": zone,
        "setup": "QUALIFIES" if zone["qualifies"] else "NO SETUP",
    })
    return result, None


def main(argv):
    files = argv[1:] or sorted(set(glob.glob("*.json")))
    results, errors = [], []
    for fp in files:
        r, err = analyze_file(fp)
        if err:
            errors.append(err)
        else:
            results.append(r)

    if errors:
        print("VALIDATION ERRORS (excluded from results):")
        for e in errors:
            print(" -", e)
        print()

    for r in results:
        print(json.dumps(r, indent=2))


if __name__ == "__main__":
    main(sys.argv)
