"""Python port of BigBeluga "Smart Money Concepts [1.0.0]" swing structure + volumetric order blocks,
default settings (mslen 5, Adjusted Points, sweeps on, OB construction 'Length' 5 -> 1x ATR(200),
mitigation 'Close', Hide Overlap 'Recent', show last 5 per side, breakers off).
Replays bar by bar and snapshots what the chart would have shown on requested bars (no hindsight).
Part of the SMC order-block study (29 Sep 2026)."""
import numpy as np

MSLEN, SHOW_LAST = 5, 5


def rma_atr(h, l, c, n):
    tr = np.empty(len(c)); tr[0] = h[0] - l[0]
    tr[1:] = np.maximum(h[1:] - l[1:], np.maximum(abs(h[1:] - c[:-1]), abs(l[1:] - c[:-1])))
    a = np.full(len(c), np.nan)
    if len(c) >= n:
        a[n - 1] = tr[:n].mean()
        for i in range(n, len(c)):
            a[i] = (a[i - 1] * (n - 1) + tr[i]) / n
    return a


def pivots(x, n, high=True):
    """ta.pivothigh/low(x, n, n): value at bar i refers to bar i-n."""
    out = np.full(len(x), np.nan)
    for i in range(2 * n, len(x)):
        p = i - n
        left, right = x[p - n:p], x[p + 1:i + 1]
        if high and x[p] > left.max() and x[p] > right.max():
            out[i] = x[p]
        if not high and x[p] < left.min() and x[p] < right.min():
            out[i] = x[p]
    return out


def overlaps(s, c):
    return ((s["btm"] > c["btm"] and s["btm"] < c["top"]) or (s["top"] < c["top"] and s["btm"] > c["btm"])
            or (s["top"] > c["top"] and s["btm"] < c["btm"]) or (s["top"] < c["top"] and s["top"] > c["btm"]))


def run(O, H, L, C, snap_bars=()):
    N = len(C)
    atr = rma_atr(H, L, C, 200)          # len 5 -> atr/(5/5)
    ph, pl = pivots(H, MSLEN, True), pivots(L, MSLEN, False)
    snap_bars = set(snap_bars)
    snaps, trend_arr = {}, np.zeros(N, int)
    dnsweep_arr, upsweep_arr = np.zeros(N, bool), np.zeros(N, bool)
    ms = dict(start=0, loc=None, bos=np.nan, choch=np.nan, trend=0, main=np.nan, temp=None, xloc=None)
    blob, brob = [], []
    php, phn, plp, pln = [np.nan], [None], [np.nan], [None]
    up = dn = np.nan

    def find(use_max, useob, i):
        if ms["loc"] is None:
            return 0
        back = i - ms["loc"]
        end = back - 1 if back - 1 > 0 else back
        lo = max(0, i - end)
        seg = (H if use_max else L)[lo:i + 1]
        m = seg.max() if use_max else seg.min()
        far = lo + int(np.flatnonzero(seg == m)[0])     # farthest-back bar holding the extreme
        idx = i - far
        if useob and i - idx - 1 >= 0:
            j = i - idx - 1
            if (H[j] > H[i - idx]) if use_max else (L[j] < L[i - idx]):
                idx += 1
        return idx

    def newob(bull, cords, idx, i):
        b = i - idx
        if np.isnan(cords):
            return
        ob = dict(bull=True, top=cords, btm=L[b], anchor=b, created=i) if bull else \
             dict(bull=False, top=H[b], btm=cords, anchor=b, created=i)
        (blob if bull else brob).insert(0, ob)

    for i in range(N):
        idbull = find(False, True, i)
        idbear = find(True, True, i)
        a_b, a_u = atr[i - idbear], atr[i - idbull]
        btmP = L[i - idbear] if (H[i - idbear] - a_b) < L[i - idbear] else H[i - idbear] - a_b
        topP = H[i - idbull] if (L[i - idbull] + a_u) > H[i - idbull] else L[i - idbull] + a_u
        if not np.isnan(ph[i]):
            php.insert(0, ph[i]); phn.insert(0, i - MSLEN)
        if not np.isnan(pl[i]):
            plp.insert(0, pl[i]); pln.insert(0, i - MSLEN)
        if php and H[i] > (php[0] if not np.isnan(php[0]) else np.inf):
            php, phn = [], []
        if plp and L[i] < (plp[0] if not np.isnan(plp[0]) else -np.inf):
            plp, pln = [], []
        crossup = crossdn = False
        if np.isnan(up): up = H[i]
        if np.isnan(dn): dn = L[i]
        if H[i] > up: up, dn, crossup = H[i], L[i], True
        if L[i] < dn: up, dn, crossdn = H[i], L[i], True

        if ms["start"] == 0:
            ms.update(start=1, loc=i, temp=i, xloc=i, bos=H[i], choch=L[i], trend=0)
        upsweep = dnsweep = False
        c, o = C[i], O[i]
        if ms["start"] == 1:
            if L[i] <= ms["choch"] and c >= ms["choch"]:
                dnsweep = True; ms["choch"] = L[i]
            elif H[i] >= ms["bos"] and c <= ms["bos"]:
                upsweep = True; ms["bos"] = H[i]
            elif c <= ms["choch"]:
                newob(True, topP, idbull, i)
                ms.update(trend=-1, choch=ms["bos"], bos=np.nan, start=2, loc=i, main=L[i], temp=i, xloc=i)
            elif c >= ms["bos"]:
                newob(False, btmP, idbear, i)
                ms.update(trend=1, bos=np.nan, start=2, loc=i, main=H[i], temp=i, xloc=i)
        if ms["start"] == 2:
            fifth = i % MSLEN == 0            # Pine: bar_index % mslen * 2 == 0
            if ms["trend"] == -1:
                if L[i] <= ms["main"]: ms["main"], ms["temp"] = L[i], i
                if fifth and not np.isnan(ms["bos"]) and php and not np.isnan(php[0]) and php[0] < ms["choch"]:
                    ms.update(choch=php[0], loc=phn[0], xloc=phn[0], temp=phn[0])
                if np.isnan(ms["bos"]) and crossup and c > o and C[i - 1] > O[i - 1]:
                    ms.update(bos=ms["main"], loc=ms["temp"], xloc=ms["temp"])
                if not np.isnan(ms["bos"]) and L[i] <= ms["bos"] and c >= ms["bos"]:
                    dnsweep = True; ms["bos"] = L[i]
                elif not np.isnan(ms["bos"]) and c <= ms["bos"]:
                    newob(False, btmP, idbear, i)
                    idx = find(True, False, i)
                    ms.update(bos=np.nan, choch=H[i - idx], loc=i - idx, xloc=i)
                if H[i] >= ms["choch"] and c <= ms["choch"]:
                    upsweep = True; ms["choch"] = H[i]
                elif c >= ms["choch"]:
                    newob(True, topP, idbull, i)
                    idx = find(False, False, i)
                    ms["choch"] = L[i - idx] if np.isnan(ms["bos"]) else ms["bos"]
                    ms.update(bos=np.nan, main=H[i], trend=1, loc=i, xloc=i, temp=i)
            else:
                if H[i] >= ms["main"]: ms["main"], ms["temp"] = H[i], i
                if np.isnan(ms["bos"]) and crossdn and c < o and C[i - 1] < O[i - 1]:
                    ms.update(bos=ms["main"], loc=ms["temp"], xloc=ms["temp"])
                if fifth and not np.isnan(ms["bos"]) and plp and not np.isnan(plp[0]) and plp[0] > ms["choch"]:
                    ms.update(choch=plp[0], loc=pln[0], xloc=pln[0], temp=pln[0])
                if not np.isnan(ms["bos"]) and H[i] >= ms["bos"] and c <= ms["bos"]:
                    upsweep = True; ms["bos"] = H[i]
                elif not np.isnan(ms["bos"]) and c >= ms["bos"]:
                    newob(True, topP, idbull, i)
                    idx = find(False, False, i)
                    ms.update(bos=np.nan, choch=L[i - idx], loc=i - idx, xloc=i)
                if L[i] <= ms["choch"] and c >= ms["choch"]:
                    dnsweep = True; ms["choch"] = L[i]
                elif c <= ms["choch"]:
                    newob(False, btmP, idbear, i)
                    idx = find(True, False, i)
                    ms["choch"] = H[i - idx] if np.isnan(ms["bos"]) else ms["bos"]
                    ms.update(bos=np.nan, main=L[i], trend=-1, loc=i, temp=i, xloc=i)

        # mitigation (Close): body through the far edge removes the block (breakers off)
        lo_body, hi_body = min(c, o), max(c, o)
        blob[:] = [b for b in blob if not lo_body < b["btm"]]
        brob[:] = [b for b in brob if not hi_body > b["top"]]
        # Hide Overlap, 'Recent'
        for arr in (blob, brob):
            k = len(arr) - 1
            while k >= 1 and len(arr) > 1:
                if k < len(arr) and overlaps(arr[k], arr[0]):
                    arr.pop(k)
                k -= 1
        for first, other in ((blob, brob), (brob, blob)):
            if first and other:
                k = len(first) - 1
                while k >= 0 and first and other:
                    if k < len(first) and overlaps(first[k], other[0]):
                        first.pop(0)                   # Pine removes index 0 when 'Recent'
                    k -= 1

        trend_arr[i], upsweep_arr[i], dnsweep_arr[i] = ms["trend"], upsweep, dnsweep
        if i in snap_bars:
            snaps[i] = ([dict(b) for b in blob[:SHOW_LAST]], [dict(b) for b in brob[:SHOW_LAST]])
    return snaps, trend_arr, upsweep_arr, dnsweep_arr
