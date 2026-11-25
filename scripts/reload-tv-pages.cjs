#!/usr/bin/env node
// Reload every open TradingView chart page so the watchlist panel shows the list the brief
// just saved (the desktop app keeps a cached copy and can show stale sections for a while).
// David, 26 Nov 2026. Read-only apart from the reload; never edits the watchlist.
'use strict';
const CDP = require('chrome-remote-interface');
const http = require('http');
const PORT = process.env.CDP_PORT || 9222;
http.get(`http://localhost:${PORT}/json`, (res) => {
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', async () => {
    let pages = [];
    try { pages = JSON.parse(d).filter((t) => t.type === 'page' && /tradingview\.com\/chart/.test(t.url || '')); }
    catch (e) { console.error(`[reload-tv] could not read CDP targets: ${e.message}`); process.exit(1); }
    let ok = 0;
    for (const t of pages) {
      try {
        const c = await CDP({ target: t.webSocketDebuggerUrl });
        await c.Page.enable();
        await c.Page.reload({ ignoreCache: false });
        await c.close();
        ok++;
      } catch (e) { console.error(`[reload-tv] reload failed for ${t.url}: ${e.message}`); }
    }
    console.error(`[reload-tv] reloaded ${ok}/${pages.length} TradingView chart pages`);
  });
}).on('error', (e) => { console.error(`[reload-tv] CDP not reachable on ${PORT}: ${e.message}`); process.exit(1); });
