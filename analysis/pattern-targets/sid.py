"""Python port of SID Strategy v10.5.18 entry/exit rules (defaults), for research (2 Oct 2026).
Mirrors strategies/SID_Strategy_v10.5.18.pine in the trading-indicators repo:
- process_orders_on_close: entries and exits fill at the signal bar's close (Hard SL too).
- LONG: RSI(14) entered <=30 within the last 10 bars, that touch came after the last exit, RSI < 50 and
  rising, MACD line rising (slope, 'Require MACD Crossover' OFF), flat, >2 bars since last exit.
  SHORT mirrors with 70 / > 50 / falling.
- Stop: floor(lowest low since the OS touch) for longs, ceil(highest high since the OB touch) for shorts;
  checked from the bar after entry, exit at that bar's close.
- Exit: RSI crosses 50 (exit cooldown > 2 bars since last exit), or 20-bar time stop.
- Regime / SPY / weekly filters OFF (defaults). Backtest window ignored (full history)."""
import math
import numpy as np


def rsi_wilder(c, n=14):
    d = np.diff(c, prepend=np.nan)
    up, dn = np.where(d > 0, d, 0.0), np.where(d < 0, -d, 0.0)
    r = np.full(len(c), np.nan)
    if len(c) <= n:
        return r
    au, ad = up[1:n + 1].mean(), dn[1:n + 1].mean()
    for i in range(n, len(c)):
        if i > n:
            au = (au * (n - 1) + up[i]) / n
            ad = (ad * (n - 1) + dn[i]) / n
        r[i] = 100.0 if ad == 0 else 100 - 100 / (1 + au / ad)
    return r


def ema(x, n):
    out = np.full(len(x), np.nan)
    a = 2 / (n + 1)
    start = np.flatnonzero(~np.isnan(x))
    if len(start) < n:
        return out
    s = start[0]
    out[s + n - 1] = np.nanmean(x[s:s + n])
    for i in range(s + n, len(x)):
        out[i] = a * x[i] + (1 - a) * out[i - 1]
    return out


def sid_trades(O, H, L, C, os_lvl=30, ob_lvl=70, look=10, max_hold=20, cross=None, cross_win=5):
    """cross=True -> 'Require MACD Crossover' ON: MACD/signal cross within +/-cross_win bars of the latest
    RSI OS/OB touch and MACD on the right side of the signal line (instead of MACD slope).
    Default from env SID_CROSS=1."""
    import os as _os
    if cross is None:
        cross = _os.environ.get("SID_CROSS") == "1"
    N = len(C)
    rsi = rsi_wilder(C)
    macd = ema(C, 12) - ema(C, 26)
    sig = ema(macd, 9)
    last_xup = last_xdn = None
    trades = []
    pos, entry_bar, entry_px, sl = 0, None, None, None
    last_exit = 0
    last_os = last_ob = None                       # bar of most recent RSI entry into OS / OB
    setup_low = setup_high = None
    trk_long = trk_short = False
    long_shown = short_shown = False
    prev_pos = 0
    for i in range(1, N):
        if not (np.isnan(sig[i]) or np.isnan(sig[i - 1])):
            if macd[i] > sig[i] and macd[i - 1] <= sig[i - 1]:
                last_xup = i
            if macd[i] < sig[i] and macd[i - 1] >= sig[i - 1]:
                last_xdn = i
        if np.isnan(rsi[i]) or np.isnan(rsi[i - 1]) or np.isnan(macd[i]) or np.isnan(macd[i - 1]):
            prev_pos = pos
            continue
        flat = pos == 0
        if flat and prev_pos != 0:                 # just went flat (exit filled on previous bar's close)
            long_shown = short_shown = False
            setup_low = setup_high = None
            trk_long = trk_short = False
            last_exit = i
        enters_os = rsi[i] <= os_lvl and rsi[i - 1] > os_lvl
        enters_ob = rsi[i] >= ob_lvl and rsi[i - 1] < ob_lvl
        if enters_os:
            last_os = i
            if flat:
                setup_low, trk_long = L[i], True
        if enters_ob:
            last_ob = i
            if flat:
                setup_high, trk_short = H[i], True
        if trk_long and flat and (setup_low is None or L[i] < setup_low):
            setup_low = L[i]
        if trk_short and flat and (setup_high is None or H[i] > setup_high):
            setup_high = H[i]
        cool_ok = i - last_exit > 2
        os_recent = last_os is not None and i - last_os <= look
        ob_recent = last_ob is not None and i - last_ob <= look
        os_ok = os_recent and last_os > last_exit
        ob_ok = ob_recent and last_ob > last_exit
        if cross:
            up_ok = (last_xup is not None and last_os is not None and abs((i - last_xup) - (i - last_os)) <= cross_win
                     and not np.isnan(sig[i]) and macd[i] > sig[i])
            dn_ok = (last_xdn is not None and last_ob is not None and abs((i - last_xdn) - (i - last_ob)) <= cross_win
                     and not np.isnan(sig[i]) and macd[i] < sig[i])
        else:
            up_ok, dn_ok = macd[i] > macd[i - 1], macd[i] < macd[i - 1]
        long_conf = os_recent and rsi[i] < 50 and rsi[i] > rsi[i - 1] and up_ok
        short_conf = ob_recent and rsi[i] > 50 and rsi[i] < rsi[i - 1] and dn_ok
        entered = False
        if os_ok and long_conf and setup_low is not None and flat and not long_shown and cool_ok:
            long_shown, trk_long = True, False
            sl, setup_low = math.floor(setup_low), None
            pos, entry_bar, entry_px, entered = 1, i, C[i], True
        elif ob_ok and short_conf and setup_high is not None and flat and not short_shown and cool_ok:
            short_shown, trk_short = True, False
            sl, setup_high = math.ceil(setup_high), None
            pos, entry_bar, entry_px, entered = -1, i, C[i], True
        prev_pos_bar = 0 if entered else pos      # Pine's in_long/in_short = position at bar open
        exit_reason = None
        if prev_pos_bar == 1 and L[i] <= sl:
            exit_reason = "Hard SL"
        elif prev_pos_bar == -1 and H[i] >= sl:
            exit_reason = "Hard SL"
        elif prev_pos_bar != 0 and i - entry_bar >= max_hold:
            exit_reason = "Time Stop"
        else:
            if prev_pos_bar == 1 and rsi[i] > 50 and rsi[i - 1] <= 50 and cool_ok:
                exit_reason = "RSI 50 Exit"
            elif prev_pos_bar == -1 and rsi[i] < 50 and rsi[i - 1] >= 50 and cool_ok:
                exit_reason = "RSI 50 Exit"
        prev_pos = pos
        if exit_reason:
            d = pos
            trades.append(dict(entry_bar=entry_bar, exit_bar=i, d=d, entry=entry_px, exit=C[i], sl=sl,
                               ret=d * (C[i] - entry_px) / entry_px * 100, reason=exit_reason))
            pos = 0
            if exit_reason == "RSI 50 Exit":
                last_exit = i
            prev_pos = d                          # so the next bar registers 'just went flat'
    return trades
