This is a scheduled task. You have no memory of any prior conversation — treat this message as the complete brief.

PARALLEL-RUN TEST VERSION (started 28 Oct 2026). This is a copy of David's "Daily sector rotation report" moved from the tvremix "TradingView" connector (being shut down, 50 calls/day cap) to the official "TV MCP" connector. The original task still runs and still emails David. This test version must NOT email David and must NOT write into ~/Downloads/Briefs/ itself — it only writes to a test subfolder so the two can be compared before switching over.

Goal: produce David's daily US sector and sub-industry rotation report, after the US market has closed. It compares the LAST 5 TRADING DAYS against the PRECEDING 1-MONTH period (the ~21 trading days immediately before those 5 days) to show which sectors and sub-industry groups money is rotating into and out of — and which falling groups are SID bounce candidates.

Background: SID is David's RSI/MACD mean-reversion bounce strategy. A SID long setup is a group that has sold off into oversold RSI and is starting to turn (RSI passing back up through 30 and/or MACD crossing up through its signal line). SMA200 position is context, not a gate.

Universe (TradingView format), benchmark AMEX:SPY.

Tier 1 — Sectors: AMEX:XLK Technology, AMEX:XLF Financials, AMEX:XLE Energy, AMEX:XLV Healthcare, AMEX:XLI Industrials, AMEX:XLY Consumer Discretionary, AMEX:XLP Consumer Staples, AMEX:XLU Utilities, AMEX:XLB Materials, AMEX:XLRE Real Estate, AMEX:XLC Communications, AMEX:IWM Small caps.

Tier 2 — Sub-industry groups (parent sector in brackets):
- Technology: NASDAQ:SMH Semiconductors, CBOE:IGV Software, NASDAQ:CIBR Cybersecurity, NASDAQ:BOTZ Robotics & AI
- Financials: AMEX:KRE Regional Banks, AMEX:KIE Insurance, AMEX:IAI Brokers & Exchanges
- Healthcare: AMEX:XBI Biotech, AMEX:IHI Medical Devices
- Industrials: CBOE:ITA Aerospace & Defense, CBOE:IYT Transports, AMEX:JETS Airlines, CBOE:PAVE Infrastructure
- Consumer Discretionary: AMEX:XHB Homebuilders, AMEX:XRT Retail
- Energy: AMEX:XOP Oil & Gas E&P, AMEX:OIH Oil Services, AMEX:URA Uranium, AMEX:TAN Solar
- Materials: AMEX:XME Metals & Mining, AMEX:GDX Gold Miners, AMEX:COPX Copper Miners

Data — use the TV MCP connector ONLY (tool names start mcp__TV_MCP__). Do NOT use any mcp__TradingView__ tool (that is the retiring tvremix connector). Load via ToolSearch: "select:mcp__TV_MCP__mcp-tv-get-ohlcv,mcp__TV_MCP__mcp-tv-get-symbol-data-batch".
- For each of the 35 symbols (34 groups + SPY) call mcp__TV_MCP__mcp-tv-get-ohlcv with interval "1D", count 230, format "columns". If an exchange prefix is rejected, resolve the right one with mcp__TV_MCP__mcp-tv-search-symbols and record the correction in the report caveat line.
- The last bar returned may still be forming. Use the timestamp: a bar counts as "today" only if it is a completed US regular session (this task runs ~15 minutes after the 16:00 New York close, so today's bar should be complete — but if its volume looks partial or its date is a future/open session, drop it and use the prior bar).
- Tool results are recorded in the session transcript (~/.claude/projects/*/*.jsonl), so extract the bars from there in Python rather than retyping numbers.
- If get_ohlcv fails for a symbol after one retry, fall back to mcp__TV_MCP__mcp-tv-get-symbol-data-batch with columns Perf.W, Perf.1M, relative_volume_10d_calc, RSI, RSI[1], MACD.macd, MACD.signal, SMA50, SMA200, close, derive prior-month return as (1+Perf.1M)/(1+Perf.W)-1, and note the fallback in the report.

Compute in code (Python), for each symbol, using the most recent completed daily bar as "today":
- 5D return: close today vs close 5 bars ago.
- Prior-month return: close 5 bars ago vs close 26 bars ago.
- Relative strength (RS) vs SPY for both windows (symbol return minus SPY return).
- Rotation shift = 5D RS minus (prior-month RS × 5/21).
- Volume ratio: average volume of last 5 bars ÷ average volume of the prior 21 bars.
- Above/below 50-day and 200-day SMA, and whether the close crossed each average within the last 5 bars; 14-day RSI (Wilder) today and its lowest value in the last 5 bars; MACD(12,26,9) line vs signal and whether the histogram rose today.
- For sub-industries also: 5D return minus its PARENT sector ETF's 5D return.

Classify rotation status:
- STRONG INFLOW: positive 5D RS, positive shift, volume ratio ≥ 1.0
- NEW INFLOW (rotation in): positive 5D RS after negative prior-month RS
- FADING (rotation out): negative 5D RS after positive prior-month RS
- PERSISTENT OUTFLOW: negative 5D RS and negative prior-month RS
- Otherwise NEUTRAL/MIXED.

Classify SID stage for every symbol with a negative 5D return OR RSI ≤ 35:
- SID TRIGGER: RSI was ≤ 30 within the last 5 bars and today RSI is back above 30, or MACD line crossed above signal today/yesterday while RSI ≤ 40 — the bounce is starting.
- SID SETUP: RSI ≤ 30 now, still falling (no turn yet).
- SID WATCH: RSI 30–35 and falling.
- Otherwise just FALLING (no SID stage).
Also flag any group with RSI ≥ 70 as OVERBOUGHT.

If the latest completed bar date is not newer than the previous US trading day (market holiday), write a one-line file saying "No new US session — market holiday" and stop.

Report format — identical to the live report (sections 1–7): heading "Sector Rotation — US close <date>" with SPY context; sectors table sorted by shift; top-5 sub-industry inflows; falling groups & SID candidates with best 1–3 named; Rotating in / Rotating out; What it means; one-line caveat (price/volume proxy for flows; SID stages are context, not trade signals). "vs 50/200-day" column = 50-day position / 200-day position, "(new)" if crossed in last 5 sessions, with the legend line under the first table. Group names alongside tickers. Percentages 1 dp. Tables generated in Python with every "|" aligned in monospace, numeric columns right-aligned, no markup inside cells. Do not reference Simon Parker or his book.

Also write the JSON sidecar with exactly the live schema: {"date", "spy_5d", "spy_prior", "beating_spy", "total": 34, "groups": [{"ticker","name","tier","parent","r5","rp","rs5","shift","vs_parent","vol_ratio","ma50","ma200","rsi","rsi_low5","macd","status","sid_stage","overbought"}]} — numbers as plain numbers in percent units.

DELIVERY (TEST — no email):
1. Name the files sector_rotation_<YYYY-MM-DD>_tvmcp.md and sector_rotation_<YYYY-MM-DD>_tvmcp.json. Send both with SendUserFile (status "proactive", display "attach"; caption on the .md: "TV MCP test — Sector Rotation <date>") and keep the file_uuids.
2. Save both to David's Mac mini at ~/Downloads/Briefs/tvmcp_test/ (NOT the main Briefs folder, so the morning brief keeps reading the live version). Load device tools via ToolSearch ("+remote-devices commit", "+remote-devices bash"); mkdir -p ~/Downloads/Briefs/tvmcp_test; resolve $HOME; commit with mcp__remote-devices__device_commit_files. Write only these two files. If the Mac isn't reachable, try once more then carry on.
3. Do NOT send any Gmail. Send a PushNotification ONLY if the run failed (e.g. TV MCP unavailable or fewer than 30 of 35 symbols returned data), starting "TV MCP sector test failed — " plus the reason.
4. Final reply, one line: how many of 35 symbols came from get_ohlcv vs fallback, the US close date, whether saved to Briefs/tvmcp_test.

Take no other actions — no trades, no watchlist changes, no emails, no other file changes.
