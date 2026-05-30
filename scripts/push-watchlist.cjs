#!/usr/bin/env node
// push-watchlist.cjs — pushes BRIEF section updates into TradingView watchlist after morning brief
// Run after analyse-brief.cjs has generated the watchlist-updates sidecar JSON.
// Usage: node push-watchlist.cjs [path-to-watchlist-updates.json]

'use strict';

const CDP  = require('../node_modules/chrome-remote-interface');
const fs   = require('fs');
const path = require('path');

const CDP_PORT   = 9222;
const BRIEFS_DIR = path.join(process.env.HOME, '.tradingview-mcp', 'briefs');

// ── Resolve sidecar file ──────────────────────────────────────────
function resolveSidecar() {
  const arg = process.argv[2];
  if (arg) {
    if (!fs.existsSync(arg)) {
      process.stderr.write(`[push-watchlist] ERROR: sidecar file not found: ${arg}\n`);
      process.exit(1);
    }
    return arg;
  }
  // Auto-find today's sidecar
  const today = new Date().toISOString().split('T')[0];
  const todayFile = path.join(BRIEFS_DIR, `brief-${today}-watchlist-updates.json`);
  if (fs.existsSync(todayFile)) return todayFile;
  // Fallback: most recent sidecar in last 7 days
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    const f = path.join(BRIEFS_DIR, `brief-${d}-watchlist-updates.json`);
    if (fs.existsSync(f)) {
      process.stderr.write(`[push-watchlist] No today sidecar — using ${d}\n`);
      return f;
    }
  }
  process.stderr.write(`[push-watchlist] ERROR: no watchlist-updates sidecar found in last 7 days\n`);
  process.exit(1);
}

// ── Normalise a section header string for comparison ─────────────
// TradingView inserts U+2064 (INVISIBLE PLUS) after ### in every header.
// Comparison strips it and is case-insensitive so our section names match
// regardless of the hidden character or capitalisation used in the watchlist.
function normHeader(s) {
  return s.replace(/⁤/g, '').toLowerCase();
}

// ── Replace section contents in the flat symbols array ───────────
function replaceSectionInArray(symbols, sectionName, newTickers) {
  const targetNorm = normHeader(`###${sectionName}`);
  const startIdx = symbols.findIndex(s => normHeader(s) === targetNorm);
  if (startIdx === -1) {
    // Section not found — append using TV format: ###⁤SECTION NAME (uppercase)
    const header = `###⁤${sectionName.toUpperCase()}`;
    process.stderr.write(`[push-watchlist] Section "${sectionName}" not found — appending as "${header}"\n`);
    symbols.push(header, ...newTickers);
    return symbols;
  }
  // Find end of section (next ### entry or end of array)
  let endIdx = symbols.findIndex((s, i) => i > startIdx && s.startsWith('###'));
  if (endIdx === -1) endIdx = symbols.length;
  // Replace section contents (keep the original header as-is)
  symbols.splice(startIdx + 1, endIdx - startIdx - 1, ...newTickers);
  return symbols;
}

// ── Resolve bare ticker to EXCHANGE:TICKER form ───────────────────
// Searches the full current symbols array for a matching suffix (case-insensitive).
// Falls back to bare ticker if not found anywhere — TV will auto-resolve.
function resolveExchangePrefix(bareTicker, allSymbols) {
  const upper = bareTicker.toUpperCase();
  // Exact match first (in case it already has a prefix)
  if (allSymbols.includes(upper)) return upper;
  // Search for EXCHANGE:TICKER form
  for (const sym of allSymbols) {
    if (sym.startsWith('###')) continue;
    const colon = sym.indexOf(':');
    if (colon !== -1 && sym.slice(colon + 1).toUpperCase() === upper) {
      return sym; // return original casing from TV
    }
  }
  // Not found — return bare ticker (TV will attempt to resolve)
  return bareTicker;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const sidecarPath = resolveSidecar();
  process.stderr.write(`[push-watchlist] Reading sidecar: ${sidecarPath}\n`);

  let updates;
  try {
    updates = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`[push-watchlist] ERROR: failed to parse sidecar: ${e.message}\n`);
    process.exit(1);
  }

  const sections = updates.sections || {};
  process.stderr.write(`[push-watchlist] Date: ${updates.date}  Generated: ${updates.generated_at}\n`);
  for (const [name, tickers] of Object.entries(sections)) {
    process.stderr.write(`[push-watchlist]   ${name}: ${tickers.length} tickers\n`);
  }

  // ── Connect to CDP — try all chart pages until one has a watchlist ──
  const http = require('http');

  async function getCDPTargets() {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${CDP_PORT}/json`, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
  }

  // ── Resolve list ID via REST API ─────────────────────────────────
  // Use /api/v1/symbols_list/custom/ to list all user watchlists and take the first one.
  // Previous approach (walking React fiber from [data-symbol-full]) broke when all
  // watchlist sections are collapsed — no items render in the DOM so the selector finds nothing.
  const LIST_ID_EXPR = `
    fetch('/api/v1/symbols_list/custom/', { credentials: 'include' })
      .then(r => r.json())
      .then(lists => {
        if (!Array.isArray(lists) || lists.length === 0) return null;
        return String(lists[0].id);
      })
  `;

  let client;
  let listId;

  try {
    const targets = await getCDPTargets();
    const chartPages = targets.filter(t => t.type === 'page' && t.url && t.url.includes('tradingview.com/chart'));
    process.stderr.write(`[push-watchlist] Found ${chartPages.length} TradingView chart pages\n`);

    for (const target of chartPages) {
      let c;
      try {
        c = await CDP({ target: target.webSocketDebuggerUrl });
        const { Runtime: R } = c;
        await R.enable();
        const res = await R.evaluate({ expression: LIST_ID_EXPR, returnByValue: true, awaitPromise: true });
        const id = res?.result?.value;
        if (id) {
          process.stderr.write(`[push-watchlist] List ID ${id} found on ${target.url.split('/chart/')[1]?.split('/')[0] ?? target.url}\n`);
          client = c;
          listId = id;
          break;
        }
        await c.close();
      } catch (_) {
        try { await c?.close(); } catch (_2) {}
      }
    }
  } catch (e) {
    process.stderr.write(`[push-watchlist] ERROR: cannot enumerate CDP targets on port ${CDP_PORT}: ${e.message}\n`);
    process.exit(1);
  }

  if (!client || !listId) {
    process.stderr.write(`[push-watchlist] ERROR: could not resolve list ID from any chart page\n`);
    process.stderr.write(`[push-watchlist] Make sure TradingView is open and logged in\n`);
    process.exit(1);
  }

  const { Runtime } = client;

  try {
    process.stderr.write(`[push-watchlist] List ID: ${listId}\n`);

    // ── Read current symbols via TV REST API ──────────────────────
    process.stderr.write(`[push-watchlist] Fetching current symbols from /api/v1/symbols_list/custom/${listId}/\n`);
    const getResult = await Runtime.evaluate({
      expression: `
        fetch('/api/v1/symbols_list/custom/${listId}/', {
          credentials: 'include'
        }).then(r => r.json()).then(d => JSON.stringify(d))
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    if (getResult?.result?.type === 'undefined' || getResult?.result?.value == null) {
      process.stderr.write(`[push-watchlist] ERROR: REST GET returned no data\n`);
      process.exit(1);
    }

    let listData;
    try {
      listData = JSON.parse(getResult.result.value);
    } catch (e) {
      process.stderr.write(`[push-watchlist] ERROR: could not parse REST response: ${e.message}\n`);
      process.exit(1);
    }

    if (!Array.isArray(listData.symbols)) {
      process.stderr.write(`[push-watchlist] ERROR: symbols_list response missing .symbols array\n`);
      process.stderr.write(`[push-watchlist] Response keys: ${Object.keys(listData).join(', ')}\n`);
      process.exit(1);
    }

    const originalSymbols = listData.symbols;
    process.stderr.write(`[push-watchlist] Current watchlist: ${originalSymbols.length} entries\n`);

    // ── Step 1: Clear all Screener sections ───────────────────────
    // Screener tickers overlap with Brief Output tickers, so screeners must be
    // cleared first — otherwise replaceSectionInArray cannot write new Brief Output
    // tickers that already exist in a screener section.
    // NOTE: screeners will need to be reloaded from the TV Screener before rerunning.
    const SCREENER_SECTIONS = [
      'LORP SCREENER',
      'SID SCREENER',
      'ADX BREAKOUT SCREENER',
      'PULLBACK SCREENER',
    ];
    let updatedSymbols = [...originalSymbols];
    for (const sectionName of SCREENER_SECTIONS) {
      const before = updatedSymbols.length;
      updatedSymbols = replaceSectionInArray(updatedSymbols, sectionName, []);
      process.stderr.write(`[push-watchlist] Cleared "${sectionName}" (${before} → ${updatedSymbols.length} entries)\n`);
    }

    // ── Step 2: Write Brief Output section ───────────────────────
    const BRIEF_SECTIONS = ['Brief Output'];

    for (const sectionName of BRIEF_SECTIONS) {
      const bareTickers = sections[sectionName];
      if (!Array.isArray(bareTickers)) {
        process.stderr.write(`[push-watchlist] SKIP "${sectionName}": not in sidecar\n`);
        continue;
      }

      // Resolve exchange prefixes — match against full current list before mutating
      const resolvedTickers = bareTickers.map(t => resolveExchangePrefix(t, originalSymbols));

      const before = updatedSymbols.length;
      updatedSymbols = replaceSectionInArray(updatedSymbols, sectionName, resolvedTickers);
      const after = updatedSymbols.length;

      process.stderr.write(
        `[push-watchlist] "${sectionName}": ${bareTickers.length} tickers → ` +
        `resolved: ${resolvedTickers.join(', ') || '(empty)'} ` +
        `(list size: ${before} → ${after})\n`
      );
    }

    // ── POST full updated array back ──────────────────────────────
    process.stderr.write(`[push-watchlist] POSTing ${updatedSymbols.length}-entry list back to TV...\n`);
    const bodyJson = JSON.stringify(updatedSymbols);

    const replaceResult = await Runtime.evaluate({
      expression: `
        fetch('/api/v1/symbols_list/custom/${listId}/replace/?unsafe=true', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: ${JSON.stringify(bodyJson)}
        }).then(r => r.status + ' ' + r.statusText)
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const httpStatus = replaceResult?.result?.value;
    process.stderr.write(`[push-watchlist] POST response: ${httpStatus}\n`);

    if (httpStatus && httpStatus.startsWith('2')) {
      process.stdout.write(`[push-watchlist] Watchlist updated successfully (${httpStatus})\n`);
    } else {
      process.stderr.write(`[push-watchlist] WARNING: unexpected HTTP status: ${httpStatus}\n`);
      process.exit(1);
    }

  } finally {
    await client.close();
  }
}

main().catch(e => {
  process.stderr.write(`[push-watchlist] FATAL: ${e.message}\n${e.stack}\n`);
  process.exit(1);
});
