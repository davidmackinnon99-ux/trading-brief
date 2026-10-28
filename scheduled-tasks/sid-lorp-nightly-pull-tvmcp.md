This is a scheduled task. You have no memory of any prior conversation — treat this message as the complete brief.

Goal: build tonight's SID/LORP ticker list from four screens (SID Long, SID Short, LORP Trend, LORP Reversion), merge and dedupe them, and deliver it in two forms: (1) a .txt file in this session, and (2) a CSV dropped into the inbox folder David's "SBT Nightly Merge" macOS app watches, so his SBT scan exports and this list are folded into one merge run.

Background (28 Oct 2026): these screens used to be dashboards on tvremix.xyz, read through a signed-in browser. tvremix is shutting down and its sign-in kept expiring, so they were rebuilt on the official TradingView MCP connector ("TV MCP"). The two LORP screens match the old boards. The two SID screens are stricter than the old "SID OB"/"SID OS" boards on purpose: they apply the real SID timing rule (RSI through the oversold/overbought zone, then MACD crossing its signal line within 10 bars). No browser and no sign-in are needed.

Use the TV MCP connector only (tool names start mcp__TV_MCP__). Do NOT use any mcp__TradingView__ tool (the retiring tvremix connector) and do not open any browser. Load the tools via ToolSearch: "select:mcp__TV_MCP__mcp-tv-run-screener,mcp__TV_MCP__mcp-tv-get-ohlcv".

Common to every screener call below: market "america", symbol_types ["stock","dr"], limit 1000. Results are large and get saved to a file under ~/.claude/projects/ (the tool says where); process them in Python, never retype rows. The JSON is {"data":{"rows":[...],"totalCount":n}}; each row has "symbol" (EXCHANGE:TICKER). If a call fails, retry once after ~20 seconds; if a response is rejected as too large, split that RSI band in two and retry.

Row rules used by every screen: keep a row only if the exchange prefix is NYSE, NASDAQ or AMEX, and "subtype" is "common", "" or missing (drops preferred/unit classes, keeps ADRs).

STEP 1 — SID candidates (MACD crossed its signal on the latest daily bar)
Run five screener calls with filters {"RSI":[lo,hi], "market_cap_basic":[1000000000,300000000000], "close":[10,null], "average_volume_10d_calc":[300000,null]} and columns ["RSI","MACD.hist","MACD.hist[1]","subtype"], for RSI bands [15,35], [35,45], [45,55], [55,65], [65,90] (the [45,55] band serves both sides).
- Long candidates: MACD.hist > 0 and MACD.hist[1] <= 0 and RSI <= 55.
- Short candidates: MACD.hist < 0 and MACD.hist[1] >= 0 and RSI >= 45.
(The screener ignores MACD.hist as a filter, so apply these tests in Python.) Expect roughly 40–80 long and 20–50 short candidates.

STEP 2 — SID timing rule on each candidate
For every candidate call mcp__TV_MCP__mcp-tv-get-ohlcv with interval "1D", count 100, format "columns". Pace the calls (batches of ~5, a few seconds apart). The bars are recorded in the session transcript (~/.claude/projects/*/*.jsonl) — extract them from there in Python. Confirm the latest bar is today's completed US session (this task runs after the 16:00 New York close).
Compute in Python from the closes:
- RSI(14), Wilder: first average gain/loss = simple mean of the first 14 changes, then avg = (prev*13 + current)/14.
- MACD(12,26,9): EMA_fast(12) and EMA_slow(26) of closes, each seeded with the simple mean of its first N closes, k = 2/(N+1); MACD = fast − slow; signal = EMA(9) of the MACD line seeded the same way from its first 9 valid values; histogram = MACD − signal.
- Cross bar = the latest bar where the histogram changed sign (it should be the last bar for every candidate; if it is not, drop the candidate).
- SID LONG qualifies if the cross is bullish (histogram turned positive) AND RSI was below 30 on at least one bar in the window from 10 bars before the cross up to and including the cross bar.
- SID SHORT qualifies if the cross is bearish (histogram turned negative) AND RSI was above 70 on at least one bar in that same window.
Drop any symbol whose bars are fewer than 100, out of time order, or whose computed RSI differs from the screener's RSI by more than 2 points (data mismatch).
Order SID Long by lowest RSI-in-zone first; order SID Short by highest RSI-in-zone first.

STEP 3 — LORP screens (unchanged from the old boards)
- LORP Trend — filters {"RSI":[55,80], "market_cap_basic":[10000000000,null], "close":[10,null], "average_volume_10d_calc":[300000,null]}; sort_by "change", sort_order "desc"; columns ["name","RSI","MACD.macd","MACD.signal","EMA21","close","change","type","subtype"]. Keep rows (in order) where MACD.macd > MACD.signal and close > EMA21 (all numbers). Keep the first 25.
- LORP Reversion — filters {"RSI":[30,45], "market_cap_basic":[1000000000,300000000000], "close":[10,null], "average_volume_10d_calc":[300000,null]}; sort_by "RSI", sort_order "asc"; columns ["name","RSI","MACD.macd","MACD.signal","type","subtype"]. Keep rows (in order) where MACD.macd < MACD.signal (both numbers). Keep the first 25.

Merge: SID Long, then SID Short, then LORP Trend, then LORP Reversion, removing duplicates (keep each symbol's first occurrence). Values are already EXCHANGE:TICKER.

FAILURE CHECK: if TV MCP is unavailable, or all four screens yield zero symbols, write no files. Send ONE PushNotification: "SID/LORP pull (TV MCP) failed — <short reason>. No list tonight." Your final reply is that same line. Stop. (Zero SID setups on a given night is normal and is not a failure.)

OUTPUT (do both):
1. Write the merged list to tvremix_sid_lorp_<today's date, YYYY-MM-DD>.txt, one EXCHANGE:TICKER per line, and deliver it with SendUserFile (status "proactive", display "attach").
2. Write the same list as a CSV with one column, header row exactly "tradingview_symbol" (literal, case-sensitive — the merge app matches on it), one EXCHANGE:TICKER per row after that. Save it on David's Mac at ~/Downloads/SBT_Latest/tvremix_sid_lorp_<same date>.csv using mcp__remote-devices__Control_your_Mac__osascript (load via ToolSearch "+remote-devices osascript"): a do shell script that runs mkdir -p ~/Downloads/SBT_Latest and writes the file by base64-decoding the content (base64-encode the CSV in Python first; never inline raw CSV text in the osascript string). Read it back with a second osascript call (head -3; wc -l) to confirm. If the Mac can't be reached, retry once; if it still fails, say so in the final reply (the .txt is still delivered here).
Do not run the merge app — just place the file where it expects it.

Keep the filenames as above (tvremix_sid_lorp_...) — the merge app and David's habits expect them.

Final reply, brief: SID long candidates checked → qualified, SID short candidates checked → qualified (name the qualifying SID tickers), LORP Trend and LORP Reversion counts, total unique count, and whether the CSV was written to ~/Downloads/SBT_Latest/.

Take no other action — no watchlist changes, no code or repo changes, no emails, no running the merge app.
