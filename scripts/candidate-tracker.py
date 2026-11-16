#!/usr/bin/env python3
"""Candidate follow-up tracker (16 Nov 2026).

Every brief candidate (SID Long/Short rows in brief-<date>-data.csv, LORP rows in
data/lorp_signal_log.csv) is followed for 10 US sessions, whether or not David took it.
Entry reference = OPEN of the first US session on/after the brief date (the brief runs on
the AEST morning after the signal close, so that session is the first one he could trade).
Returns are direction-adjusted (shorts gain when price falls).

Outputs
  data/candidate_tracker.csv            one row per candidate, refreshed each run
  ~/Downloads/Briefs/candidate-review-latest.md   readable summary
data/taken.csv (opened,symbol,side, from STB My Trades) marks the ones actually traded.
Prices: Yahoo Finance daily bars (cached per run).
"""
import csv, glob, json, os, re, sys, time, urllib.request, datetime as dt
from statistics import mean

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIEFS = os.path.expanduser('~/Downloads/Briefs')
OUT = os.path.join(REPO, 'data', 'candidate_tracker.csv')
TAKEN = os.path.join(REPO, 'data', 'taken.csv')
REVIEW = os.path.join(BRIEFS, 'candidate-review-latest.md')
HORIZON = 10
CHECKS = (1, 3, 5, 10)

def candidates():
    c = {}
    for f in sorted(glob.glob(os.path.join(BRIEFS, 'brief-*-data.csv'))):
        d = re.search(r'brief-(\d{4}-\d{2}-\d{2})-data', f).group(1)
        for r in csv.DictReader(open(f, encoding='utf-8-sig')):
            if (r.get('Section') or '').strip() == 'SID' and r.get('Type') in ('Long', 'Short'):
                c[(d, r['Ticker'], 'SID')] = dict(date=d, symbol=r['Ticker'], strategy='SID',
                    direction=r['Type'], brief_price=r.get('Price', ''), detail='')
    lp = os.path.join(REPO, 'data', 'lorp_signal_log.csv')
    if os.path.exists(lp):
        for r in csv.DictReader(open(lp, encoding='utf-8-sig')):
            d, s = r['brief_date'], r['symbol']
            c[(d, s, 'LORP')] = dict(date=d, symbol=s, strategy='LORP', direction='Long',
                brief_price=r.get('price', ''), detail=(r.get('entry_type') or '').strip())
    return list(c.values())

_cache = {}
def bars(sym):
    if sym in _cache: return _cache[sym]
    y = sym.replace('.', '-')
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{y}?range=6mo&interval=1d'
    out = []
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = json.load(urllib.request.urlopen(req, timeout=20))['chart']['result'][0]
        q = res['indicators']['quote'][0]
        for i, t in enumerate(res['timestamp']):
            o, h, l, cl = q['open'][i], q['high'][i], q['low'][i], q['close'][i]
            if None in (o, h, l, cl) or min(o, h, l, cl) <= 0: continue
            day = dt.datetime.fromtimestamp(t, dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
            out.append((day, o, h, l, cl))
    except Exception as e:
        print(f'[warn] {sym}: {e}', file=sys.stderr)
    _cache[sym] = out
    time.sleep(0.3)
    return out

def outcome(c):
    b = [x for x in bars(c['symbol']) if x[0] >= c['date']]
    r = dict(entry_date='', entry=None, sessions=0)
    if not b: return r
    sign = -1 if c['direction'] == 'Short' else 1
    e = b[0][1]; r['entry_date'] = b[0][0]; r['entry'] = round(e, 4)
    win = b[:HORIZON]; r['sessions'] = len(win)
    for n in CHECKS:
        if len(win) >= n:
            r[f'ret_d{n}'] = round(sign * (win[n-1][4] / e - 1) * 100, 2)
    for n in (5, 10):
        w = win[:n]
        if len(w) == n:
            hi, lo = max(x[2] for x in w), min(x[3] for x in w)
            fav, adv = (hi, lo) if sign > 0 else (lo, hi)
            r[f'mfe_d{n}'] = round(sign * (fav / e - 1) * 100, 2)
            r[f'mae_d{n}'] = round(sign * (adv / e - 1) * 100, 2)
    return r

def main():
    # data/taken.csv: opened,symbol,side (from STB My Trades). A candidate counts as taken when the
    # same symbol and direction was opened from 2 days before (STB dates the entry a day earlier than the AEST brief) to 5 days after the brief date.
    taken = []
    if os.path.exists(TAKEN):
        for r in csv.DictReader(open(TAKEN)):
            taken.append((r['opened'].strip(), r['symbol'].strip().upper(), r.get('side', '').strip().title()))
    def is_taken(c):
        d0 = dt.date.fromisoformat(c['date'])
        for o, s, side in taken:
            if s != c['symbol'].upper() or (side and side != c['direction']): continue
            if -2 <= (dt.date.fromisoformat(o) - d0).days <= 5: return True
        return False
    rows = []
    for c in candidates():
        c.update(outcome(c))
        c['taken'] = 'Y' if is_taken(c) else ''
        rows.append(c)
    rows.sort(key=lambda r: (r['date'], r['strategy'], r['symbol']))
    cols = ['date', 'strategy', 'direction', 'symbol', 'detail', 'brief_price', 'taken', 'entry_date', 'entry', 'sessions'] + \
           [f'ret_d{n}' for n in CHECKS] + ['mfe_d5', 'mae_d5', 'mfe_d10', 'mae_d10']
    with open(OUT, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore'); w.writeheader(); w.writerows(rows)

    def stats(rs, k):
        v = [r[k] for r in rs if r.get(k) is not None]
        return (len(v), sum(1 for x in v if x > 0) / len(v) * 100 if v else 0, mean(v) if v else 0)
    L = [f'# Brief candidate follow-up — {dt.date.today():%a %d %b %Y}', '',
         'Every brief candidate, followed from the open of the first session after the brief. '
         'Returns are % and direction-adjusted (a short gains when price falls). '
         '"Up" = share of candidates in profit at that close.', '',
         '| Group | n (5 sessions) | Up at day 5 | Avg day 5 | Avg best (5d) | Avg worst (5d) | n (10) | Up at day 10 | Avg day 10 |',
         '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    groups = [('SID Long', lambda r: r['strategy'] == 'SID' and r['direction'] == 'Long'),
              ('SID Short', lambda r: r['strategy'] == 'SID' and r['direction'] == 'Short'),
              ('LORP', lambda r: r['strategy'] == 'LORP'),
              ('Taken (all)', lambda r: r['taken'] == 'Y'),
              ('Not taken (all)', lambda r: r['taken'] != 'Y')]
    for name, fn in groups:
        g = [r for r in rows if fn(r)]
        n5, u5, a5 = stats(g, 'ret_d5'); n10, u10, a10 = stats(g, 'ret_d10')
        if not n5 and not n10: continue
        mf = mean([r['mfe_d5'] for r in g if r.get('mfe_d5') is not None] or [0])
        ma = mean([r['mae_d5'] for r in g if r.get('mae_d5') is not None] or [0])
        L.append(f'| {name} | {n5} | {u5:.0f}% | {a5:+.2f} | {mf:+.2f} | {ma:+.2f} | {n10} | {u10:.0f}% | {a10:+.2f} |')
    recent = [r for r in rows if r.get('ret_d5') is not None]
    recent = sorted(recent, key=lambda r: r['date'], reverse=True)[:25]
    L += ['', '## Latest candidates with a 5-session result', '',
          '| Brief | Strategy | Symbol | Taken | Day 1 | Day 3 | Day 5 | Best 5d | Worst 5d | Day 10 |',
          '|---|---|---|:-:|---:|---:|---:|---:|---:|---:|']
    f_ = lambda v: '' if v is None else f'{v:+.1f}'
    for r in recent:
        L.append(f"| {r['date']} | {r['strategy']} {r['direction'] if r['strategy']=='SID' else ''} | {r['symbol']} | {r['taken']} | "
                 f"{f_(r.get('ret_d1'))} | {f_(r.get('ret_d3'))} | {f_(r.get('ret_d5'))} | {f_(r.get('mfe_d5'))} | {f_(r.get('mae_d5'))} | {f_(r.get('ret_d10'))} |")
    L += ['', f'Full table: `data/candidate_tracker.csv` ({len(rows)} candidates). '
          'Taken trades come from `data/taken.csv` (STB My Trades: opened,symbol,side), refreshed when Claude pulls your STB trade list.']
    open(REVIEW, 'w').write('\n'.join(L) + '\n')
    print(f'[ok] {len(rows)} candidates -> {OUT}; review -> {REVIEW}')

if __name__ == '__main__':
    main()
