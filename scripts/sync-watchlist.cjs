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

// Watchlist section names to include in the morning brief.
// Uses case-insensitive partial matching — "BTW" matches "BTW LIST" etc.
// Update these if you rename sections in TradingView.
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
  await ensureWatchlistOpen(client);

  const raw = await evaluate(client, `
    (function() {
      // Find any rendered watchlist symbol element to get a fiber entry point
      var els = document.querySelectorAll('[data-symbol-full]');
      if (!els.length) return { error: 'No watchlist symbols visible — ensure the watchlist panel is open' };

      var el = els[0];
      var fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return { error: 'React fiber not accessible on watchlist element' };

      // Walk UP the fiber tree to find the component holding the full symbols array
      var node = el[fiberKey];
      for (var depth = 0; depth < 80; depth++) {
        try {
          var props = node.memoizedProps || {};
          if (Array.isArray(props.symbols) && props.symbols.length > 10) {
            var first = String(props.symbols[0] || '');
            if (first.startsWith('###') || first.includes(':')) {
              return { symbols: props.symbols, depth: depth };
            }
          }
        } catch(e) {}
        node = node.return;
        if (!node) break;
      }
      return { error: 'symbols prop not found in React fiber tree (walked 80 levels)' };
    })()
  `);

  if (!raw || raw.error) {
    throw new Error(raw?.error || 'Unknown error reading watchlist from React fiber');
  }

  // Parse flat array into sections map: { 'SECTION NAME': ['TICKER', ...] }
  const sections = {};
  let current = null;

  for (const entry of raw.symbols) {
    if (typeof entry !== 'string') continue;

    if (entry.startsWith('###')) {
      current = entry.replace('###', '').trim();
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

  // Match and collect symbols from requested sections
  const included = {};
  const unmatched = [];
  const allSymbols = new Set();

  for (const wanted of SECTIONS) {
    const matches = matchSection(wanted, sectionNames);
    if (matches.length === 0) {
      unmatched.push(wanted);
      log(`  ⚠️  Section '${wanted}' — no match found`);
      continue;
    }

    included[wanted] = [];
    for (const match of matches) {
      const raw = allSections[match] || [];
      const filtered = raw.filter(s => isValidTicker(s) && !isExcluded(s));
      const tickers = filtered.map(extractTicker);
      tickers.forEach(t => allSymbols.add(t));
      included[wanted].push(...tickers);
      log(`  '${wanted}' → matched '${match}': ${tickers.length} symbols (${raw.length - filtered.length} ASX excluded)`);
    }
  }

  if (unmatched.length > 0) {
    log(`  Sections not found: ${unmatched.join(', ')}`);
    log(`  Available: ${sectionNames.join(', ')}`);
  }

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
