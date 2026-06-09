#!/usr/bin/env python3
"""Convert an SBT scan CSV into a TradingView-importable symbol list.
Usage:  python3 scripts/sbt_to_tv.py /path/to/SCAN.csv [--keep-etfs]
Writes <name>_TV.txt (one EXCHANGE:SYMBOL per line) next to the CSV for
TradingView's Watchlist > Import list, and prints a comma-joined string to paste.
Class A only (drops Class B/C share classes); ETFs dropped unless --keep-etfs."""
import sys, csv, os
if len(sys.argv)<2:
    print("usage: sbt_to_tv.py SCAN.csv [--keep-etfs]"); sys.exit(1)
src=sys.argv[1]; keep_etfs="--keep-etfs" in sys.argv
rows=list(csv.DictReader(open(src)))
syms=[]
for r in rows:
    nm=r.get('name','').lower()
    if 'class b' in nm or 'class c' in nm: continue           # Class A only
    if not keep_etfs and not r.get('sector','').strip(): continue  # drop ETFs (blank sector)
    s=r.get('tradingview_symbol','').strip()
    if s: syms.append(s)
out=os.path.splitext(src)[0]+"_TV.txt"
open(out,"w").write("\n".join(syms)+"\n")
print(f"{len(syms)} symbols -> {out}\n")
print(",".join(syms))
