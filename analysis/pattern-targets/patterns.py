"""Python port of SID Pattern Finder v2.5 (~/Trading Indicators/indicators/SID_Pattern_Finder_v2.5.pine), default settings.
Detects H&S / Inverse H&S / Double Top / Double Bottom on daily OHLC and records each pattern's
life-cycle (found -> confirmed / failed / no-break / superseded) so trades can be checked against
exactly what the chart would have shown at the time.  Part of the pattern-target study (28 Sep 2026)."""
import math
import numpy as np

DEF = dict(zz=1.25, atr=14, maxW=60, breakWin=15, trendBars=20, shTol=1.0, headMin=0.5,
           neckTol=1.0, symMax=2.5, dblTol=0.75, dblDepth=2.0, dblGap=5)
NAMES = {1: "H&S", 2: "INV H&S", 3: "DOUBLE TOP", 4: "DOUBLE BOTTOM"}


def wilder_atr(h, l, c, n):
    tr = np.empty(len(c))
    tr[0] = h[0] - l[0]
    tr[1:] = np.maximum(h[1:] - l[1:], np.maximum(abs(h[1:] - c[:-1]), abs(l[1:] - c[:-1])))
    atr = np.full(len(c), np.nan)
    if len(c) >= n:
        atr[n - 1] = tr[:n].mean()
        for i in range(n, len(c)):
            atr[i] = (atr[i - 1] * (n - 1) + tr[i]) / n
    return atr


def nv(p, x):
    b1, p1, b2, p2 = p["nb1"], p["np1"], p["nb2"], p["np2"]
    return p1 if b1 == b2 else p1 + (p2 - p1) * (x - b1) / (b2 - b1)


def detect(H, L, C, P=DEF):
    N = len(C)
    atr = wilder_atr(H, L, C, P["atr"])
    piv = []          # (type, price, bar, atr)  type 1 = high, -1 = low
    pats = []         # every pattern ever created (Pine removes some; flag 'removed' mirrors that)
    zd, xp, xb, xa = 0, None, None, None

    def before(b, lowest):
        lo = max(0, b - P["trendBars"])
        seg = (L if lowest else H)[lo:b]
        if len(seg) == 0:
            return math.inf if lowest else -math.inf
        return seg.min() if lowest else seg.max()

    def on_chart(q):
        return not q["removed"] and q["state"] != 4 and not q["shadow"]

    def shared(bars):
        return max([len(set(bars) & set(q["bars"])) for q in pats if on_chart(q)] or [0])

    def live_end(d):
        return max([q["last"] for q in pats if not q["removed"] and q["dir"] == d and q["state"] <= 1] or [-1])

    for i in range(N):
        a_i = atr[i]
        if np.isnan(a_i):
            continue
        new = False
        if zd == 0:
            zd, xp, xb, xa = 1, H[i], i, a_i
        elif zd == 1:
            if H[i] >= xp:
                xp, xb, xa = H[i], i, a_i
            elif L[i] <= xp - P["zz"] * xa:
                piv.append((1, xp, xb, xa)); new = True
                zd, xp, xb, xa = -1, L[i], i, a_i
        else:
            if L[i] <= xp:
                xp, xb, xa = L[i], i, a_i
            elif H[i] >= xp + P["zz"] * xa:
                piv.append((-1, xp, xb, xa)); new = True
                zd, xp, xb, xa = 1, H[i], i, a_i

        if new:
            n = len(piv)
            lt = piv[-1][0]
            d = -1 if lt == 1 else 1
            lastEnd = live_end(d)
            kind, idx = 0, None
            if n >= 5:
                ls, n1, hd, n2, rs = piv[-5:]
                a = hd[3]
                s1, s2 = hd[2] - ls[2], rs[2] - hd[2]
                common = (rs[2] - ls[2] <= P["maxW"] and abs(ls[1] - rs[1]) <= P["shTol"] * a
                          and abs(n1[1] - n2[1]) <= P["neckTol"] * a
                          and max(s1, s2) <= P["symMax"] * min(s1, s2) and ls[2] > lastEnd)
                if lt == 1 and common and hd[1] - max(ls[1], rs[1]) >= P["headMin"] * a \
                        and before(ls[2], True) < min(n1[1], n2[1]):
                    kind = 1
                elif lt == -1 and common and min(ls[1], rs[1]) - hd[1] >= P["headMin"] * a \
                        and before(ls[2], False) > max(n1[1], n2[1]):
                    kind = 2
                if kind:
                    idx = list(range(n - 5, n))
            if not kind and n >= 3:
                t2 = piv[-1]
                j = n - 3
                while j >= 0 and not kind:
                    t1 = piv[j]
                    gap = t2[2] - t1[2]
                    if gap > P["maxW"]:
                        break
                    blocked, m = False, None
                    for k in range(j + 1, n - 1):
                        q = piv[k]
                        if q[0] == lt:
                            if (q[1] >= min(t1[1], t2[1])) if lt == 1 else (q[1] <= max(t1[1], t2[1])):
                                blocked = True
                        elif m is None or (q[1] < m[1] if lt == 1 else q[1] > m[1]):
                            m = q
                    if blocked:
                        break
                    a = t1[3]
                    ok = gap >= P["dblGap"] and abs(t1[1] - t2[1]) <= P["dblTol"] * a and t1[2] > lastEnd
                    if lt == 1:
                        ok = ok and min(t1[1], t2[1]) - m[1] >= P["dblDepth"] * a and before(t1[2], True) < m[1]
                    else:
                        ok = ok and m[1] - max(t1[1], t2[1]) >= P["dblDepth"] * a and before(t1[2], False) > m[1]
                    if ok:
                        kind = 3 if lt == 1 else 4
                        idx = [j, piv.index(m), n - 1]
                    j -= 2
            if kind:
                sw = [piv[k] for k in idx]
                hs = kind <= 2
                p = dict(kind=kind, dir=d, bars=[s[2] for s in sw], prices=[s[1] for s in sw],
                         nb1=sw[1][2], np1=sw[1][1], nb2=(sw[3][2] if hs else sw[1][2]),
                         np2=(sw[3][1] if hs else sw[1][1]), first=sw[0][2], last=sw[-1][2],
                         found=i, state=0, end=None, tgt=None, neck_brk=None, removed=False)
                if hs:
                    p["hb"], p["hp"] = sw[2][2], sw[2][1]
                else:
                    firstMore = sw[0][1] >= sw[-1][1] if d == -1 else sw[0][1] <= sw[-1][1]
                    p["hb"], p["hp"] = (sw[0][2], sw[0][1]) if firstMore else (sw[-1][2], sw[-1][1])
                p["height"] = abs(p["hp"] - nv(p, p["hb"]))
                p["shadow"] = shared(p["bars"]) >= 2
                p["shown_from"] = None if p["shadow"] else i
                pats.append(p)

        # neckline break / failure / expiry (Pine: on confirmed bars, after detection)
        for p in pats:
            if p["removed"] or p["state"] != 0 or i <= p["last"]:
                continue
            v = nv(p, i)
            broke = C[i] < v if p["dir"] == -1 else C[i] > v
            failed = C[i] > p["hp"] if p["dir"] == -1 else C[i] < p["hp"]
            if broke:
                p.update(state=1, end=i, neck_brk=v, tgt=v + p["dir"] * p["height"])
                if p["shadow"]:
                    p["shadow"] = False
                    p["shown_from"] = i
                    for q in pats:
                        if q is not p and not q["removed"] and len(set(q["bars"]) & set(p["bars"])) >= 2:
                            q["state"], q["end"], q["removed"] = 4, i, True
            elif failed or i - p["last"] > P["breakWin"]:
                p.update(state=2 if failed else 3, end=i)
                if failed or p["shadow"]:
                    p["removed"] = True
    return pats, atr
