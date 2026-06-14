#!/usr/bin/env node
/**
 * sync-watchlist.cjs
 *
 * Reads named watchlist sections from TradingView via CDP (React fiber),
 * filters to non-ASX symbols, merges and deduplicates, then writes to rules.json.
 *
 * Run before the morning brief to keep the watchlist in sync with TV screener results.
 *
 * Usage:
 *   node sync-watchlist.cjs               # sync and write rules.json
 *   node sync-watchlist.cjs --dry-run     # preview without writing
 *   node sync-watchlist.cjs --list        # show all current TV sections + counts
 */
'use strict';

const CDP      = require('chrome-remote-interface');
const fs       = require('fs');
const path     = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

// Canonical section names — NOT an allowlist. Every section on the watchlist is ingested;
// these are only used to normalise known section names so analyse-brief.cjs / the scans can
// look them up by exact string. Any section NOT listed here is still ingested, under its own
// name. Keep these matching the names analyse-brief.cjs expects (lorpScreenerSet, BTW, etc.).
const SECTIONS = [
  'LORP SCREENER',
  'LORP BRIEF',           // Carry-forward from prior LORP scans
  'SID SCREENER',
  'SID BRIEF',            // Carry-forward from prior SID scans
  'BTW',
  'PULLBACK SCREENER',
  'PULLBACK BRIEF',       // Carry-forward from prior Pullback scans
  'ADX BREAKOUT SCREENER',
  'ADX BREAKOUT BRIEF',   // Carry-forward from prior ADX Breakout scans
  'PREMARKET CHECKLIST',  // Contains SPY for regime gate
  'PRE MARKET CHECKLIST', // Alternative name for regime gate
];

// Exchange prefixes to EXCLUDE from the brief (ASX for now — remove when ASX support added)
const EXCLUDE_EXCHANGES = ['ASX'];

const CDP_PORT   = 9222;
const RULES_PATH = path.join(__dirname, '../rules.json');

// ─── Flags ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const LIST    = process.argv.includes('--list');

function log(msg) { process.stderr.write(`[sync-watchlist] ${msg}\n`); }
function die(msg) { log(`ERROR: ${msg}`); process.exit(1); }

// ─── CDP helpers ──────────────────────────────────────────────────────────────

async function findTVTarget() {
  const resp = await fetch(`http://localhost:${CDP_PORT}/json/list`);
  const targets = await resp.json();
  return targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
      || targets.find(t => t.type === 'page' && /tradingview/i.test(t.url))
      || null;
}

async function evaluate(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
}

// Evaluate an expression that resolves a Promise (e.g. fetch) and return its value.
async function evaluateAsync(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
}

// ─── Ensure watchlist panel is open ───────────────────────────────────────────

async function ensureWatchlistOpen(client) {
  const already = await evaluate(client, `
    !!document.querySelector('[data-symbol-full]')
  `);
  if (already) return;

  // Watchlist is in the RIGHT sidebar — try to open it
  await evaluate(client, `
    (function() {
      // Try right-sidebar watchlist tab/button selectors
      var selectors = [
        '[data-name="base-tabs-item"][data-value="list"]',
        '[data-name="watchlist"]',
        'button[aria-label*="atchlist"]',
        'button[aria-label*="Watch"]',
        '[class*="watchlistTab"]',
        '[data-value="watchlist"]',
      ];
      for (var i = 0; i < selectors.length; i++) {
        var btn = document.querySelector(selectors[i]);
        if (btn) { btn.click(); return 'clicked:' + selectors[i]; }
      }
      // Fallback: search all buttons/tabs in right sidebar area for "watchlist"
      var btns = document.querySelectorAll('button, [role="tab"]');
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].title || btns[i].getAttribute('aria-label') || btns[i].textContent || '').toLowerCase();
        if (t.includes('watchlist') || t.includes('watch list')) {
          btns[i].click(); return 'fallback:' + t.substring(0, 30);
        }
      }
      return 'not_found';
    })()
  `);

  // Wait for watchlist to render
  await new Promise(r => setTimeout(r, 2000));
}

// ─── Read full watchlist via React fiber ──────────────────────────────────────
// TradingView stores the full watchlist as a flat array in a React component's
// `symbols` prop. Section headers are prefixed with `###`.
// Format: ["###SECTION NAME", "EXCHANGE:TICKER", "EXCHANGE:TICKER", "###NEXT SECTION", ...]

async function readAllSections(client) {
  // Read the watchlist via TradingView's REST API rather than scraping the DOM.
  // The REST endpoint returns the full symbols array regardless of whether the
  // watchlist panel is open, collapsed, or scrolled — immune to the previous
  // "No watchlist symbols visible" failure when the panel wasn't rendered.
  // Retries a few times so a transient failure (page mid-load, auth cookie not yet
  // ready) doesn't abort the sync and fall back to a stale rules.json.
  // Target the main watchlist by NAME (default "Watchlist"), not lists[0], so a second
  // custom list (e.g. an imported "SBT_Merged_…") can't hijack the read. Order:
  // exact name match → list with most symbols → lists[0].
  const targetName = (process.env.TARGET_WATCHLIST_NAME || 'Watchlist').trim().toLowerCase();
  const READ_EXPR = `
    (async function() {
      try {
        var lists = await fetch('/api/v1/symbols_list/custom/', { credentials: 'include' }).then(r => r.json());
        if (!Array.isArray(lists) || lists.length === 0) return JSON.stringify({ error: 'No custom watchlists returned by REST API' });
        var pick = lists.find(l => (l.name || '').trim().toLowerCase() === ${JSON.stringify(targetName)});
        if (!pick) pick = lists.slice().sort((a, b) => (b.symbols ? b.symbols.length : 0) - (a.symbols ? a.symbols.length : 0))[0];
        var id = pick.id;
        var data = await fetch('/api/v1/symbols_list/custom/' + id + '/', { credentials: 'include' }).then(r => r.json());
        if (!data || !Array.isArray(data.symbols)) return JSON.stringify({ error: 'symbols_list response missing .symbols array' });
        return JSON.stringify({ symbols: data.symbols, listId: id, listName: pick.name });
      } catch (e) {
        return JSON.stringify({ error: 'REST read failed: ' + e.message });
      }
    })()
  `;

  let raw = null;
  let lastErr = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const rawJson = await evaluateAsync(client, READ_EXPR);
      const parsed = JSON.parse(rawJson);
      if (parsed && !parsed.error && Array.isArray(parsed.symbols) && parsed.symbols.length > 0) {
        raw = parsed;
        break;
      }
      lastErr = parsed?.error || 'empty symbols array';
    } catch (e) {
      lastErr = e.message;
    }
    if (attempt < 4) {
      log(`watchlist REST read attempt ${attempt}/4 failed (${lastErr}) — retrying in ${attempt * 2}s`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }

  if (!raw) throw new Error(`Could not read watchlist via REST API after 4 attempts: ${lastErr}`);

  // Parse flat array into sections map: { 'SECTION NAME': ['TICKER', ...] }
  // Section headers are "###<U+2064?>SECTION NAME" — strip ### and the hidden
  // U+2064 (INVISIBLE PLUS) char TradingView inserts, then trim.
  const sections = {};
  let current = null;

  for (const entry of raw.symbols) {
    if (typeof entry !== 'string') continue;

    if (entry.startsWith('###')) {
      current = entry.replace('###', '').replace(/⁤/g, '').trim();
      sections[current] = [];
    } else if (current) {
      sections[current].push(entry); // keep full "EXCHANGE:TICKER" for filtering
    }
  }

  return sections;
}

// ─── Ticker filtering ─────────────────────────────────────────────────────────

function extractTicker(fullSymbol) {
  // "NASDAQ:AAPL" → "AAPL", "NYSE:TSM" → "TSM"
  return fullSymbol.includes(':') ? fullSymbol.split(':')[1] : fullSymbol;
}

function isExcluded(fullSymbol) {
  const exchange = fullSymbol.includes(':') ? fullSymbol.split(':')[0] : '';
  return EXCLUDE_EXCHANGES.some(ex => exchange.toUpperCase() === ex.toUpperCase());
}

function isValidTicker(fullSymbol) {
  // Must look like a real symbol, not a blank/separator
  return typeof fullSymbol === 'string'
    && fullSymbol.length > 0
    && /^[A-Z0-9]+:[A-Z0-9.!]+$/i.test(fullSymbol);
}

// ─── Section matching ─────────────────────────────────────────────────────────

function matchSection(wanted, available) {
  const w = wanted.toLowerCase();
  // Exact match first
  const exact = available.find(k => k.toLowerCase() === w);
  if (exact) return [exact];
  // Partial match: wanted is contained in section name, or section name in wanted
  return available.filter(k => {
    const k2 = k.toLowerCase();
    return k2.includes(w) || w.includes(k2);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const target = await findTVTarget().catch(() => null);
  if (!target) die('TradingView not running or CDP not available on port ' + CDP_PORT);

  log(`Connected: ${target.url.slice(0, 60)}...`);

  const client = await CDP({ host: 'localhost', port: CDP_PORT, target: target.id });
  await client.Runtime.enable();

  let allSections;
  try {
    allSections = await readAllSections(client);
  } catch (e) {
    await client.close();
    die(e.message);
  }
  await client.close();

  const sectionNames = Object.keys(allSections);
  log(`Found ${sectionNames.length} sections in TradingView watchlist`);

  // --list mode: just show all sections and exit
  if (LIST) {
    console.log('\nAll TradingView watchlist sections:\n');
    sectionNames.forEach(name => {
      const syms = allSections[name];
      const usSyms = syms.filter(s => isValidTicker(s) && !isExcluded(s));
      const asxSyms = syms.filter(s => s.startsWith('ASX:'));
      console.log(`  [${name}]  total: ${syms.length}  US/non-ASX: ${usSyms.length}  ASX: ${asxSyms.length}`);
    });
    console.log('');
    process.exit(0);
  }

  // Ingest EVERY section on the watchlist — no allowlist. Sections whose names match a
  // known canonical name (the ones analyse-brief.cjs / the scans look up by exact string)
  // are normalised to that canonical name; every other section passes through under its own
  // name. Add or rename a section in TradingView and it flows through with no code change.
  const included = {};
  const allSymbols = new Set();

  // Canonical name for a raw TV section: exact (case-insensitive) match wins, then partial
  // (so "BTW LIST" still maps to "BTW"), else the section keeps its own raw name.
  const canonicalName = (rawName) => {
    const r = rawName.toLowerCase();
    const exact = SECTIONS.find(c => c.toLowerCase() === r);
    if (exact) return exact;
    const partial = SECTIONS.find(c => { const cl = c.toLowerCase(); return cl.includes(r) || r.includes(cl); });
    return partial || rawName;
  };

  for (const rawName of sectionNames) {
    const key = canonicalName(rawName);
    const raw = allSections[rawName] || [];
    const filtered = raw.filter(s => isValidTicker(s) && !isExcluded(s)).map(extractTicker);
    if (!included[key]) included[key] = [];
    for (const t of filtered) { included[key].push(t); allSymbols.add(t); }
    log(`  '${rawName}' → '${key}': ${filtered.length} symbols (${raw.length - filtered.length} ASX/invalid excluded)`);
  }
  // Dedup within each section (a ticker listed twice under one section name)
  for (const k of Object.keys(included)) included[k] = Array.from(new Set(included[k]));

  const sorted = Array.from(allSymbols).sort();
  log(`Total after merge + dedup: ${sorted.length} symbols`);

  if (sorted.length === 0) {
    die('No symbols found — check section names with --list');
  }

  if (DRY_RUN) {
    log('DRY RUN — rules.json not modified');
    console.log(JSON.stringify({ sections: included, total: sorted.length, symbols: sorted }, null, 2));
    process.exit(0);
  }

  // Update rules.json — save both flat watchlist AND per-section assignments
  if (!fs.existsSync(RULES_PATH)) die('rules.json not found at ' + RULES_PATH);
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const prev = (rules.watchlist || []).length;
  rules.watchlist = sorted;
  // Save section assignments so analyse-brief.cjs can split by source
  rules.watchlist_sections = included;
  fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2));

  log(`rules.json updated: ${prev} → ${sorted.length} symbols`);

  // Structured output for log
  console.log(JSON.stringify({
    success: true,
    sections: Object.fromEntries(Object.entries(included).map(([k, v]) => [k, v.length])),
    excluded_exchanges: EXCLUDE_EXCHANGES,
    prev_count: prev,
    new_count: sorted.length,
    synced_at: new Date().toISOString(),
  }));
}

main().catch(e => { log(`Fatal: ${e.message}`); process.exit(1); });
