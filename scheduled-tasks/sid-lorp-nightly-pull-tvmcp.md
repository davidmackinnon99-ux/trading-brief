This is a scheduled task. You have no memory of any prior conversation — treat this message as the complete brief.

Goal: build tonight's SID/LORP ticker list from four screens, merge and dedupe them, and deliver it in two forms: (1) a .txt file in this session, and (2) a CSV dropped into the inbox folder David's "SBT Nightly Merge" macOS app watches, so his SBT scan exports and this list are folded into one merge run.

Background (28 Oct 2026): these four screens used to be dashboards on tvremix.xyz, read through a signed-in browser. tvremix is shutting down and its sign-in kept expiring, so the screens were rebuilt on the official TradingView MCP connector ("TV MCP"). On 28 Oct the rebuilt screens matched the tvremix boards on 120 of 125 names. No browser and no sign-in are needed any more.

DATA — use the TV MCP connector only (tool names start mcp__TV_MCP__). Do NOT use any mcp__TradingView__ tool (that is the retiring tvremix connector) and do not open any browser. Load the tool via ToolSearch: "select:mcp__TV_MCP__mcp-tv-run-screener".

Run mcp__TV_MCP__mcp-tv-run-screener four times, each with market "america", symbol_types ["stock","dr"], limit 800:

1. SID OB — filters {"RSI":[60,70], "market_cap_basic":[1000000000,300000000000], "close":[10,null], "average_volume_10d_calc":[300000,null]}; sort_by "RSI", sort_order "desc"; columns ["name","RSI","MACD.macd","MACD.signal","type","subtype"].
2. SID OS — filters {"RSI":[30,40], "market_cap_basic":[1000000000,300000000000], "close":[10,null], "average_volume_10d_calc":[300000,null]}; sort_by "RSI", sort_order "desc"; columns ["name","RSI","MACD.macd","MACD.signal","type","subtype"].
3. LORP Trend — filters {"RSI":[55,80], "market_cap_basic":[10000000000,null], "close":[10,null], "average_volume_10d_calc":[300000,null]}; sort_by "change", sort_order "desc"; columns ["name","RSI","MACD.macd","MACD.signal","EMA21","close","change","type","subtype"].
4. LORP Reversion — filters {"RSI":[30,45], "market_cap_basic":[1000000000,300000000000], "close":[10,null], "average_volume_10d_calc":[300000,null]}; sort_by "RSI", sort_order "asc"; columns ["name","RSI","MACD.macd","MACD.signal","type","subtype"].

Each result is large and will be saved to a file under ~/.claude/projects/ (the tool tells you the path). Process those files in Python — never retype rows. The JSON is {"data":{"rows":[...],"totalCount":n}}; each row has "symbol" (EXCHANGE:TICKER), "subtype", "MACD.macd", "MACD.signal" and, for LORP Trend, "close" and "EMA21". If a call fails, retry it once after ~20 seconds.

For each screen, walk its rows in the order returned and keep a row only if ALL of these hold:
- the symbol's exchange prefix is NYSE, NASDAQ or AMEX;
- "subtype" is "common", "" or missing (this drops preferred and unit share classes, keeps ADRs);
- MACD.macd and MACD.signal are both numbers, and MACD.macd > MACD.signal for SID OB and LORP Trend, or MACD.macd < MACD.signal for SID OS and LORP Reversion;
- LORP Trend only: close and EMA21 are both numbers and close > EMA21.
Stop once you have kept 25 rows for SID OB, 50 for SID OS, 25 for LORP Trend and 25 for LORP Reversion (fewer is fine if the screen runs out).

Merge: SID OB, then SID OS, then LORP Trend, then LORP Reversion, removing duplicates (keep each symbol's first occurrence). The values are already EXCHANGE:TICKER — no symbol resolution step is needed.

FAILURE CHECK: if TV MCP is unavailable, or all four screens yield zero symbols, do not write any files. Send ONE PushNotification: "SID/LORP pull (TV MCP) failed — <short reason>. No list tonight." Your final reply is that same line. Stop.

OUTPUT (do both):
1. Write the merged list to tvremix_sid_lorp_<today's date, YYYY-MM-DD>.txt, one EXCHANGE:TICKER per line, and deliver it with SendUserFile (status "proactive", display "attach").
2. Write the same list as a CSV with one column, header row exactly "tradingview_symbol" (this literal, case-sensitive string — the merge app matches on it), one EXCHANGE:TICKER per row after that. Save it on David's Mac at ~/Downloads/SBT_Latest/tvremix_sid_lorp_<same date>.csv using mcp__remote-devices__Control_your_Mac__osascript (load via ToolSearch "+remote-devices osascript"): a do shell script that runs mkdir -p ~/Downloads/SBT_Latest and then writes the file by base64-decoding the content (base64-encode the CSV in Python first; do NOT inline raw CSV text in the osascript string). Then read the file back with a second osascript call (head -3 and wc -l) to confirm it was written. If the Mac can't be reached, retry once; if it still fails, say so in the final reply (the .txt in this session is still delivered).
Do not run the merge app yourself — just place the file where it expects to find it.

Keep the filenames as above (tvremix_sid_lorp_...) — the merge app and David's habits expect them.

Final reply, brief: how many symbols each of the four screens contributed, the total unique count, and whether the CSV was written to ~/Downloads/SBT_Latest/.

Take no other action — no watchlist changes, no code or repo changes, no emails, no running the merge app.
