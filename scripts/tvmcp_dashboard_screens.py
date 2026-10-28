#!/usr/bin/env python3
"""
Rebuild of David's four tvremix.xyz dashboards (SID OB, SID OS, LORP Trend,
LORP Reversion) on the official TradingView MCP ("TV MCP") screener.

Why: tvremix.xyz is shutting down, and its dashboards could only be read
through a signed-in browser session that kept expiring. The TV MCP screener
gives the same data headlessly. Criteria below were copied from each board's
own filter bar on 28 Oct 2026.

The TV MCP screener can't filter one column against another (MACD vs its
signal, close vs EMA21), so those tests are applied here, after the call.

Usage:
    python3 -I tvmcp_dashboard_screens.py --board sid_ob --in screener.json
    python3 -I tvmcp_dashboard_screens.py --merge sid_ob.json sid_os.json lorp_trend.json lorp_rev.json

Each --board run reads one saved run_screener result ({data:{rows:[...]}})
and prints the board's ticker list as JSON ({"board", "symbols": [...]}).
--merge reads those outputs and prints the deduplicated EXCHANGE:TICKER list,
first occurrence order, one per line.

TV MCP run_screener call for each board (market "america",
symbol_types ["stock","dr"], limit 800;
always add columns type,subtype; every board also gets the filter
"average_volume_10d_calc":[300000,null] — tvremix screened a liquidity-filtered
universe, and on 28 Oct 2026 every name TV MCP returned that the boards did not
was under ~300K average volume):

  sid_ob     filters {"RSI":[60,70], "market_cap_basic":[1e9,3e11], "close":[10,null]}
             sort RSI desc   columns name,RSI,MACD.macd,MACD.signal
  sid_os     filters {"RSI":[30,40], "market_cap_basic":[1e9,3e11], "close":[10,null]}
             sort RSI desc   columns name,RSI,MACD.macd,MACD.signal
  lorp_trend filters {"RSI":[55,80], "market_cap_basic":[1e10,null], "close":[10,null]}
             sort change desc columns name,RSI,MACD.macd,MACD.signal,EMA21,close,change
  lorp_rev   filters {"RSI":[30,45], "market_cap_basic":[1e9,3e11], "close":[10,null]}
             sort RSI asc    columns name,RSI,MACD.macd,MACD.signal
"""
import argparse
import json
import sys

LISTED = ("NYSE", "NASDAQ", "AMEX")  # tvremix boards showed listed US names only, no OTC

BOARDS = {
    # name: (macd test, extra test, rows kept)
    "sid_ob": ("above", None, 25),
    "sid_os": ("below", None, 50),
    "lorp_trend": ("above", "close_above_ema21", 25),
    "lorp_rev": ("below", None, 25),
}


def num(r, k):
    v = r.get(k)
    return v if isinstance(v, (int, float)) else None


def screen(rows, board):
    macd_dir, extra, keep = BOARDS[board]
    out = []
    for r in rows:
        sym = r.get("symbol", "")
        if sym.split(":")[0] not in LISTED:
            continue
        # tvremix dropped preferred/unit classes (they borrow the parent's market
        # cap) but kept ADRs; common stock has subtype "common", ADRs subtype "".
        if r.get("subtype") not in ("common", "", None):
            continue
        m, s = num(r, "MACD.macd"), num(r, "MACD.signal")
        if m is None or s is None:
            continue
        if macd_dir == "above" and not m > s:
            continue
        if macd_dir == "below" and not m < s:
            continue
        if extra == "close_above_ema21":
            c, e = num(r, "close"), num(r, "EMA21")
            if c is None or e is None or not c > e:
                continue
        out.append(sym)
        if len(out) == keep:
            break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", choices=BOARDS)
    ap.add_argument("--in", dest="infile")
    ap.add_argument("--merge", nargs="+")
    a = ap.parse_args()
    if a.merge:
        seen, merged = set(), []
        for f in a.merge:
            for s in json.load(open(f))["symbols"]:
                if s not in seen:
                    seen.add(s)
                    merged.append(s)
        print("\n".join(merged))
        return
    if not (a.board and a.infile):
        ap.error("need --board and --in, or --merge")
    d = json.load(open(a.infile))
    rows = d["data"]["rows"]
    syms = screen(rows, a.board)
    json.dump({"board": a.board, "universe": d["data"].get("totalCount"), "symbols": syms}, sys.stdout)
    print()


if __name__ == "__main__":
    main()
