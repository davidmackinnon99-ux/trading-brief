#!/usr/bin/env node
/**
 * LORP/SID/ADX Breakout/Pullback Morning Brief Analyser
 * Reads a brief JSON (from `tv brief`) and produces session bias output
 * aligned with Mac Automator confluence checkers:
 *   - SID Confluence Checker v2.9
 *   - LORP Confluence Checker v3.5
 *   - ADX Breakout Confluence Checker v1.0
 *   - Pullback Confluence Checker v1.1
 *
 * ── SID (OB/OS Bounce strategy) ─────────────────────────────────
 * NOTE: SID runs on its OWN chart layout — NOT the LORP chart.
 * This script reads the LORP chart only. SID signals are always null here.
 * Run the separate SID scan tool for SID OB/OS signals.
 *
 * ── LORP (trend-following pullback, Long-only daily) ─────────────
 * Signal: confirmed by Lorentzian Classification (not available in data window)
 * Available from data window (6 of 14 v3.5 factors):
 *   ✅ Price vs EMA50 (MA#1)
 *   ✅ Price vs SMA200 (MA#2) + EMA50 > SMA200
 *   ✅ MACD0 (MACD vs Signal) — VALIDATED entry gate (flag only); 26-trade study: 0/17 winners MACD<Sig, 4/9 losers did
 *   ✅ Aroon (BigBeluga) > 0 — context only; validated NOT a discriminator, kept for visual trend read
 *   ✅ Volume Delta direction
 *   ✅ RVOL value (⚠️ no 5-bar peak history — declining check needs CSV)
 *   ❌ EMA8/EMA20 stack — not in data window
 *   ❌ %B above 0.5 — BB not in data window
 *   ❌ WRB prior 5 bars — not in data window
 *   ✅ Pocket Pivot — available (added to LORP layout May 2026)
 *   ❌ Weekly RSI/MACD direction — needs OHLCV calc
 *   ❌ Daily RSI Divergence — needs OHLCV calc
 *   ❌ HTF Weekly Pattern — needs OHLCV calc
 *
 * ── ADX BREAKOUT (Rob Booker ADX Breakout + Quality Volume Breakout) ──
 * COILING SCREEN — scanned from dedicated ADX Breakout layout page (6hvBVx9e)
 * Indicator hint: "Rob Booker - ADX Breakout DM Final"
 * TV Screener pre-filters ADX 15–18 · BBWP is the primary brief filter:
 *   ✅ BBWP ≤ 5  → ⚡ COILING section (bandwidth at multi-year low = impending move)
 *   ✅ BBWP ≥ 98 → ⚠️ EXTENDED section (bandwidth at multi-year high = caution)
 *   ✅ Basis (SMA20) — price vs SMA20 direction context (↑/↓)
 *   ✅ Booker Quality Up/Down — 🔔 BQ signal on latest bar
 *   ❌ ADX direction (rising vs prior bar) — verify on chart
 *   ❌ Breakout direction (close vs box) — verify on chart
 *
 * ── PULLBACK (long-only trend pullback) ──────────────────────────
 * Entry trigger: Pullback=1 OR Breakout=1 from ADX + EMA21 Trend Setup (Booker Method)
 * MA filtering handled upstream by TV Screener (PULLBACK SCREENER section)
 *   ✅ Pullback / Breakout signal — from indicator data window
 *   ✅ RVOL — available
 *   ✅ ATR% — available
 *   ✅ Volume Delta — available (reference)
 *   ✅ GP Zone — available (reference)
 */

const fs   = require('fs');
const path = require('path');

// Editable brief reminders: edit reminders/sid.md / lorp.md. Each non-comment line = one reminder;
// prefix a line with # to turn just that one off. <!-- --> blocks are ignored.
function readReminders(name) {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'reminders', name + '.md'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .split('\n').map(l => l.trim())
      .filter(l => l.length && !l.startsWith('#'));
  } catch { return []; }
}

// ── Per-ticker factor scores for the brief tables ─────────────────────────────
// SID: direction-aware. Shorts carry heavy DI/ADX gates — a fail there appends ⛔.
function sidScore(r) {
  const macd0  = (r.macd != null && r.macdSig != null) ? (r.macd - r.macdSig) : null;
  const spread = (r.diPlus != null && r.diMinus != null) ? (r.diPlus - r.diMinus) : null;
  const gatr   = r.gatrRatio;
  if (r.isLongPass) {
    const f = [ true,                                        // RSI oversold & rising = the long signal itself
                macd0 != null && macd0 >= 0,                 // MACD at/above signal
                gatr != null && gatr >= 2.0,                 // Gap/ATR stop room
                r.wrsi != null && r.wrsi <= 50 ];            // weekly RSI agrees
    return `${f.filter(Boolean).length}/4`;
  }
  const fDI = spread != null && spread < 20;                 // heavy
  const fADX = r.adx != null && !(r.adx >= 40 && r.adx < 50);// heavy
  const fGatr = gatr != null && gatr >= 2.0;
  // MACD0 level is NOT scored for shorts: an OB-bounce short is ~always above signal (99% in the
  // data), so the value doesn't discriminate. The MACD *turn* is the entry trigger; the real gate
  // is trend-strength (DI spread / ADX).
  const pass = [fDI, fADX, fGatr].filter(Boolean).length;
  return `${pass}/3${(!fDI || !fADX) ? ' ⛔' : ''}`;
}
// LORP score — REBUILT 13 Jul 2026 from an outcome test on 670 simulated LORP trades
// (38 tickers, 1.5-ATR trail) rather than inherited assumptions. Factors kept only if their
// edge SURVIVED outlier removal (drop-top-5) and had a consistent median:
//   Buy VD > 0            mean +1.22  median +0.52  drop5 +1.31  (p=0.070, robust)
//   Aroon > 0             mean +0.46  median +0.57  drop5 +1.07  (p=0.243, weak but consistent)
//   RVOL declining 5b     mean +1.00  median +0.15  drop5 +1.12  (p=0.045, the only significant one)
//     ^ NOT SCORED YET: the scan captures only current-bar RVOL (no 5-bar history).
//       Fix = plot a "RVOL Declining" boolean on the RVOL Pine indicator so the scan reads it.
// DROPPED (no discriminating power / negative):
//   MACD > Signal  — true at 80% of LC Buys (near-universal, can't discriminate). Its apparent
//                    negative edge was outlier-driven (p=0.066, collapsed on drop-top-5) — so it
//                    is neither harmful nor useful. Remains a precondition, not a scored factor.
//   MACD > 0       — true at 94% of LC Buys. Same story.
//   %B > 0.5       — true at ~100%. No variation.
//   BB expanding   — NEGATIVE (+0.05% expanding vs +0.93% contracting). Edge is in the coil, not
//                    the expansion. Do not add as a positive factor.
// Small edges on a simplified sim — triage aid, not a strong filter.
// LORP score — WITHDRAWN 13 Jul 2026. Every factor tested on 128 REAL adapter trades
// (5 tickers, TradingView List-of-Trades exports w/ real MFE/MAE) failed:
//   ADX 25-30 / ADX>=25 : aggregate lift +15.9pp was ONE TICKER (TGT 57.9%). AMD and CYRX
//                         were WORSE with ADX>=25. Unproven — check the adapter's own
//                         "Sortino ADX<25 / >=25" table rows per ticker instead.
//   Buy VD > 0          : +1.6pp = nothing. Flips day to day. Context only, not a score.
//   Aroon > 0           : +1.2pp = nothing — AND mis-specified: Aroon is a CONTRADICTION
//                         check (warn when it disagrees), never a point-earning factor.
//   RVOL declining      : REVERSED on real trades (-11.3pp).
// The real, verified finding is the EXIT, not entry filters: winners reach a median
// +11.7% MFE and keep only +4.65% (~40% capture); losers reach +2.9% before dying.
// A/B trailAtrMult and useBreakeven in the adapter — do not triage on the factors above.
// Rebuild this only after the full LORP watchlist trade lists are exported and tested.
function lorpScore(r) {
  return '—';   // no score: no factor has survived testing on real trades
}

// ── Persistent LORP Watchlist ─────────────────────────────────────
// Tracks LORP Buy VD tickers across brief runs so they stay visible
// through the pullback phase even after dropping out of TV Screener.
const LORP_WATCHLIST_PATH = path.join(
  process.env.HOME,
  'Library', 'Mobile Documents', 'com~apple~CloudDocs',
  'Working Files', 'Trading', 'MCP', 'lorp_watchlist.json'
);

function loadLorpWatchlist() {
  try {
    if (fs.existsSync(LORP_WATCHLIST_PATH))
      return JSON.parse(fs.readFileSync(LORP_WATCHLIST_PATH, 'utf8'));
  } catch (e) {
    process.stderr.write(`[watchlist] Load failed: ${e.message}\n`);
  }
  return {};
}

function saveLorpWatchlist(wl) {
  try {
    fs.writeFileSync(LORP_WATCHLIST_PATH, JSON.stringify(wl, null, 2), 'utf8');
    process.stderr.write(`[watchlist] Saved ${Object.keys(wl).length} entries\n`);
  } catch (e) {
    process.stderr.write(`[watchlist] Save failed: ${e.message}\n`);
  }
}

// Count weekdays Mon–Fri between two ISO date strings (proxy for trading bars).
// The day after fromDate is bar 1 — so countTradingDays(D, D) === 0.
function countTradingDays(fromDateStr, toDateStr) {
  const from = new Date(fromDateStr + 'T00:00:00');
  const to   = new Date(toDateStr   + 'T00:00:00');
  if (from >= to) return 0;
  let count = 0;
  const cur = new Date(from);
  cur.setDate(cur.getDate() + 1);
  while (cur <= to) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Strip exchange prefix: "NASDAQ:AAPL" → "AAPL"
function bareSym(sym) { return sym.includes(':') ? sym.split(':')[1] : sym; }

// ── Sector/Industry support tagging (David, 13 Sep 2026) ──────────────────
// Compares each ticker's own sector against live sector-ETF-vs-SPY rotation to tag
// every LORP/SID row Supported/Neutral/Unsupported for its signal direction. Two
// best-effort inputs, neither of which can ever crash the brief on failure:
//   1. sector-map.json (repo root) - manually-curated ticker -> sector/industry,
//      built from stockanalysis.com. Ticker missing here -> tag omitted ('n/a'),
//      never guessed. Add entries as new tickers show up.
//   2. brief-<date>-sectors.json (produced by morning-brief.sh's SECTOR ETF ROTATION
//      scan) - today's % change for SPY + the 11 SPDR sector ETFs over the same
//      lookback window, via the same tv symbol/ohlcv mechanism used everywhere else.
//      Missing/partial file -> tag omitted, brief still runs.
const normalizeSectorName = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
function loadJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

// ── Sector/Industry support tagging — REBUILT 15 Sep 2026 ─────────────────
// Was a hand-maintained ticker->sector JSON map added 13 Sep 2026; David flagged
// that this can never keep up with 5000+ tickers. Replaced with an auto-populated
// cache: sector-map.json now holds whatever TradingView's public scanner API
// (scanner.tradingview.com/america/scan — no login/auth, same endpoint the free
// web screener uses) has already told us, and any ticker missing from it is
// fetched live (one batched request for the whole rules.json watchlist) and
// written back to the cache. Nothing to hand-edit; safe to delete the cache file
// entirely, it just refills on the next run. Network failure (offline, TV
// endpoint down/rate-limited) never crashes the brief — affected tickers simply
// show 'n/a', same as a cache miss always has.
//
// TradingView's own "sector" field uses its own ~20-bucket taxonomy (e.g.
// "Technology Services", "Producer Manufacturing"), not the 11 GICS/SPDR sectors
// the ETF-rotation scan (sectors.json) is keyed on. TV_SECTOR_TO_ETF below is the
// crosswalk between the two. It's a standard, documented mapping (not a
// per-ticker guess) — a few TV buckets genuinely straddle more than one GICS
// sector in reality (Retail Trade, {Commercial,Distribution,Industrial} Services)
// and are mapped to their single most common case, so treat Supported/Unsupported
// tags for tickers in those buckets as slightly less precise than the rest.
const TV_SECTOR_TO_ETF = {
  'commercial services': 'XLI',
  'communications': 'XLC',
  'consumer durables': 'XLY',
  'consumer non-durables': 'XLP',
  'consumer services': 'XLY',
  'distribution services': 'XLI',
  'electronic technology': 'XLK',
  'energy minerals': 'XLE',
  'finance': 'XLF',
  'health services': 'XLV',
  'health technology': 'XLV',
  'industrial services': 'XLI',
  'non-energy minerals': 'XLB',
  'process industries': 'XLB',
  'producer manufacturing': 'XLI',
  'retail trade': 'XLY',
  'technology services': 'XLK',
  'transportation': 'XLI',
  'utilities': 'XLU',
  'real estate': 'XLRE',
  // 'government' and 'miscellaneous' intentionally left unmapped — no sane ETF
  // equivalent; those tickers just show 'n/a'.
};

const SECTOR_MAP_PATH = path.join(__dirname, '..', 'sector-map.json');
const RULES_PATH       = path.join(__dirname, '..', 'rules.json');

function loadSectorCache() {
  const raw = loadJsonSafe(SECTOR_MAP_PATH) || {};
  const out = {};
  for (const [sym, info] of Object.entries(raw)) {
    if (sym.startsWith('_')) continue;
    out[sym] = info;
  }
  return out;
}

function saveSectorCache(map) {
  try {
    const withComment = {
      _comment: "AUTO-POPULATED CACHE — do not hand-edit. ticker -> {sector, industry, etf} " +
        "fetched from TradingView's public scanner API (scanner.tradingview.com/america/scan). " +
        "Any ticker missing here is fetched automatically on the next brief run. Safe to delete " +
        "this whole file; it rebuilds itself.",
      ...map,
    };
    fs.writeFileSync(SECTOR_MAP_PATH, JSON.stringify(withComment, null, 2), 'utf8');
  } catch (e) {
    process.stderr.write(`[sector] cache save failed: ${e.message}\n`);
  }
}

// Fetch sector/industry for whatever tickers aren't already cached, in ONE
// batched request. Best-effort only — any failure leaves those tickers as 'n/a'
// and never throws.
function fetchMissingSectors(tickers, cache) {
  const missing = [...new Set(tickers.map(bareSym))].filter(t => !cache[t]);
  if (!missing.length) return cache;
  try {
    // "filter: name in_range" (NOT "symbols.tickers") -- this whole pipeline only
    // ever carries BARE tickers (rules.json has no exchange prefix anywhere), and
    // the tickers-list form requires EXCHANGE:TICKER, silently returning zero
    // matches for bare input. The name filter matches on ticker text directly and
    // resolves the exchange for us as a side effect (unused here, but free).
    const body = JSON.stringify({
      filter: [{ left: 'name', operation: 'in_range', right: missing }],
      columns: ['name', 'sector', 'industry'],
    });
    const res = require('child_process').execFileSync('curl', [
      '-s', '--max-time', '20',
      '-X', 'POST', 'https://scanner.tradingview.com/america/scan',
      '-H', 'Content-Type: application/json',
      '-d', body,
    ], { encoding: 'utf8' });
    const parsed = JSON.parse(res);
    let found = 0;
    for (const row of (parsed.data || [])) {
      const [ticker, sector, industry] = row.d || [];
      if (!ticker) continue;
      const etf = TV_SECTOR_TO_ETF[normalizeSectorName(sector)] || null;
      cache[ticker] = { sector: sector || null, industry: industry || null, etf, fetched: localDateStr() };
      found++;
    }
    process.stderr.write(`[sector] fetched ${found}/${missing.length} new ticker(s) from TradingView scanner\n`);
    saveSectorCache(cache);
  } catch (e) {
    process.stderr.write(`[sector] live fetch failed (${e.message}) — ${missing.length} ticker(s) will show 'n/a' this run\n`);
  }
  return cache;
}

// rules.json's watchlist is BARE tickers (no exchange prefix) -- no good for the
// scanner API, which needs EXCHANGE:TICKER. Just load the cache here; the actual
// fetch happens below once `brief`/`sidBrief` are loaded and we have real
// fully-qualified symbols from the scan results themselves.
let sectorMap = loadSectorCache();

// SECTOR_REL_THRESHOLD: how far a sector ETF must diverge from SPY (percentage
// points, over the scan's lookback window) before it counts as actually rotating
// rather than just noise. Starting value -- tune once this has run for a while.
const SECTOR_REL_THRESHOLD = 0.3;
let sectorEtfData = null; // populated below once sectorsBriefFile is resolved
function sectorRelPct(etf) {
  if (!sectorEtfData || !etf) return null;
  const etfPct = sectorEtfData.etfs ? sectorEtfData.etfs[etf] : null;
  const spyPct = sectorEtfData.spy_change_pct;
  if (etfPct == null || spyPct == null) return null;
  return etfPct - spyPct;
}
function sectorSupportTag(bareSymbol, direction) {
  if (!direction) return null;
  const info = sectorMap[bareSymbol];
  if (!info || !info.etf) return null;
  const rel = sectorRelPct(info.etf);
  if (rel == null) return null;
  if (direction === 'long')  return rel >  SECTOR_REL_THRESHOLD ? 'Supported' : rel < -SECTOR_REL_THRESHOLD ? 'Unsupported' : 'Neutral';
  if (direction === 'short') return rel < -SECTOR_REL_THRESHOLD ? 'Supported' : rel >  SECTOR_REL_THRESHOLD ? 'Unsupported' : 'Neutral';
  return null;
}
function sectorTagDisplay(bareSymbol, direction) {
  const tag = sectorSupportTag(bareSymbol, direction);
  return tag === 'Supported' ? '🟢 Supported' : tag === 'Unsupported' ? '🔴 Unsupported' : tag === 'Neutral' ? '⚪ Neutral' : 'n/a';
}
// David (22 Sep 2026): the existing "Sector" column was actually the rotation
// verdict (Supported/Neutral/Unsupported), not the ticker's actual sector name —
// renamed that column to "Sector Support" and added this to show the real sector
// name TradingView returned (already cached in sector-map.json for the ETF
// lookup, just never surfaced in the table before).
function sectorNameDisplay(bareSymbol) {
  const info = sectorMap[bareSymbol];
  return (info && info.sector) ? info.sector : 'n/a';
}

// David (17 Sep 2026): ~30% of a typical brief's tickers (15/51 on 16 Sep, 13/40 on
// 17 Sep) were closed-end funds/trusts/ETFs, not real operating-company equities --
// TradingView's scanner tags these sector 'Miscellaneous' (which is exactly why they
// showed Sector 'n/a': no SPDR ETF maps to 'Miscellaneous', see TV_SECTOR_TO_ETF above).
// LORP/SID aren't built to trade funds (no earnings cycle, index-tracking price action),
// so exclude them at the candidate-list level rather than just at sector-tag display --
// covers every downstream table (Screener/Watch List/Fired-entry/Long/Short) from one
// place. Cache miss (ticker not yet fetched) defaults to NOT excluded -- same
// fail-open behaviour as the existing 'n/a' sector-tag fallback.
function isFundOrTrust(sym) {
  const info = sectorMap[bareSym(sym)];
  return !!(info && info.sector === 'Miscellaneous');
}

// ── Flags ────────────────────────────────────────────────────────
// --debug : dump all raw study names + value keys for first symbol, then exit
// --keys  : alias for --debug
const DEBUG = process.argv.includes('--debug') || process.argv.includes('--keys');

// ── Load brief files ─────────────────────────────────────────────
// First non-flag arg = LORP JSON, second = SID JSON
const briefsDir = path.join(process.env.HOME, '.tradingview-mcp', 'briefs');
const nonFlagArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
let briefFile    = nonFlagArgs[0];
let sidBriefFile = nonFlagArgs[1];

// Local-date string (YYYY-MM-DD) — brief files are named with local date by
// morning-brief.sh (date +%Y-%m-%d). Using toISOString() here would give the UTC
// date, which in the morning (AEST) is still the previous day → reads stale files.
function localDateStr(dt = new Date()) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

if (!briefFile) {
  const today = localDateStr();
  briefFile = path.join(briefsDir, `brief-${today}-lorp.json`);
  if (!fs.existsSync(briefFile)) {
    // Fallback to legacy single-file format
    briefFile = path.join(briefsDir, `brief-${today}.json`);
  }
  if (!fs.existsSync(briefFile)) {
    const yesterday = localDateStr(new Date(Date.now() - 86400000));
    const yFile = path.join(briefsDir, `brief-${yesterday}-lorp.json`);
    if (fs.existsSync(yFile)) {
      briefFile = yFile;
      console.log(`(No brief for today — using ${yesterday})\n`);
    } else {
      console.error(`No brief found. Run: bash scripts/morning-brief.sh`);
      process.exit(1);
    }
  }
}

// Auto-find SID brief if not specified
if (!sidBriefFile) {
  const dateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const candidate = path.join(briefsDir, `brief-${dateMatch[1]}-sid.json`);
    if (fs.existsSync(candidate)) sidBriefFile = candidate;
  }
}

// Auto-find REGIME brief if not specified
let regimeBriefFile = nonFlagArgs[2];
if (!regimeBriefFile) {
  const dateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const candidate = path.join(briefsDir, `brief-${dateMatch[1]}-regime.json`);
    if (fs.existsSync(candidate)) regimeBriefFile = candidate;
  }
}

// Auto-find PULLBACK brief if not specified
let pullbackBriefFile = nonFlagArgs[3];
if (!pullbackBriefFile) {
  const dateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const candidate = path.join(briefsDir, `brief-${dateMatch[1]}-pullback.json`);
    if (fs.existsSync(candidate)) pullbackBriefFile = candidate;
  }
}

// Auto-find ADX BREAKOUT brief if not specified
let adxBriefFile = nonFlagArgs[4];
if (!adxBriefFile) {
  const dateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const candidate = path.join(briefsDir, `brief-${dateMatch[1]}-adx.json`);
    if (fs.existsSync(candidate)) adxBriefFile = candidate;
  }
}

// Sector ETF rotation file (David, 13 Sep 2026 sector/industry support feature) —
// produced by morning-brief.sh's SECTOR ETF ROTATION scan. Slot 5, after the two
// retired-but-still-parsed pullback/adx slots, so old invocations without it just
// keep working (sectorEtfData stays null -> tags show 'n/a', nothing else changes).
let sectorsBriefFile = nonFlagArgs[5];
if (!sectorsBriefFile) {
  const dateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const candidate = path.join(briefsDir, `brief-${dateMatch[1]}-sectors.json`);
    if (fs.existsSync(candidate)) sectorsBriefFile = candidate;
  }
}
if (sectorsBriefFile && fs.existsSync(sectorsBriefFile)) {
  sectorEtfData = loadJsonSafe(sectorsBriefFile);
  if (!sectorEtfData) process.stderr.write(`[sector] failed to parse ${sectorsBriefFile} — sector tags will show 'n/a'\n`);
} else {
  process.stderr.write(`[sector] no sectors file found for today — sector tags will show 'n/a'\n`);
}

// Safe JSON loader — extracts the FIRST complete JSON object from the file.
// Handles the case where a double-run writes two concatenated JSON objects.
function loadFirstJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^[^{]*/, '');
  try {
    return JSON.parse(raw);
  } catch(e) {
    // Find the end of the first JSON object by counting braces
    let depth = 0, i = 0, inStr = false, escape = false;
    for (; i < raw.length; i++) {
      const c = raw[i];
      if (escape)         { escape = false; continue; }
      if (c === '\\')     { escape = true;  continue; }
      if (c === '"')      { inStr = !inStr; continue; }
      if (inStr)          { continue; }
      if (c === '{')      { depth++; }
      else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    process.stderr.write(`[warn] Brief file appears corrupted (double-run?) — extracting first JSON object (${i} chars)\n`);
    return JSON.parse(raw.slice(0, i));
  }
}
const brief = loadFirstJSON(briefFile);

// Load SID brief if available
let sidBrief = null;
if (sidBriefFile && fs.existsSync(sidBriefFile)) {
  try {
    sidBrief = loadFirstJSON(sidBriefFile);
  } catch(e) {
    process.stderr.write(`[warn] Could not load SID brief: ${e.message}\n`);
  }
}

// Populate the sector cache for today's actual universe -- the fully-qualified
// EXCHANGE:TICKER symbols living in the scan results themselves (rules.json's
// watchlist has no exchange prefix, so it can't be used for this lookup).
{
  const todaysSymbols = [];
  for (const s of (brief.symbols_scanned || [])) if (s && s.symbol) todaysSymbols.push(s.symbol);
  for (const s of ((sidBrief && sidBrief.symbols_scanned) || [])) if (s && s.symbol) todaysSymbols.push(s.symbol);
  if (todaysSymbols.length) sectorMap = fetchMissingSectors(todaysSymbols, sectorMap);
}

// SPY Regime Gate removed 28 Aug 2026 (David) — "still not correct, reading the same
// as yesterday, & I always check first anyway." Never got the field mapping reliably
// right across two attempts (EMA21 Trend Setup, then Regime Filter [BigBeluga]); not
// worth further debugging time. Full deletion, not wrapped — this one never worked.

// Load previous brief for ADX slope (↑/↓ direction arrow in ADX Breakout section)
// Looks back up to 7 calendar days for the most recent prior main brief file.
const prevAdxMap    = {};
const prevDiPlusMap  = {};
const prevDiMinusMap = {};
const prevSigMap     = {};   // ticker -> Set of signal markers fired in the most recent prior brief (freshness de-dup)
{
  const dateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const currentDate = new Date(dateMatch[1] + 'T12:00:00Z');
    for (let i = 1; i <= 7; i++) {
      const priorDate = new Date(currentDate);
      priorDate.setUTCDate(priorDate.getUTCDate() - i);
      const priorDateStr = priorDate.toISOString().split('T')[0];
      const priorFile = path.join(briefsDir, `brief-${priorDateStr}-lorp.json`);
      if (fs.existsSync(priorFile)) {
        try {
          const priorBrief = loadFirstJSON(priorFile);
          (priorBrief.symbols_scanned || []).forEach(s => {
            if (s.error) return;
            const sts = s.indicators?.studies || [];
            const adxSt2    = getStudy(sts, 'ADX and DI', 'Average Directional Index', 'ADX');
            const adxPrev   = parseNum(getVal(adxSt2?.values, 'ADX'));
            const diPlusPrev  = parseNum(getVal(adxSt2?.values, 'DI+'));
            const diMinusPrev = parseNum(getVal(adxSt2?.values, 'DI-'));
            if (adxPrev    != null) prevAdxMap[s.symbol]    = adxPrev;
            if (diPlusPrev  != null) prevDiPlusMap[s.symbol]  = diPlusPrev;
            if (diMinusPrev != null) prevDiMinusMap[s.symbol] = diMinusPrev;
            // Signal-marker set for prior-brief freshness de-dup (display-layer only).
            const lcV  = getStudy(sts, 'Lorentzian Classification Premium', 'Lorentzian', 'LC Premium')?.values || {};
            const ppV  = getStudy(sts, 'Pocket Pivot')?.values || {};
            const capV = getStudy(sts, 'CAP Tools Supplement', 'CAP Tools')?.values || {};
            const arV  = getStudy(sts, 'Aroon')?.values || {};
            const _has = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
            const _pos = (o,k) => { const x = parseNum(o[k]); return x != null && x > 0; };
            const _fired = new Set();
            if (_has(lcV,'Buy')  && _pos(lcV,'Buy'))   _fired.add('LC');
            if (_has(lcV,'Sell') && _pos(lcV,'Sell'))  _fired.add('LCs');
            if (_has(arV,'Long'))           _fired.add('A_L');
            if (_has(arV,'Short'))          _fired.add('A_S');
            if (_pos(arV,'Long (Chart)'))   _fired.add('AC_L');
            if (_pos(arV,'Short (Chart)'))  _fired.add('AC_S');
            if (_pos(ppV,'Pocket Pivot'))   _fired.add('PP');
            if (_pos(capV,'Climax Demand')) _fired.add('CD');
            if (_pos(capV,'Strong Demand')) _fired.add('SD');
            if (_pos(capV,'Climax Supply')) _fired.add('CS');
            if (_pos(capV,'Strong Supply')) _fired.add('SS');
            if (_fired.size) prevSigMap[s.symbol] = _fired;
          });
          process.stderr.write(`[adx-slope] Prior ADX/DI loaded from ${priorDateStr} (${Object.keys(prevAdxMap).length} symbols)\n`);
        } catch(e) {
          process.stderr.write(`[adx-slope] Could not load prior brief ${priorDateStr}: ${e.message}\n`);
        }
        break;
      }
    }
    if (Object.keys(prevAdxMap).length === 0) {
      process.stderr.write(`[adx-slope] No prior brief found — ADX direction unavailable\n`);
    }
  }
}

// ── Approach B (Jul 2026): multi-brief history for LORP classification ──
//   LC Premium is closed (can't add a Pine barssince plot), so we read its exported reversion
//   chars from the last few SAVED scans. Reversion-Down chars are numeric indices '15' (Standard)
//   and '16' (Strong) — the named 'Chars' key only holds the LAST char, so read by index.
//   Pullback = reversion-Down within last 4 briefs. Breakout needs ADX & D+ rising over 2 bars
//   -> compare today vs the 2nd prior brief found.
const revDownRecentMap = {};
const adx2BackMap = {}, diPlus2BackMap = {};
{
  const dm = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  if (dm) {
    const cur = new Date(dm[1] + 'T12:00:00Z');
    let found = 0;
    for (let i = 1; i <= 10 && found < 4; i++) {
      const pd = new Date(cur); pd.setUTCDate(pd.getUTCDate() - i);
      const pf = path.join(briefsDir, `brief-${pd.toISOString().split('T')[0]}-lorp.json`);
      if (!fs.existsSync(pf)) continue;
      let pb; try { pb = loadFirstJSON(pf); } catch { continue; }
      found++;
      (pb.symbols_scanned || []).forEach(s => {
        if (s.error) return;
        const sts = s.indicators?.studies || [];
        const lcv = getStudy(sts, 'Lorentzian Classification Premium', 'ML: Lorentzian', 'Lorentzian')?.values || {};
        const dReg = parseNum(lcv['15']), dStr = parseNum(lcv['16']);
        if ((dReg != null && Math.abs(dReg) > 0) || (dStr != null && Math.abs(dStr) > 0)) revDownRecentMap[s.symbol] = true;
        if (found === 2) {
          const av = getStudy(sts, 'ADX and DI', 'Average Directional Index', 'ADX')?.values || {};
          const a = parseNum(getVal(av, 'ADX')), dp = parseNum(getVal(av, 'DI+', '+DI'));
          if (a  != null) adx2BackMap[s.symbol]    = a;
          if (dp != null) diPlus2BackMap[s.symbol] = dp;
        }
      });
    }
    process.stderr.write(`[lorp-class] history: ${found} briefs | revDown ${Object.keys(revDownRecentMap).length} | adx2back ${Object.keys(adx2BackMap).length}\n`);
  }
}

// Load section assignments from rules.json
const rulesPath = path.join(__dirname, '../rules.json');
const rules = fs.existsSync(rulesPath) ? JSON.parse(fs.readFileSync(rulesPath, 'utf8')) : {};
const etfUniverse = new Set(rules.etf_universe || []);
const watchlistSections = rules.watchlist_sections || {};

// Tickers to permanently exclude from all brief output (e.g. delisted, wrong exchange, data unavailable)
// EQR: resolves to ASX_DLY:EQR (EQ Resources Ltd, Australia) instead of NYSE:EQR — exclude until
// the watchlist entry is updated to use the full NASDAQ:EQR or NYSE:EQR prefix.
const EXCLUDED_TICKERS = new Set(['TPH', 'EQR', 'ASX_DLY:EQR']);
// SID-ONLY exclusion: leveraged & inverse ETFs are net-negative for SID's
// mean-reversion entry (daily-rebalanced products fight a dip-buy; bootstrapped
// June 2026 — leveraged bucket PF 0.96, net neg). Scoped to SID only; these may
// still be valid for LORP/trend strategies, so NOT added to EXCLUDED_TICKERS.
const SID_LEVERAGED_EXCLUDE = new Set([
  'SOXL', 'SQQQ', 'TNA', 'SH', 'CRSH',                                  // BTW leveraged/inverse
  'TQQQ', 'UPRO', 'SSO', 'QLD', 'BULZ', 'AAPU', 'AMZU', 'AVGX', 'ORCX'  // SID SCREENER leveraged
]);
// Build reverse map: ticker → section name
const tickerSection = {};
for (const [section, tickers] of Object.entries(watchlistSections)) {
  for (const ticker of tickers) {
    if (!tickerSection[ticker]) tickerSection[ticker] = section;
  }
}
// Section sets — one per TV watchlist section
const lorpScreenerSet  = new Set(watchlistSections['LORP SCREENER']        || []);
const lorpBriefSet     = new Set(watchlistSections['LORP BRIEF']            || []);
const sidScreenerSet   = new Set(watchlistSections['SID SCREENER']          || []);
const sidBriefSet      = new Set(watchlistSections['SID BRIEF']             || []);
const btwSet           = new Set(watchlistSections['BTW']                   || []);
const adxScreenerSet   = new Set(watchlistSections['ADX BREAKOUT SCREENER'] || []);
const adxBriefSet      = new Set(watchlistSections['ADX BREAKOUT BRIEF']    || []);
const pullbackBriefSet    = new Set(watchlistSections['PULLBACK BRIEF']        || []);
const pullbackScreenerSet = new Set(watchlistSections['PULLBACK SCREENER']     || []);
// Combined universes
const sidUniverseSet   = new Set([...sidScreenerSet, ...sidBriefSet, ...btwSet]);
// ADX coiling candidates come only from SCREENER — BRIEF is the output destination, not a second input.
// Scanning BRIEF would cause it to grow each run (coiling candidates pushed back → scanned again next day).
const adxUniverseSet   = new Set([...adxScreenerSet]);

// ── Process SID brief (from SID layout scan) ─────────────────────
const sidResults = sidBrief ? sidBrief.symbols_scanned.filter(s => !EXCLUDED_TICKERS.has(s.symbol) && !SID_LEVERAGED_EXCLUDE.has(s.symbol.includes(':') ? s.symbol.split(':')[1] : s.symbol)).map(s => {
  if (s.error) return { sym: s.symbol, error: s.error };
  const studies = s.indicators?.studies || [];
  const price   = s.quote?.last;

  // SID layout has two SID indicators:
  //   s7  "SID Strategy v10.5.4.15"        — entry/exit signals only
  //   s18 "SID Trading Signals Pro v8.5.10" — full confluence (Aroon, ADX, ATR%, SMA200, Weekly RSI, etc.)
  // Prefer v8.5 for confluence data; fall back to v10.5 for entry signals if v8.5 not yet loaded.
  const sidV85St = getStudy(studies, 'SID Trading Signals Pro', 'SID Trading Signals', 'SID v8.5', 'SID-C', 'SID Confluence');
  const sidCSt   = sidV85St; // v8.5.10 is the sole source — entry signals + all confluence data
  // David (28 Aug 2026): SMA50 isn't exported by the indicator (sidCSt) at all — only
  // "SMA200" is. Reading it from the strategy study instead, via its own exact key
  // ('SMA50 Value'). Deliberately NOT using getVal's fuzzy fallback for this — that
  // fallback does bidirectional substring matching (k.includes(vkl) || vkl.includes(k)),
  // which matched plain numeric keys like '0' against the search term 'sma50' (since
  // 'sma50' contains the digit '0'), producing a nonsense 543% reading on JLL. Exact
  // key access on the correct study avoids the bug entirely rather than dodging it.
  const sidStrategySt = getStudy(studies, 'SID Strategy');
  const rvolSt  = getStudy(studies, 'RVOL + Volume Z-Score', 'RVOL Ratio', 'RVOL-Z', 'RVOL Z', 'RVOL');
  const vdSt    = getStudy(studies, 'Volume Delta');
  const atrSt   = getStudy(studies, 'Average True Range Stop Loss', 'ATR Stop Loss', 'ATR%');
  const aroonSt = getStudy(studies, 'Aroon Oscillator', 'Aroon');
  const adxSt   = getStudy(studies, 'ADX and DI', 'Average Directional Index', 'ADX');
  const gpStSID = getStudy(studies, 'GP Zone', 'Golden Pocket', 'GP_Zone', 'GP Flag');

  // Entry signals from v8.5.10 (SID Trading Signals Pro) — the indicator, not the strategy.
  // v8.5.10 'Long/Short Entry Signal' is a plotshape on the last closed bar: correct for
  // a morning brief that reads before the US open. v10.5.4.15 is the strategy variant
  // (long-term backtesting) and is not used for entry detection.
  const sidArmedLong  = parseNum(getVal(sidCSt?.values, 'Long Entry Signal',  'SID Armed Long',  'RSI Enters OS',  'Armed Long'));
  const sidArmedShort = parseNum(getVal(sidCSt?.values, 'Short Entry Signal', 'SID Armed Short', 'RSI Enters OB',  'Armed Short'));
  // Exit signals
  const sidLongExit   = parseNum(getVal(sidCSt?.values, 'Long Exit Signal',  'Long Exit'));
  const sidShortExit  = parseNum(getVal(sidCSt?.values, 'Short Exit Signal', 'Short Exit'));
  // Confluence factors — from SID Trading Signals Pro v8.5.12 (embedded in indicator)
  // REMOVED: Weekly RSI Gate & Weekly MACD Align (proved unreliable in coding); Aroon Osc
  // (dropped in favour of ADX + DI+/DI-).
  const wrsi          = parseNum(getVal(sidCSt?.values, 'Weekly RSI'));
  const sma200        = parseNum(getVal(sidCSt?.values, 'SMA200'));
  // David (28 Aug 2026): same pattern as SMA200, but read directly from sidStrategySt's
  // exact 'SMA50 Value' key (not getVal's fuzzy fallback — see the comment above).
  const sma50         = parseNum(sidStrategySt?.values?.['SMA50 Value']);
  const adxVal        = parseNum(getVal(sidCSt?.values, 'ADX'));
  const diPlusSid     = parseNum(getVal(sidCSt?.values, 'DI+', '+DI', 'DI Plus'));
  const diMinusSid    = parseNum(getVal(sidCSt?.values, 'DI-', '-DI', 'DI Minus'));
  const atrPctSid     = parseNum(getVal(sidCSt?.values, 'ATR%'));
  const gatrRatio     = parseNum(getVal(sidCSt?.values, 'Gap/ATR Ratio'));
  // MACD0 (MACD vs Signal) for the SID table — same source as the LORP path.
  const macdStSid  = getStudy(studies, 'MACD_Cross Zero', 'MACD Cross Zero', 'MACD');
  const macdSid    = parseNum(getVal(macdStSid?.values, 'MACD', 'MACD Line', 'MACD line'));
  const macdSigSid = parseNum(getVal(macdStSid?.values, 'Signal Line', 'Signal', 'signal'));

  // Fallback to standalone indicators if SID-C not found
  const adx     = adxVal     ?? parseNum(getVal(adxSt?.values, 'ADX', 'adx'));
  const diPlus  = diPlusSid  ?? parseNum(getVal(adxSt?.values, 'DI+', '+DI'));
  const diMinus = diMinusSid ?? parseNum(getVal(adxSt?.values, 'DI-', '-DI'));
  const atrPct  = atrPctSid  ?? parseNum(getVal(atrSt?.values, 'ATR% raw (buffer ref)', 'ATR%', 'ATR %'));
  const vd     = parseVD(getVal(vdSt?.values, 'Volume Delta', 'Vol Delta', 'Delta', 'delta'));
  const vdPos  = vd != null ? vd > 0 : null;

  let rvol = null;
  if (rvolSt) {
    const rawVol = parseVolStr(getVal(rvolSt.values, 'Volume'));
    const smaVol = parseVolStr(getVal(rvolSt.values, 'SMA(Volume)', 'SMA Volume'));
    if (rawVol != null && smaVol != null && smaVol > 0) {
      rvol = rawVol / smaVol;
    } else {
      rvol = parseNum(getVal(rvolSt.values, 'RVOL ratio', 'RVOL Ratio', 'RVOL', 'ratio', 'Ratio', 'rvol'));
    }
  }

  // GP Zone flag
  const gpFlag = parseNum(getVal(gpStSID?.values, 'GP_Flag', 'GP Flag', 'GP flag'));
  const gpTop  = parseNum(getVal(gpStSID?.values, 'GP_Top',  'GP Top'));
  const gpBot  = parseNum(getVal(gpStSID?.values, 'GP_Bot',  'GP Bot'));

  // SMA200 position
  const aboveSMA200 = (price != null && sma200 != null) ? price > sma200 : null;
  const sma200Pct   = pct(price, sma200);
  // SMA50 position (28 Aug 2026, same pattern as SMA200)
  const aboveSMA50 = (price != null && sma50 != null) ? price > sma50 : null;
  const sma50Pct   = pct(price, sma50);

  // Signal passes on entry firing alone. Raw Weekly RSI exposed for a manual by-eye direction
  // check; the computed Weekly RSI Gate & Weekly MACD Align were removed (unreliable). Aroon → ADX+DI.
  const isLongPass  = sidArmedLong  === 1;
  const isShortPass = sidArmedShort === 1;
  const isArmed     = sidArmedLong  === 1 || sidArmedShort === 1;

  // Section source
  const inSIDScreener = sidScreenerSet.has(s.symbol);
  const inSIDBrief    = sidBriefSet.has(s.symbol);
  const inBTW         = btwSet.has(s.symbol);

  return {
    sym: s.symbol, price, isLongPass, isShortPass, isArmed,
    sidArmedLong, sidArmedShort, sidLongExit, sidShortExit,
    wrsi, sma200, aboveSMA200, sma200Pct,
    sma50, aboveSMA50, sma50Pct,
    adx, diPlus, diMinus, atrPct, gatrRatio, rvol, vd, vdPos,
    macd: macdSid, macdSig: macdSigSid,
    inSIDScreener, inSIDBrief, inBTW,
    gpFlag, gpTop, gpBot,
    high: s.quote?.high, low: s.quote?.low,
  };
}) : [];

// ── Helpers ──────────────────────────────────────────────────────
function getStudy(studies, ...substrings) {
  for (const sub of substrings) {
    const found = studies.find(s => s.name.toLowerCase().includes(sub.toLowerCase()));
    if (found) return found;
  }
  return undefined;
}

// Try multiple possible key names — returns first match, or null
function getVal(values, ...keys) {
  if (!values) return null;
  for (const k of keys) {
    const v = values[k];
    if (v != null && v !== '' && v !== '∅') return v;
  }
  // Fuzzy fallback: case-insensitive partial match on remaining keys
  const lowerKeys = keys.map(k => k.toLowerCase());
  for (const [vk, vv] of Object.entries(values)) {
    if (vv == null || vv === '' || vv === '∅') continue;
    const vkl = vk.toLowerCase();
    if (lowerKeys.some(k => vkl.includes(k) || k.includes(vkl))) return vv;
  }
  return null;
}

function parseNum(val) {
  if (val == null) return null;
  // Normalise Unicode minus sign (U+2212 '−') to ASCII hyphen-minus before stripping
  let s = String(val).trim().replace(/−/g, '-');
  s = s.replace(/[^0-9.\-+]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseVD(val) {
  if (val == null) return null;
  const s   = String(val).trim();
  const neg = s.startsWith('−') || s.startsWith('-');
  const n   = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : (neg ? -n : n);
}

// Parse volume strings with K/M/B suffixes → absolute number
// Handles Unicode narrow non-breaking space ( ) used by RVOL + Volume Z-Score v2.1
// e.g. "1.03 M" → 1030000,  "993.79 K" → 993790
function parseVolStr(v) {
  if (v == null) return null;
  // Strip commas and all whitespace/non-breaking variants, then extract number + suffix
  const s = String(v).replace(/,/g, '').replace(/[  \s]/g, ' ').trim();
  const m = s.match(/^([0-9.]+)\s*([KMBkmb]?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
  return n * mult;
}

function pct(a, b) {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

function sign(n) { return n >= 0 ? '+' : ''; }

// ── DEBUG: dump raw study names + keys, then exit ────────────────
if (DEBUG) {
  const first = brief.symbols_scanned.find(s => !s.error);
  if (!first) { console.log('No successful symbols in brief.'); process.exit(0); }
  const studies = first.indicators?.studies || [];
  console.log(`\n=== DEBUG: Raw data window values for ${first.symbol} ===\n`);
  console.log(`${studies.length} studies found:\n`);
  studies.forEach((st, i) => {
    console.log(`  [${i + 1}] "${st.name}"`);
    const vals = st.values || {};
    const keys = Object.keys(vals);
    if (keys.length === 0) {
      console.log('       (no values)');
    } else {
      keys.forEach(k => console.log(`       "${k}" = ${JSON.stringify(vals[k])}`));
    }
    console.log('');
  });
  console.log(`\nExpected study → key mappings in analyse-brief.cjs:`);
  console.log(`  MACD: "MACD_Cross Zero" → keys: MACD, Signal Line`);
  console.log(`  MAs:  "LORP Moving" → keys: MA #1 (EMA50), MA #2 (SMA200)`);
  console.log(`  SID:  "SID Trading Signals" → keys: RSI (0-100), RSI Enters OS, RSI Enters OB`);
  console.log(`  RVOL: "RVOL Ratio" or "RVOL-Z" → key: RVOL ratio / RVOL / ratio`);
  console.log(`  Aroon:"Aroon Oscillator" → key: Aroon Oscillator`);
  console.log(`  VD:   "Volume Delta" → key: Volume Delta`);
  console.log(`  ATR%: "Average True Range Stop Loss" → key: ATR% raw (buffer ref) / ATR%`);
  console.log(`  ADX:  "Average Directional Index" → key: ADX`);
  console.log('\nIf a study name or key doesn\'t match, update the lookups in analyse-brief.cjs.\n');
  process.exit(0);
}

// ── Extract per symbol ───────────────────────────────────────────
const results = brief.symbols_scanned.filter(s => !EXCLUDED_TICKERS.has(s.symbol)).map(s => {
  if (s.error) return { sym: s.symbol, error: s.error };

  const studies = s.indicators?.studies || [];
  const price   = s.quote?.last;

  // Study lookups — multiple name substrings tried in order (first match wins)
  const macdSt  = getStudy(studies, 'MACD_Cross Zero', 'MACD Cross Zero', 'MACD');
  const lorpMA  = getStudy(studies, 'LORP Moving', 'LORP MA', 'LORP Moving Averages', 'Moving Averages');
  // SID indicator is on the SID chart layout only — not available here
  // "RVOL + Volume Z-Score v2.1" — confirmed name from debug
  const rvolSt  = getStudy(studies, 'RVOL + Volume Z-Score v2.1', 'RVOL + Volume Z-Score', 'RVOL Ratio', 'RVOL-Z', 'RVOL Z', 'RVOL');
  const aroonSt = getStudy(studies, 'Aroon Oscillator [BigBeluga]', 'Aroon Oscillator', 'Aroon');
  const vdSt    = getStudy(studies, 'Volume Delta');
  const atrSt   = getStudy(studies, 'Average True Range Stop Loss', 'ATR Stop Loss', 'ATR%');
  const adxSt   = getStudy(studies, 'ADX and DI', 'Average Directional Index', 'ADX');  // matches "ADX and DI for v4"
  // Newly confirmed available on LORP chart (from --debug)
  const bbSt    = getStudy(studies, 'Bollinger Bands');
  const wrbSt   = getStudy(studies, 'WRB Confluence');
  const ppSt    = getStudy(studies, 'Pocket Pivot');
  // New indicators on LORP layout (added May 2026)
  const capSt   = getStudy(studies, 'CAP Tools Supplement');           // Climax/Strong Demand+Supply flags
  const chandSt = getStudy(studies, 'Chandelier Exit');                // Long Stop level
  const wtSt    = getStudy(studies, 'WaveTrend 3D');                  // Bullish/Bearish Cross dots (28 Aug 2026)
  // (LORP Confluence v1.4 + Volumatic VIDYA retired from brief 2026-06-05 — LORP-C
  //  duplicated factors the brief reads individually; VIDYA is visual-only on chart.)

  // Value key lookups — multiple key names tried in order (first non-null wins)
  const macd    = parseNum(getVal(macdSt?.values, 'MACD', 'MACD Line', 'MACD line'));
  const macdSig = parseNum(getVal(macdSt?.values, 'Signal Line', 'Signal', 'signal'));
  const ma1     = parseNum(getVal(lorpMA?.values, 'MA #1', 'MA#1', 'MA 1', 'EMA50', 'EMA 50'));    // EMA50
  const ma2     = parseNum(getVal(lorpMA?.values, 'MA #2', 'MA#2', 'MA 2', 'SMA200', 'SMA 200')); // SMA200
  // RSI, rsiOS, rsiOB removed — from SID indicator, not available on LORP chart
  // RVOL: prefer computed Volume/SMA(Volume) ratio (2 decimal precision) over display-rounded
  // integer key "RVOL ratio" from "RVOL + Volume Z-Score v2.1" (rounds 0.79→1, misleading).
  let rvol = null;
  if (rvolSt) {
    const rawVol = parseVolStr(getVal(rvolSt.values, 'Volume'));
    const smaVol = parseVolStr(getVal(rvolSt.values, 'SMA(Volume)', 'SMA Volume'));
    if (rawVol != null && smaVol != null && smaVol > 0) {
      rvol = rawVol / smaVol;
    } else {
      // Fallback: use display key (may be integer-rounded)
      rvol = parseNum(getVal(rvolSt.values, 'RVOL ratio', 'RVOL Ratio', 'RVOL', 'ratio', 'Ratio', 'rvol'));
    }
  }
  const aroon       = parseNum(getVal(aroonSt?.values, 'Aroon Oscillator', 'Aroon', 'aroon'));
  const aroonSignal = parseNum(getVal(aroonSt?.values, 'Signal Line', 'Signal', 'signal'));
  // Aroon [BigBeluga] signal columns — exact-key only (fuzzy would match 'Long (Chart)' for 'Long')
  const _arVals        = aroonSt?.values ?? {};
  const aroonLongChart  = parseNum(_arVals['Long (Chart)']);   // BB — always present, > 0 when fired
  const aroonShortChart = parseNum(_arVals['Short (Chart)']);  // BC — always present, > 0 when fired
  const aroonLong  = Object.prototype.hasOwnProperty.call(_arVals, 'Long')  ? 1 : null;  // BF — key absent unless signal fires
  const aroonShort = Object.prototype.hasOwnProperty.call(_arVals, 'Short') ? 1 : null;  // BG — key absent unless signal fires
  // WaveTrend 3D — dot markers. Same presence-based pattern as Aroon above: key only
  // exists in the export on the bar the cross actually fires (28 Aug 2026, David).
  const _wtVals    = wtSt?.values ?? {};
  const wtBullCross = Object.prototype.hasOwnProperty.call(_wtVals, 'Bullish Cross') ? 1 : null;
  const wtBearCross = Object.prototype.hasOwnProperty.call(_wtVals, 'Bearish Cross') ? 1 : null;
  const vd      = parseVD(getVal(vdSt?.values, 'Volume Delta', 'Vol Delta', 'Delta', 'delta'));
  // ATR%: Average True Range Stop Loss Finder v2.4
  const atrPct  = parseNum(getVal(atrSt?.values, 'ATR% raw (buffer ref)', 'ATR%', 'ATR %', 'atr%', 'ATR Percent', 'atr percent'));
  const atrRaw  = parseNum(getVal(atrSt?.values, 'ATR (raw $)', 'ATR raw', 'ATR', 'atr'));
  const adx     = parseNum(getVal(adxSt?.values, 'ADX', 'adx', 'Average Directional Index'));
  const diPlus  = parseNum(getVal(adxSt?.values, 'DI+'));
  const diMinus = parseNum(getVal(adxSt?.values, 'DI-'));
  // Bollinger Bands → calculate %B
  const bbUpper = parseNum(getVal(bbSt?.values, 'Upper'));
  const bbLower = parseNum(getVal(bbSt?.values, 'Lower'));
  const bbPct   = (bbUpper != null && bbLower != null && price != null && (bbUpper - bbLower) > 0)
    ? (price - bbLower) / (bbUpper - bbLower)
    : null;
  // WRB: WRB Prior Bars > 0 means WRB in prior 5 bars
  const wrbPrior   = parseNum(getVal(wrbSt?.values, 'WRB Prior Bars', 'WRB Bar'));
  const wrbInPrior = wrbPrior != null ? wrbPrior > 0 : null;
  // Pocket Pivot v1.3
  const ppVal      = parseNum(getVal(ppSt?.values, 'Pocket Pivot'));
  const pocketPivot = ppVal != null ? ppVal > 0 : null;
  // CAP Tools Supplement v1.3 — volume climax/strong demand+supply signals
  const capClimaxDemand  = parseNum(getVal(capSt?.values, 'Climax Demand'));
  const capClimaxSupply  = parseNum(getVal(capSt?.values, 'Climax Supply'));
  const capStrongDemand  = parseNum(getVal(capSt?.values, 'Strong Demand'));
  const capStrongSupply  = parseNum(getVal(capSt?.values, 'Strong Supply'));
  const capDemandFired   = capClimaxDemand > 0 || capStrongDemand > 0;   // any bullish volume signal
  const capSupplyFired   = capClimaxSupply > 0 || capStrongSupply > 0;   // any bearish volume signal
  // Chandelier Exit — dynamic trailing stop
  const chandStop  = parseNum(getVal(chandSt?.values, 'Long Stop', 'Short Stop', 'Stop'));
  // GP Zone flag (requires GP Zone Exporter indicator on LORP chart — empty if not added)
  const gpStLORP = getStudy(studies, 'GP Zone Exporter', 'GP Zone', 'Golden Pocket', 'GP_Zone', 'GP Flag');
  const gpFlag   = parseNum(getVal(gpStLORP?.values, 'GP_Flag', 'GP Flag', 'GP flag'));
  const gpTop    = parseNum(getVal(gpStLORP?.values, 'GP_Top',  'GP Top'));
  const gpBot    = parseNum(getVal(gpStLORP?.values, 'GP_Bot',  'GP Bot'));

  // LC Premium — Kernel values from data window
  const lcSt           = getStudy(studies, 'Lorentzian Classification', 'LC Premium', 'ML: Lorentzian');
  const kernelVal      = parseNum(getVal(lcSt?.values, 'Kernel Regression Estimate', 'Kernel'));
  const distFromKernel = parseNum(getVal(lcSt?.values, 'Distance from Kernel'));
  const distAboveKernel = parseNum(getVal(lcSt?.values, 'Distance Above Kernel'));

  // ── Native LORP Backtest Stream (Stage 1, 25 Aug 2026) ──
  // Confirmed key name 'Backtest Stream' via live Data Window screenshot (ETON, 25 Aug 2026).
  // Native codes per LORP_Code_Streams.txt: 1 Long, -1 Short, 2 Long Exit, -2 Short Exit,
  // 3 Upward First Pullback, -3 Downward First Pullback, 4/5 Standard/Strong Downward MR,
  // -4/-5 Standard/Strong Upward MR. 6/-6 seen live but UNCONFIRMED — flagged, not routed.
  // Routing (confirmed with David 25 Aug 2026): Trend table = 1/-1 only. Pullback table =
  // 3/-3 (First Pullback) AND 4/5/-4/-5 (Mean Reversion). First column = label, not raw code.
  const backtestStream = parseNum(getVal(lcSt?.values, 'Backtest Stream'));
  const lorpNativeLabel =
    backtestStream === 1  ? 'LORP Long'
  : backtestStream === -1 ? 'LORP Short'
  : backtestStream === 2  ? 'Long Exit'
  : backtestStream === -2 ? 'Short Exit'
  : backtestStream === 3  ? 'Upward First Pullback'
  : backtestStream === -3 ? 'Downward First Pullback'
  : backtestStream === 4  ? 'Standard Downward MR'
  : backtestStream === 5  ? 'Strong Downward MR'
  : backtestStream === -4 ? 'Standard Upward MR'
  : backtestStream === -5 ? 'Strong Upward MR'
  : (backtestStream === 6 || backtestStream === -6) ? 'Unclassified (±6)'
  : null;
  const lorpNativeTable =
    (backtestStream === 1 || backtestStream === -1) ? 'Trend'
  : (backtestStream === 3 || backtestStream === -3 || backtestStream === 4
     || backtestStream === 5 || backtestStream === -4 || backtestStream === -5) ? 'Pullback'
  : null;  // exits, unclassified ±6, and 0/na never populate a table row

  // reversion-now for LORP classification (Jul 2026); adx/diPlus/diMinus already read above
  const revDownNow = (() => { const a = parseNum(lcSt?.values?.['15']), b = parseNum(lcSt?.values?.['16']); return (a != null && Math.abs(a) > 0) || (b != null && Math.abs(b) > 0); })();
  // LC envelope (indicator's own "too far" band) — flags an EXTENDED long as a look-closer cue.
  // NOT the Mean Reversion Down signal (those plotchar flags don't surface reliably in the data
  // window — vet with confluence_check.py). Kernel-layer value: repaints on history, live read only.
  const upperEnvFar    = parseNum(getVal(lcSt?.values, 'Upper Envelope: Far'));
  const lowerEnvFar    = parseNum(getVal(lcSt?.values, 'Lower Envelope: Far'));
  const extendedAbove  = (price != null && upperEnvFar != null) ? price > upperEnvFar : null;
  // LC Premium signal keys — exact match only (key absent or 0 when no signal).
  // Buy/Sell/StopBuy/StopSell contain the signal price when active, empty otherwise.
  // Must use hasOwnProperty — fuzzy getVal('Buy') would match 'StopBuy' as a fallback.
  const _lcVals    = lcSt?.values ?? {};
  const lcBuy      = Object.prototype.hasOwnProperty.call(_lcVals, 'Buy')      ? parseNum(_lcVals['Buy'])      : null;
  const lcSell     = Object.prototype.hasOwnProperty.call(_lcVals, 'Sell')     ? parseNum(_lcVals['Sell'])     : null;
  const lcStopBuy  = Object.prototype.hasOwnProperty.call(_lcVals, 'StopBuy')  ? parseNum(_lcVals['StopBuy'])  : null;
  const lcStopSell = Object.prototype.hasOwnProperty.call(_lcVals, 'StopSell') ? parseNum(_lcVals['StopSell']) : null;
  // Valid LORP entry signal: Buy > 0 only. StopBuy/StopSell are EXIT signals — confirmed by
  // the persistent-watch updater, which treats lcStopBuy>0 as 'Exited: StopBuy fired'. Counting
  // StopBuy as a buy made a closed/extended position read as a fresh entry for days after it
  // ran (e.g. BIRK: Buy=∅, StopBuy=49.28 still populated, Dist 2.23 = extended). Entry = Buy/Sell.
  const lorpBuySignal  = (lcBuy  != null && lcBuy  > 0);
  const lorpSellSignal = (lcSell != null && lcSell > 0);

  // ── CE (Confluence Engine) signals — read by header name, not column position ──
  // 'Buy Label'  → CE Buy signal  (non-zero = fired this bar)
  // 'Sell Label' → CE Sell signal (non-zero = fired this bar)
  // Active CE Buy = Buy Label fired more recently than Sell Label.
  // From a single CDP snapshot we can only detect "fired this bar". If the indicator
  // holds the value for multiple bars, the 2-bar window described below will work naturally.
  const ceBuyRaw    = parseNum(_lcVals['Buy Label']);
  const ceSellRaw   = parseNum(_lcVals['Sell Label']);
  const ceBuyFired  = ceBuyRaw  != null && ceBuyRaw  > 0;
  const ceSellFired = ceSellRaw != null && ceSellRaw > 0;
  // Active CE Buy: Buy Label fired this bar AND Sell Label has NOT fired this bar
  const ceBuyActive  = ceBuyFired && !ceSellFired;
  const ceSellActive = ceSellFired && !ceBuyFired;

  // ── CCI signals — separate 'CCI_S' indicator on the LORP layout ──
  // Read by header name, not column position.
  // ⚠️ "Fired within last 2 bars" relies on the indicator holding its output value
  // for at least 2 bars. From a single CDP snapshot, value > 0 = fired on current bar.
  const cciSt         = getStudy(studies, 'CCI_S');
  const _cciVals      = cciSt?.values ?? {};
  const cciOSEntryRaw = parseNum(_cciVals['Enter Long (into OS)']);
  const cciOSExitRaw  = parseNum(_cciVals['Exit Long (recover OS — long entry)']);
  const cciOBEntryRaw = parseNum(_cciVals['Enter Short (into OB)']);
  const cciOBExitRaw  = parseNum(_cciVals['Exit Short (fall from OB — fade)']);

  const cciOSEntry = cciOSEntryRaw != null && cciOSEntryRaw > 0;  // CCI OS entry — Enter Long into OS
  const cciOSExit  = cciOSExitRaw  != null && cciOSExitRaw  > 0;  // CCI OS exit confirmation
  const cciOBEntry = cciOBEntryRaw != null && cciOBEntryRaw > 0;  // CCI OB entry — Enter Short into OB
  const cciOBExit  = cciOBExitRaw  != null && cciOBExitRaw  > 0;  // CCI OB exit confirmation

  // ── Derived LORP + CCI confluence states ──
  // Pre-entry CCI flag: Enter Long (into OS) fired within last 2 bars AND no LORP Buy signal yet
  const cciPreEntryLong  = cciOSEntry && !lorpBuySignal;
  // CCI confirmation long: Exit Long (recover OS) fired same day or within 1 bar of LORP Buy
  const cciConfirmLong   = cciOSExit  && lorpBuySignal;
  // CCI pre-entry short / confirmation short (context only — LORP is long-only)
  const cciPreEntryShort = cciOBEntry;
  const cciConfirmShort  = cciOBExit;

  // Entry type — TV AI recommended thresholds (adopted May 2026):
  // Pullback: 0.00–0.50 (price touching/inside kernel)
  // Trend:    0.50–1.50 (price above kernel, not extended)
  // Breakout: 1.50+     (price launching from kernel)
  // LORP classification — REBUILT Jul 2026 (approach B, saved-brief history).
  //   Pullback: LC reversion-Down (Standard/Strong) within last 4 briefs — OVERRIDES all else.
  //   Breakout: ADX>25 & rising(2b) · RVOL>1.2 · D+ rising(2b) · raw ATR>2 · MACD>0.
  //   Trend:    not Pullback/Breakout · ADX>20 · MACD>0 · RVOL>0.8.  Else '—'.
  //   ("MACD>0" uses macdPos = MACD above zero line, which the LORP screener already gates on;
  //    say if you meant MACD-vs-Signal instead.)
  const _revWindow = revDownRecentMap[s.symbol] === true || revDownNow === true;  // reversion within 4 bars up to & incl. the entry bar
  const _adx2 = adx2BackMap[s.symbol], _dip2 = diPlus2BackMap[s.symbol];
  const _adxRising = (adx != null && _adx2 != null) ? adx > _adx2 : false;
  const _dipRising = (diPlus != null && _dip2 != null) ? diPlus > _dip2 : false;
  const _macd0Pos  = (macd != null && macd > 0);
  const _isPullback = (lorpBuySignal === true) && _revWindow;  // LC entry is PRIMARY; reversion (incl. entry bar) sub-classifies it
  // David (28 Aug 2026): RVOL threshold loosened 2 -> 1.2. Note: this is the Breakout
  // classification's RVOL gate — the only RVOL>2 threshold anywhere in this file.
  // Breakout folds into the Trend stream (not Pullback) in the current table split.
  const _isBreakout = !_isPullback && adx != null && adx > 25 && _adxRising
                      && rvol != null && rvol > 1.2 && _dipRising
                      && atrRaw != null && atrRaw > 2 && _macd0Pos;
  const _isTrend    = !_isPullback && !_isBreakout && adx != null && adx > 20 && _macd0Pos && rvol != null && rvol > 0.8;
  const entryType = distFromKernel == null ? 'No LC data'
    : _isPullback ? 'Pullback 🔄'
    : _isBreakout ? 'Breakout 🚀'
    : _isTrend    ? 'Trend ↗'
    : '—';

  // ════════════════════════════════════════════════════════════════
  // LORP — Screener pre-filters already applied (ATR 1-5%, MACD>0,
  // EMA21>EMA34, Vol>500K, RelVol>0.8, Price>EMA34, Aroon Down<30%, RSI 45-75)
  // Brief shows ALL tickers — no additional filtering applied here.
  // Contextual columns from chart indicators for manual judgment only.
  // ════════════════════════════════════════════════════════════════
  const aboveEMA50       = price != null && ma1 != null ? price > ma1 : null;
  const ema50AboveSMA200 = ma1   != null && ma2 != null ? ma1   > ma2 : null;
  const aboveSMA200      = price != null && ma2 != null ? price > ma2 : null;
  const macdPos          = macd  != null ? macd > 0 : null;
  const aroonPos         = aroon != null ? aroon > 0 : null;
  const vdPos            = vd    != null ? vd > 0 : null;

  const ema50pct  = pct(price, ma1);
  const sma200pct = pct(price, ma2);

  const ema50Detail  = ma1 != null ? `P:${price?.toFixed(2)} EMA50:${ma1.toFixed(2)} (${ema50pct != null ? sign(ema50pct) + ema50pct.toFixed(1) : '?'}%)` : 'EMA50 n/a';
  const sma200Detail = ma2 != null ? `P:${price?.toFixed(2)} SMA200:${ma2.toFixed(2)} (${sma200pct != null ? sign(sma200pct) + sma200pct.toFixed(1) : '?'}%)` : 'SMA200 n/a';

  const aroonCtxLORP = aroon != null
    ? aroon > 50  ? `${aroon.toFixed(1)} — strong uptrend`
    : aroon > 0   ? `${aroon.toFixed(1)} — mild uptrend`
    : aroon === 0 ? `${aroon.toFixed(1)} — neutral`
    : `${aroon.toFixed(1)} — downtrend present`
    : 'n/a';

  const vdCtxLORP = vd != null
    ? vd > 0 ? 'Net buy pressure ✓' : vd < 0 ? 'Net sell pressure ⚠️' : 'Neutral'
    : 'n/a';

  const rvolCtx = rvol != null
    ? (rvol < 0.75 ? `${rvol.toFixed(0)} ⚠️ low` : `${rvol.toFixed(0)}`)
    : 'n/a';

  const bbPctCtx = bbPct != null
    ? bbPct > 1.0  ? `%B ${bbPct.toFixed(2)} — above upper band`
    : bbPct >= 0.5 ? `%B ${bbPct.toFixed(2)} ✓ upper half`
    : bbPct >= 0.0 ? `%B ${bbPct.toFixed(2)} ⚠️ lower half`
    : `%B ${bbPct.toFixed(2)} — below lower band`
    : 'n/a';

  const wrbCtx = wrbInPrior === true ? 'WRB in prior 5 bars ✓'
    : wrbInPrior === false ? 'No WRB'
    : 'n/a';

  const atrCtxLORP = atrPct != null
    ? atrPct > 5  ? `${atrPct.toFixed(2)}% [HIGH RISK]`
    : atrPct >= 3 ? `${atrPct.toFixed(2)}% ⚠️ elevated`
    : `${atrPct.toFixed(2)}% ✓`
    : 'n/a';

  // All tickers pass — Screener is the gate
  const strategy = 'LORP';

  return {
    sym: s.symbol, price, strategy,
    // LORP context
    aboveEMA50, ema50Detail, aboveSMA200, sma200Detail,
    ema50AboveSMA200, macdPos, aroonPos, aroonCtxLORP,
    vdPos, vdCtxLORP, rvol, rvolCtx, atrCtxLORP,
    bbPct, bbPctCtx, wrbInPrior, wrbPrior, wrbCtx,
    ma1, ma2,
    // LC Premium kernel values
    kernelVal, distFromKernel, distAboveKernel, entryType,
    upperEnvFar, lowerEnvFar, extendedAbove,
    // Native LORP Backtest Stream (Stage 1, 25 Aug 2026) — raw code, label, table routing
    backtestStream, lorpNativeLabel, lorpNativeTable,
    // LC Premium signal keys (null = key absent / no signal on this bar)
    lcBuy, lcSell, lcStopBuy, lcStopSell, lorpBuySignal, lorpSellSignal,
    // CE signals (Buy Label / Sell Label from LC Premium)
    ceBuyRaw, ceSellRaw, ceBuyFired, ceSellFired, ceBuyActive, ceSellActive,
    // CCI signals (Enter/Exit Long OS · Enter/Exit Short OB from LC Premium)
    cciOSEntryRaw, cciOSExitRaw, cciOBEntryRaw, cciOBExitRaw,
    cciOSEntry, cciOSExit, cciOBEntry, cciOBExit,
    // Derived CCI confluence states
    cciPreEntryLong, cciConfirmLong, cciPreEntryShort, cciConfirmShort,
    // Aroon [BigBeluga] signal columns
    aroonLong, aroonShort, aroonLongChart, aroonShortChart,
    // WaveTrend 3D dot markers
    wtBullCross, wtBearCross,
    // GP Zone flag (null if indicator not on LORP chart)
    gpFlag, gpTop, gpBot,
    // Pocket Pivot
    pocketPivot,
    // New indicators (May 2026 LORP layout)
    capDemandFired, capSupplyFired, capClimaxDemand, capClimaxSupply, capStrongDemand, capStrongSupply,
    chandStop,
    // Raw numeric values
    macd, macdSig, aroon, aroonSignal, ema50pct, sma200pct,
    adx, diPlus, diMinus, vd, atrPct,
    // Quote data
    high: s.quote?.high,
    low:  s.quote?.low,
    open: s.quote?.open,
  };
});

// ── Process Pullback results (from PULLBACK layout scan) ──
// PULLBACK SCREENER + PULLBACK BRIEF tickers scanned on the PULLBACK layout
const pbBrief = pullbackBriefFile && fs.existsSync(pullbackBriefFile)
  ? loadFirstJSON(pullbackBriefFile)
  : null;
const pbRaw = pbBrief?.symbols_scanned ?? [];
const pbHasData = Array.isArray(pbRaw) && pbRaw.length > 0 && !pbRaw[0]?.layout_error;

const pbProcessed = pbHasData ? pbRaw.map(s => {
  if (s.error) return { sym: s.symbol, error: s.error };
  const studies = s.indicators?.studies || [];
  const price   = s.quote?.last;

  const slingShot = getStudy(studies, 'CM_SlingShotSystem', 'SlingShotSystem', 'Sling Shot');
  const booker    = getStudy(studies, 'ADX + EMA21 Trend Setup', 'Booker Method', 'EMA21 Trend Setup');
  const gpSt      = getStudy(studies, 'GP Zone Exporter', 'GP Zone', 'GP_Zone');
  const ppSt      = getStudy(studies, 'Pocket Pivot');
  const rvolSt    = getStudy(studies, 'RVOL + Volume Z-Score', 'RVOL Ratio', 'RVOL');
  const vdSt      = getStudy(studies, 'Volume Delta');
  const wrbSt     = getStudy(studies, 'WRB Confluence');
  const capStPB   = getStudy(studies, 'CAP Tools Supplement');

  // EMA38 (upper/fast band) and EMA62 (lower/slow band) from SlingShotSystem
  // CM_SlingShotSystem plots SLOW MA first, FAST MA second — both labeled 'Slow MA' in the
  // data window. data.js stores values by numeric index (String(i)) to preserve both.
  // Confirmed: index '1' = EMA38 (fast/upper), index '0' = EMA62 (slow/lower).
  // Named keys kept as fallback for forward compatibility.
  // CM_SlingShotSystem — both bands labeled 'Slow MA' in the data window (duplicate title bug)
  // Index-based lookup is the only reliable method — confirmed May 2026
  // Index '1' = EMA38 (fast/upper band), index '0' = EMA62 (slow/lower band)
  const ema38 = parseNum(getVal(slingShot?.values, '1'));
  const ema62 = parseNum(getVal(slingShot?.values, '0'));

  // From Booker Method indicator
  const ema21     = parseNum(getVal(booker?.values, 'EMA 21', 'EMA21', 'EMA_21'));
  const pb_flag   = parseNum(getVal(booker?.values, 'Pullback', 'PB Flag', 'pb_flag')) >= 1 ? 1 : 0;
  const up_arrow  = parseNum(getVal(booker?.values, 'Breakout', 'Up Arrow', 'Conservative', 'up_arrow')) >= 1 ? 1 : 0;
  const buy_entry = parseNum(getVal(booker?.values, 'Buy Entry', 'Entry', 'buy_entry', 'Breakout'));

  // GP Zone
  const gpFlag = parseNum(getVal(gpSt?.values, 'GP_Flag', 'GP Flag', 'GP flag'));
  const gpTop  = parseNum(getVal(gpSt?.values, 'GP_Top',  'GP Top'));
  const gpBot  = parseNum(getVal(gpSt?.values, 'GP_Bot',  'GP Bot'));

  // Pocket Pivot
  const ppFlag = parseNum(getVal(ppSt?.values, 'Pocket Pivot', 'PP', 'pp_flag'));

  // ATR from WRB for GP proximity
  const atr = parseNum(getVal(wrbSt?.values, 'ATR(14)', 'ATR', 'atr'));

  // RVOL
  let rvol = null;
  if (rvolSt) {
    const rawVol = parseVolStr(getVal(rvolSt.values, 'Volume'));
    const smaVol = parseVolStr(getVal(rvolSt.values, 'SMA(Volume)', 'SMA Volume'));
    if (rawVol != null && smaVol != null && smaVol > 0) {
      rvol = rawVol / smaVol;
    } else {
      rvol = parseNum(getVal(rvolSt.values, 'RVOL ratio', 'RVOL Ratio', 'RVOL', 'ratio'));
    }
  }

  // Volume Delta
  const vd = parseVD(getVal(vdSt?.values, 'Volume Delta', 'Vol Delta', 'Delta'));
  const vdPos = vd != null ? vd > 0 : null;

  // Band slope check: ema38 > ema62 (upper band above lower band)
  const bandValid = ema38 != null && ema62 != null ? ema38 > ema62 : null;

  // CAP Tools Supplement — visual reference (Climax/Strong Demand+Supply)
  const pbCapClimaxDemand = parseNum(getVal(capStPB?.values, 'Climax Demand'));
  const pbCapClimaxSupply = parseNum(getVal(capStPB?.values, 'Climax Supply'));
  const pbCapStrongDemand = parseNum(getVal(capStPB?.values, 'Strong Demand'));
  const pbCapStrongSupply = parseNum(getVal(capStPB?.values, 'Strong Supply'));
  const pbCapDemand = pbCapClimaxDemand > 0 || pbCapStrongDemand > 0;
  const pbCapSupply = pbCapClimaxSupply > 0 || pbCapStrongSupply > 0;

  return {
    sym: s.symbol, price,
    ema38, ema62, ema21,
    pb_flag, up_arrow, buy_entry,
    gpFlag, gpTop, gpBot,
    ppFlag, atr,
    rvol, vd, vdPos,
    bandValid,
    pbCapDemand, pbCapSupply, pbCapClimaxDemand, pbCapClimaxSupply, pbCapStrongDemand, pbCapStrongSupply,
  };
}) : [];

// ── Process ADX Breakout results (from dedicated ADX BREAKOUT layout scan) ──
// ADX BREAKOUT SCREENER + ADX BREAKOUT BRIEF tickers scanned on the ADX Breakout layout.
// "Rob Booker - ADX Breakout DM Final" provides Box Upper/Lower consolidation range.
const adxBriefRaw = adxBriefFile && fs.existsSync(adxBriefFile)
  ? loadFirstJSON(adxBriefFile)
  : null;
const adxRawSyms = adxBriefRaw?.symbols_scanned ?? [];

const adxPageMap = {}; // sym → { bbwp, bbwpMa, basis, bbwp, bookerQualUp, bookerQualDown, adx, diPlus, diMinus, rvol, vd, gpFlag, price }
adxRawSyms.forEach(s => {
  if (s.error) return;
  const studies = s.indicators?.studies || [];
  const price   = s.quote?.last;

  const bookerAdx  = getStudy(studies, 'Rob Booker - ADX Continuation DM', 'ADX Continuation DM', 'Rob Booker - ADX Breakout DM Final', 'ADX Breakout DM');
  const bookerQV   = getStudy(studies, 'Rob Booker-Quality Volume Breakout', 'Quality Volume Breakout');
  const adxSt      = getStudy(studies, 'ADX and DI', 'Average Directional Index', 'ADX');
  const gpSt       = getStudy(studies, 'GP Zone Exporter', 'GP Zone');
  const rvolSt     = getStudy(studies, 'RVOL + Volume Z-Score', 'RVOL Ratio', 'RVOL');
  const vdSt       = getStudy(studies, 'Volume Delta');
  const atrSt      = getStudy(studies, 'Average True Range', 'ATR');
  // Bollinger Bands — provides Basis (SMA20), Upper, Lower
  const bbSt       = getStudy(studies, 'Bollinger Bands');
  // BBWP — Bollinger Band Width Percentile; try common indicator name variants
  const bbwpSt     = getStudy(studies, 'BBWP', 'BB Width Percentile', 'Bollinger Band Width Percentile', 'BBW Percentile');

  const boxUpper      = parseNum(getVal(bookerAdx?.values, 'Box Upper (Active)', 'Box Upper', '0'));
  const boxLower      = parseNum(getVal(bookerAdx?.values, 'Box Lower (Active)', 'Box Lower', '1'));
  const bookerQualUp  = parseNum(getVal(bookerQV?.values,  'Booker Quality Up',   '0'));
  const bookerQualDown= parseNum(getVal(bookerQV?.values,  'Booker Quality Down',  '1'));

  const adx    = parseNum(getVal(adxSt?.values, 'ADX', 'adx', '2'));
  const diPlus = parseNum(getVal(adxSt?.values, 'DI+', '0'));
  const diMinus= parseNum(getVal(adxSt?.values, 'DI-', '1'));

  // GP Zone
  const gpFlag = parseNum(getVal(gpSt?.values, 'GP_Flag', 'GP Flag', '0'));

  // RVOL: "RVOL + Volume Z-Score (Textbook)" exports raw volumes, not ratio — compute it
  let rvol = null;
  if (rvolSt) {
    const rawVol = parseVolStr(getVal(rvolSt.values, 'Volume', 'Volume|0'));
    const smaVol = parseVolStr(getVal(rvolSt.values, 'SMA(Volume)', 'SMA(Volume)|4'));
    if (rawVol != null && smaVol != null && smaVol > 0) rvol = rawVol / smaVol;
  }

  const vd    = parseVD(getVal(vdSt?.values, 'Volume Delta', 'Vol Delta', 'Delta'));

  // ATR: "Average True Range" — kept for potential future use
  const atrVal     = parseNum(getVal(atrSt?.values, 'ATR', '0'));
  const boxRangeATR = (boxUpper != null && boxLower != null && atrVal != null && atrVal > 0)
    ? (boxUpper - boxLower) / atrVal
    : null;

  // Bollinger Bands: Basis = SMA20 centre line
  const basis   = parseNum(getVal(bbSt?.values, 'Basis'));

  // BBWP: primary coiling/extended filter
  const bbwp   = parseNum(getVal(bbwpSt?.values, 'BBWP'));
  const bbwpMa = parseNum(getVal(bbwpSt?.values, 'MA'));

  adxPageMap[s.symbol] = { price, boxUpper, boxLower, boxRangeATR, atrVal, bookerQualUp, bookerQualDown, adx, diPlus, diMinus, rvol, vd, gpFlag, basis, bbwp, bbwpMa };
});

// ── Output mode flags ────────────────────────────────────────────
// Default: clean table output  |  --verbose: original detailed format
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// ── Shared signal sets (used by both output modes) ───────────────
const ts = new Date(brief.generated_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' });

// LORP signals — sourced from LORP Confluence v1.4 indicator flags
const lorp      = results.filter(r => r.strategy === 'LORP');
const lorpWatch = results.filter(r => r.strategy === 'LORP_WATCH');
// ── ADX Breakout BBWP split ───────────────────────────────────────────────────
// Primary filter: BBWP ≤ 5 = coiling, BBWP ≥ 98 = extended, 6–97 = ignored.
// Falls back to ADX < 18 if BBWP indicator is not on the layout.
// Falls back to LORP scan data if no dedicated ADX scan was run at all.
const adxHasDedicatedScan = Object.keys(adxPageMap).length > 0;
const adxHasBBWP = adxHasDedicatedScan && Object.values(adxPageMap).some(r => r.bbwp != null);

// CONTINUATION screen (was coiling): trending name (ADX >= 25), DI confirms direction,
// and price has broken the box. Matches ADX Continuation DM (isBuyValid/isSellValid).
// The 25-40 band cap is applied upstream by the TV Screener, so the brief only floors at 25.
const ADX_TREND = 25;
const adxCoiling = (() => {
  if (!adxHasDedicatedScan) {
    process.stderr.write('[adx] No dedicated ADX scan — falling back to LORP scan (ADX>=25 + DI, no box)\n');
    return results.filter(r => !r.error && r.adx != null && r.adx >= ADX_TREND
      && r.diPlus != null && r.diMinus != null && r.diPlus !== r.diMinus
      && adxUniverseSet.has(r.sym));
  }
  return Object.entries(adxPageMap)
    .filter(([sym, r]) => adxUniverseSet.has(sym) && r.adx != null && r.adx >= ADX_TREND
      && r.diPlus != null && r.diMinus != null && r.price != null
      && r.boxUpper != null && r.boxLower != null
      && ((r.price > r.boxUpper && r.diPlus > r.diMinus)     // long continuation breakout
       || (r.price < r.boxLower && r.diMinus > r.diPlus)))   // short continuation breakout
    .map(([sym, r]) => ({ sym, ...r }));
})();

const adxExtended = adxHasBBWP
  ? Object.entries(adxPageMap)
      .filter(([sym, r]) => adxUniverseSet.has(sym) && r.bbwp != null && r.bbwp >= 98)
      .map(([sym, r]) => ({ sym, ...r }))
  : [];

// Combined set — used by alsoTag(_adxCoilSyms) and secondary references
const adxCoilingAll = [...adxCoiling, ...adxExtended];
const lorpSymSet = new Set(lorp.map(r => r.sym));
// ── Stage classifier for Pullback v2.0 ──
function classifyStage(r) {
  const { price, ema38, ema62, ema21, pb_flag, up_arrow, buy_entry } = r;
  const inBand = price != null && ema62 != null && ema38 != null
    ? price >= ema62 && price <= ema38
    : false;
  const pctAboveEma21 = price != null && ema21 != null && ema21 > 0
    ? (price - ema21) / ema21 * 100
    : null;

  // Entry gate: price must be at or above EMA21 (non-negative %). A negative %
  // means price has pushed back DOWN through EMA21 — a broken pullback, not a
  // valid long entry, so it is not classified as Stage 3.
  const aboveEma21 = pctAboveEma21 != null && pctAboveEma21 >= 0;

  // Stage 3 split (point #2): Breakout (up_arrow signal) vs In-Band (price in
  // EMA38/EMA62 band). Both require price at/above EMA21.
  if (up_arrow === 1 && aboveEma21) {
    return {
      stage: 3,
      kind: 'breakout',
      label: '🟢 BREAKOUT',
      detail: buy_entry != null && buy_entry > 0 ? `Entry $${buy_entry.toFixed(2)}` : 'Breakout',
      pctAboveEma21,
    };
  }
  if (inBand && aboveEma21) {
    return {
      stage: 3,
      kind: 'inband',
      label: '🔵 IN-BAND',
      detail: 'In EMA38/62 band',
      pctAboveEma21,
    };
  }
  if (pb_flag === 1 && pctAboveEma21 != null && pctAboveEma21 >= 0 && pctAboveEma21 <= 3.0) {
    return {
      stage: 2,
      label: '🟠 EMA21',
      detail: `${pctAboveEma21.toFixed(1)}% above EMA21`,
      pctAboveEma21,
    };
  }
  if (pb_flag === 1) {
    return {
      stage: 1,
      label: '🟡 PB',
      detail: pctAboveEma21 != null ? `${pctAboveEma21.toFixed(1)}% above EMA21` : '',
      pctAboveEma21,
    };
  }
  return {
    stage: 0,
    label: '⬜ WATCH',
    detail: pctAboveEma21 != null ? `${pctAboveEma21.toFixed(1)}% above EMA21` : '',
    pctAboveEma21,
  };
}

// ── GP Zone status for Pullback v2.0 ──
function pbGpStatus(gpFlag, gpTop, gpBot, price, atr) {
  if (gpFlag >= 1) return '⛔ IN ZONE';
  if (gpTop == null || atr == null || atr === 0) return gpTop != null ? '—' : '—';
  const nearThreshold = gpTop + atr;
  const gapR = ((price - gpTop) / atr).toFixed(1);
  if (price <= nearThreshold) return `⚠ NEAR (${gapR}R)`;
  return `✓ ${gapR}R`;
}

// Apply stage classification to all processed tickers
const pbWithStage = pbProcessed
  .filter(r => !r.error)
  .map(r => ({ ...r, stageInfo: classifyStage(r) }));

// Hard gate 1: band inverted (suppress row)
// Hard gate 2: inside GP zone (suppress row, add to invalidated list)
// Section gate: only tickers from PULLBACK SCREENER or PULLBACK BRIEF sections
const pbInvalidatedGP = pbWithStage.filter(r => r.gpFlag >= 1);
const pullbackAll = pbWithStage.filter(r =>
  (pullbackScreenerSet.has(r.sym) || pullbackBriefSet.has(r.sym)) &&  // section gate
  r.bandValid !== false &&   // gate 1: band must not be inverted
  (r.gpFlag == null || r.gpFlag < 1)  // gate 2: not inside GP zone
);

// Pullback-UNIQUE: passes pullback screen but not already in LORP full confluence
const pullbackUnique = pullbackAll.filter(r => !lorpSymSet.has(r.sym));
const neutral   = results.filter(r => r.strategy === 'NEUTRAL');
const errors    = results.filter(r => r.error);

// ── Cross-strategy membership sets (for "Also" column) ──────────────
// SID sets built later (sidLongs/sidShorts defined inside table block) —
// we use deferred sets populated at render time via a closure.
const _sidLongSyms  = new Set();
const _sidShortSyms = new Set();
const _pbStage123   = new Set(pullbackAll.filter(r => r.stageInfo?.stage >= 1).map(r => r.sym));
const _adxCoilSyms  = new Set(adxCoilingAll.map(r => r.sym));
// lorpSymSet already defined above

function alsoTag(sym, excludeStrategy) {
  const tags = [];
  if (excludeStrategy !== 'LORP'     && lorpSymSet.has(sym))   tags.push('LORP');
  if (excludeStrategy !== 'SID_LONG' && _sidLongSyms.has(sym)) tags.push('SID↑');
  if (excludeStrategy !== 'SID_SHORT'&& _sidShortSyms.has(sym))tags.push('SID↓');
  if (excludeStrategy !== 'PB'       && _pbStage123.has(sym))  tags.push('PB');
  if (excludeStrategy !== 'ADX'      && _adxCoilSyms.has(sym)) tags.push('BO');
  return tags.length ? tags.join(' ') : '—';
}

// David (28 Aug 2026): moved here from near the SID section (~line 1700). Function
// hoisting assigns the value only when execution REACHES that line — the old spot ran
// after the LORP table already needed it (LORP prints before SID in the script), so
// baseTicker was still `undefined` when normalizeSrc() called it. True top-level,
// before first use, fixes it regardless of print order. (Second time this exact class
// of bug has bitten this file — see the SID Market Breadth retirement note too.)
function baseTicker(sym) { return sym.includes(':') ? sym.split(':')[1] : sym; }

function normalizeSrc(r) {
  if (r.inBTW) return 'BTW';
  if (r.inSIDScreener || r.inSIDBrief) return 'SID';
  const sec = (tickerSection[baseTicker(r.sym)] || '').toUpperCase();
  if (sec.includes('LORP')) return 'LORP';
  // PB/BO/CAP branches removed (David, 10 Sep 2026) — corresponded to watchlist sections
  // (standalone Pullback/ADX Breakout scans, CAP) retired months ago; dead code paths that
  // no longer actually trigger.
  if (sec.includes('SID')) return 'SID';
  if (sec.includes('BTW')) return 'BTW';
  // Claude (16 Sep 2026): "TV REMIX" (David's tvremix.xyz dashboard picks, added to the
  // watchlist ~15 Sep) fell through to the generic fallback below, which takes the section
  // name's first word -- "TV REMIX".split(' ')[0] = "TV". That's why tickers from this
  // section were showing Src "TV" instead of a watchlist-section tag: it's not a new data
  // source, it's this section going unrecognised. Explicit case, same style as SID/LORP/BTW.
  if (sec.includes('TV REMIX')) return 'TVX';
  return sec ? sec.split(' ')[0] : 'OTHER';
}

function gpCaution(rows) {
  const near = (rows || []).filter(r => r.gpFlag === 1 || r.gpFlag === 2);
  if (!near.length) return;
  console.log('');
  console.log(`> GP zone proximity (invalidation reference): ${near.map(r => `${r.sym} (${r.gpFlag === 2 ? 'IN' : 'NEAR'})`).join(', ')}`);
}

// ── Helpers for table formatting ─────────────────────────────────
function fmt(n, decimals = 2) { return n != null ? n.toFixed(decimals) : '—'; }
function fmtPct(n) { return n != null ? (n >= 0 ? '+' : '') + n.toFixed(1) + '%' : '—'; }
function div(char, n) { return char.repeat(n); }
function gpLabel(gpFlag) {
  if (gpFlag === 2) return '🟢 GP: IN';
  if (gpFlag === 1) return '🟡 GP: NEAR';
  return '';
}

// LORP Confluence v1.2 — Tier 2 breakdown for Watch tickers
// Shows which of the calculable Tier 2 factors are passing or failing
function lorpT2Breakdown(r) {
  const factors = [];
  if (r.bbPct != null) {
    factors.push(r.bbPct > 0.5 ? '%B ✓' : '%B ✗');
  }
  if (r.aroon != null) {
    factors.push(r.aroon > 0 ? 'Aroon ✓' : 'Aroon ✗');
  }
  if (r.macd != null && r.macdSig != null) {
    factors.push(r.macd > r.macdSig ? 'MACD ✓' : 'MACD ✗');
  }
  if (r.rvol != null && r.vdPos != null) {
    factors.push((r.rvol >= 0.8 && r.vdPos === true) ? 'Vol ✓' : 'Vol ✗');
  }
  // WRB removed as a confluence factor (David, 10 Sep 2026): "almost irrelevant... not a factor."
  // r.wrbInPrior is left computed elsewhere (still shown as a raw context column) but no longer
  // contributes to this factor breakdown.
  return factors.length ? factors.join(' · ') : 'breakdown n/a';
}

// ══════════════════════════════════════════════════════════════════
// MARKDOWN OUTPUT (default)
// ══════════════════════════════════════════════════════════════════
if (!VERBOSE) {

  const scanned = results.filter(r => !r.error).length;
  const dateStr = new Date(brief.generated_at).toLocaleString('en-AU', {
    timeZone: 'Australia/Brisbane', weekday: 'short', day: '2-digit',
    month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // ── Header ──
  console.log(`## 📊 MORNING BRIEF — ${dateStr} · ${scanned} scanned\n`);

  // ── LORP ──
  console.log('---\n');
  const lorpAll = results.filter(r => !r.error && r.strategy === 'LORP').filter(r => {
  if (isFundOrTrust(r.sym)) { process.stderr.write(`[LORP rejected] ${r.sym}: fund/trust (sector=Miscellaneous), not a real equity for LORP\n`); return false; }
  return true;
});

  // Split by source section — deduplicate LORP BRIEF against LORP SCREENER
  const lorpScreener = lorpAll.filter(r => lorpScreenerSet.has(r.sym));
  const lorpBriefTickers = lorpAll.filter(r => lorpBriefSet.has(r.sym) && !lorpScreenerSet.has(r.sym));
  const lorpOther = lorpAll.filter(r => !lorpScreenerSet.has(r.sym) && !lorpBriefSet.has(r.sym));

  // Screener comparison — which screener tickers are in the brief?
  const screenerMatched = [...lorpScreenerSet].filter(t => lorpAll.find(r => r.sym === t));
  const screenerMissed  = [...lorpScreenerSet].filter(t => !lorpAll.find(r => r.sym === t));

  const totalLorp = lorpScreener.length + lorpBriefTickers.length;

  // Apply brief-level filters to get true candidate counts.
  // PRECEDENCE: a fired LC entry (Buy) is the anchor — it always passes. RVOL/VD/MACD0 are
  // context that annotate the row, never gates that remove it. Non-fired screener rows still
  // get the RVOL sanity bounds (they're trend candidates, not confirmed entries).
  function applyBriefFilters(tickers) {
    return tickers.filter(r => {
      if (r.lorpBuySignal || r.lorpSellSignal) return true;   // fired entry — never filtered
      if (r.entryType === 'No LC data') return false;
      if (r.rvol != null && r.rvol < 1.0) return false;
      if (r.rvol != null && r.rvol >= 4) return false;
      // Aroon demoted to context only — not a hard filter (redundant with MA stack for LORP)
      return true;
    });
  }
  // Fired LC entries sitting in OTHER watchlist sections (caught now the scan reads all
  // sections). They anchor regardless of section; the Also column tags where they came from.
  const lorpFiredOther = lorpOther.filter(r => r.lorpBuySignal || r.lorpSellSignal);
  const lorpScreenerFiltered = applyBriefFilters(lorpScreener);
  const lorpBriefFiltered    = applyBriefFilters(lorpBriefTickers);
  const lorpFiredOtherFiltered = applyBriefFilters(lorpFiredOther);
  const allLorpFiltered = [...lorpScreenerFiltered, ...lorpBriefFiltered, ...lorpFiredOtherFiltered];
  // Actionable = LONG (LORP is long-only) AND (fired LC Buy / Pullback entry) OR MACD0 in the
  // -1..+2 band. The band keeps near-the-cross momentum and excludes EXTENDED names (MACD0 > 2,
  // e.g. MTZ 6.08) and deep-below (< -1). Extended/out-of-band non-fired rows drop to context.
  const macd0Band = r => { const m = (r.macd != null && r.macdSig != null) ? (r.macd - r.macdSig) : null; return m != null && m >= -1 && m <= 2; };
  const isBuyVD  = r => r.lorpBuySignal === true;  // #1 (Jul 2026): actionable = LC entry signal (VD no longer used as a gate)
  const filteredBuyVD  = allLorpFiltered.filter(isBuyVD).length;
  const filteredSellVD = allLorpFiltered.filter(r => !isBuyVD(r)).length;
  const totalFiltered  = filteredBuyVD + filteredSellVD;

  if (totalFiltered === 0) {
    console.log('**✅ LORP — 0 candidates** *(TV Screener returned no tickers passing brief filters)*\n');
  } else {
    console.log(`**✅ LORP — ${filteredBuyVD} LC entries** *(actionable; +${filteredSellVD} context = no live entry)*`);
    console.log('*Pre-filtered by TV Screener + brief filters — check chart before acting*\n');
    console.log('*Type: Pullback = LC entry + Standard/Strong reversion within 4 bars (incl. entry bar) · Breakout = ADX>25 & rising · RVOL>1.2 · D+ rising · raw ATR>2 · MACD>0 · Trend = ADX>20 · MACD>0 · RVOL>0.8. MACD0 ✓ above / below Signal · EXT = above LC Upper Envelope Far.*\n');
  }

  function lorpRowCells(r) {
    // Pullback entries: negative VD is expected (pullback IS the selling pressure) — show as note not warning
    const isPullback = r.entryType?.startsWith('Pullback');
    const vdStr = r.vdPos === true  ? 'Buy ✓'
                : r.vdPos === false && isPullback
                  ? `↓ (PB ${r.vd != null ? r.vd.toFixed(0) : ''})`
                : r.vdPos === false ? 'Sell ⚠️'
                : '—';
    const atrStr   = r.atrPct != null ? r.atrPct.toFixed(1) + '%' : '—';
    const rvolStr  = r.rvol   != null ? r.rvol.toFixed(1) : '—';
    const aroonStr = r.aroon != null ? r.aroon.toFixed(0) : '—';
    // MACD0 (MACD vs Signal histogram) — the validated LORP entry gate (flag, not filter).
    // Shows ✓ above / (no marker) below, with histogram value so a narrowing (converging)
    // gap is visible. David (26 Aug 2026): dropped the ⚠️ on negative values — Pullback
    // rows are EXPECTED to be negative here, so a warning glyph was noise, not signal.
    const macd0Str = (r.macd != null && r.macdSig != null)
      ? (r.macd >= r.macdSig ? `✓ ${(r.macd - r.macdSig).toFixed(2)}` : `${(r.macd - r.macdSig).toFixed(2)}`)
      : '—';
    // Cf = context-alignment tally (0–N). NOT validated as predictive (26-trade study:
    // only MACD0 separated winners/losers). Supporting "is everything pointing the same
    // way" colour only — never a gate. Long-bias checks: ADX≥25&DI+>DI-, Aroon>0, RVOL≥1, ATR%<5.
    const cfChecks = [
      (r.adx != null && r.diPlus != null && r.diMinus != null) ? (r.adx >= 25 && r.diPlus > r.diMinus) : null,
      r.aroon  != null ? r.aroon > 0   : null,
      r.rvol   != null ? r.rvol >= 1.0 : null,
      r.atrPct != null ? r.atrPct < 5  : null,
    ].filter(c => c !== null);
    const cfStr = cfChecks.length ? `${cfChecks.filter(c => c).length}/${cfChecks.length}` : '—';
    const wrbStr   = r.wrbInPrior === true ? 'WRB ✓' : r.wrbInPrior === false ? '✗' : '—';
    // Sig column — FRESH signals this bar only. Markers already present for this
    // ticker in the most recent prior brief are filtered as carried-over (held), so
    // indicators that hold their plotted value for ~2 bars (Pocket Pivot, CAP) no
    // longer surface stale fires. Display-layer only — underlying flags are untouched.
    const _prevSig = prevSigMap[r.sym];
    const _fresh   = (code) => !(_prevSig && _prevSig.has(code));
    const sigParts = [];
    let carriedOver = 0;
    const addSig = (cond, code, label) => {
      if (!cond) return;
      if (_fresh(code)) sigParts.push(label);
      else carriedOver++;
    };
    // David (27 Aug 2026): a native +1 code IS a fired LC entry — show 🟢 LC for it too,
    // not just the separately-tracked lorpBuySignal flag (they should usually coincide,
    // but the native code is the authoritative signal per the Trend/Pullback tables).
    addSig(r.lorpBuySignal || r.backtestStream === 1,           'LC',   '🟢 LC');
    addSig(r.lorpSellSignal,                                    'LCs',  '🔴 LC');
    // Aroon [BigBeluga] Sig markers removed (David, 4 Sep 2026) — Aroon being removed
    // from the LORP chart entirely, per the WT3D+OBV/ADX-vs-Aroon confirmation test.
    // Aroon fields (r.aroon, r.aroonLong etc.) are left in place elsewhere in this file
    // since they already degrade gracefully to null/blank once the study is gone from
    // the chart — no crash risk, so not worth the surgery of removing them everywhere.
    addSig(r.pocketPivot === true,                             'PP',   '★ PP');
    addSig(r.capClimaxDemand > 0,                              'CD',   '🔥 CD');
    addSig(r.capStrongDemand > 0,                              'SD',   '💪 SD');
    addSig(r.capClimaxSupply > 0,                              'CS',   '🔥 CS');
    addSig(r.capStrongSupply > 0,                              'SS',   '💪 SS');
    // David (28 Aug 2026): mirrors the exact Trend classification already built into
    // the "ADX and DI for v4 Wilder Table" Pine indicator itself (ADX>20 and DI gap>=5
    // in either direction) — same thresholds, same source study, just read here too.
    // David (10 Sep 2026): ADX threshold 20->25 for consistency with what he considers a
    // genuine "trending" LORP ticker (e.g. BRO was showing the marker below 25, which he
    // flagged as inconsistent).
    addSig(r.adx != null && r.adx > 25 && r.diPlus  != null && r.diMinus != null && (r.diPlus  - r.diMinus) >= 5, 'ADX_U', '🟢 ADX');
    addSig(r.adx != null && r.adx > 25 && r.diPlus  != null && r.diMinus != null && (r.diMinus - r.diPlus)  >= 5, 'ADX_D', '🔴 ADX');
    // David (28 Aug 2026): WaveTrend 3D's own Bullish/Bearish Cross dot markers.
    addSig(r.wtBullCross !== null, 'WT_U', '🟢 WT');
    addSig(r.wtBearCross !== null, 'WT_D', '🔴 WT');
    let sigStr = sigParts.length ? sigParts.join(' ') : '—';
    if (carriedOver > 0) sigStr += `${sigParts.length ? ' ' : ''}·${carriedOver}c`;  // ·Nc = N carried-over (held from prior brief)
    const distStr  = r.distFromKernel != null ? r.distFromKernel.toFixed(2) : '—';
    const rangePct = (r.high != null && r.low != null && r.low > 0)
      ? ((r.high - r.low) / r.low * 100).toFixed(1) + '%' : '—';
    // PB% = change from open (intraday move) — prev_close not available from TV MCP
    const pbDepth  = (r.price != null && r.open != null && r.open > 0)
      ? ((r.price - r.open) / r.open * 100).toFixed(1) + '%' : '—';
    const ma1Str    = r.ma1      != null ? r.ma1.toFixed(2)      : '—';
    const ma2Str    = r.ma2      != null ? r.ma2.toFixed(2)      : '—';
    const chandStr  = r.chandStop!= null ? r.chandStop.toFixed(2): '—';
    // ADX + DI+ / DI- with direction vs prior brief
    const prevAdx  = prevAdxMap[r.sym];
    const adxDelta = prevAdx != null ? r.adx - prevAdx : null;
    const adxDir   = adxDelta != null ? (adxDelta > 0.5 ? '↑' : adxDelta < -0.5 ? '↓' : '→') : '';
    const adxStrength = adxDelta != null
      ? (Math.abs(adxDelta) >= 3 ? ` (${adxDelta > 0 ? '+' : ''}${adxDelta.toFixed(1)} ●●)`
       : Math.abs(adxDelta) >= 1 ? ` (${adxDelta > 0 ? '+' : ''}${adxDelta.toFixed(1)} ●)`
       : adxDir !== '' ? ` (${adxDelta > 0 ? '+' : ''}${adxDelta.toFixed(1)})` : '')
      : '';
    const adxStr   = r.adx != null ? `${r.adx.toFixed(1)}${adxDir}${adxStrength}` : '—';
    const prevDiP  = prevDiPlusMap[r.sym];
    const prevDiM  = prevDiMinusMap[r.sym];
    const diPDir   = (r.diPlus  != null && prevDiP  != null) ? (r.diPlus  > prevDiP  ? '↑' : r.diPlus  < prevDiP  ? '↓' : '→') : '';
    const diMDir   = (r.diMinus != null && prevDiM  != null) ? (r.diMinus > prevDiM  ? '↑' : r.diMinus < prevDiM  ? '↓' : '→') : '';
    const diPStr   = r.diPlus  != null ? `${r.diPlus.toFixed(1)}${diPDir}`  : '—';
    const diMStr   = r.diMinus != null ? `${r.diMinus.toFixed(1)}${diMDir}` : '—';
    const bbStr = r.bbPct != null
      ? r.bbPct > 1.0  ? `${r.bbPct.toFixed(2)} ↑BB`
      : r.bbPct >= 0.5 ? `${r.bbPct.toFixed(2)} ✓`
      : r.bbPct >= 0.0 ? `${r.bbPct.toFixed(2)} ⚠️`
      : `${r.bbPct.toFixed(2)} ↓BB`
      : '—';
    // David (26 Aug 2026): dropped the ⚠️ — extended-above is expected context for
    // Pullback rows too, treating it as a warning was noise, not signal.
    // David (6 Sep 2026): for Pullback-table rows, show which specific reversion type
    // applies (Standard/Strong Upward/Downward MR, Upward/Downward First Pullback) using
    // the native code label, rather than the generic Dist-based "Trend/Pullback" text —
    // the generic label doesn't distinguish which reversion condition actually fired.
    const entryStr = (r.lorpNativeTable === 'Pullback' && r.lorpNativeLabel ? r.lorpNativeLabel : (r.entryType ?? '—'))
      + (r.extendedAbove === true ? ' EXT' : '');
    // David (28 Aug 2026): Also column removed, Src column added (matches SID table's
    // source-watchlist-section tag via normalizeSrc, defined near alsoTag above).
    // David (4 Sep 2026): dropped the "⚠ Aroon" override — Aroon being removed from the
    // LORP chart entirely, so r.aroon is always null going forward and this branch would
    // never fire anyway. Explicit removal here rather than relying on that silently.
    // David (9 Sep 2026): Sig moved to the front of the row, matching SID's layout
    // (Ticker, Sig, Price, ...) instead of sitting after ADX.
    // David (10 Sep 2026): Score column removed entirely — lorpScore() has returned '—'
    // unconditionally since 13 Jul 2026 (every factor tested against 128 real adapter
    // trades failed; see the withdrawal note above). Confirmed dead, not worth keeping.
    // David (10 Sep 2026): DI+/DI- values now displayed for LORP too (matches SID's existing
    // "DI" column format) — previously only the raw ADX number was shown, DI+/DI- were used
    // internally for the 🟢/🔴 ADX marker but never surfaced as their own data.
    const diStr = (r.diPlus != null && r.diMinus != null) ? `${r.diPlus.toFixed(0)}/${r.diMinus.toFixed(0)}` : '—';
    // Claude (16 Sep 2026): backtestStream's SIGN does not track bullish/bearish
    // consistently across all native codes -- Long/Short (+-1) and First Pullback (+-3)
    // do follow sign (positive = Long/Upward), but Standard/Strong MR is INVERTED: +4/+5
    // = 'Downward MR' (bearish) and -4/-5 = 'Upward MR' (bullish). The old sign-only check
    // tagged every MR row backwards, so the Sector Supported/Unsupported column was
    // computed against the wrong direction for the entire LORP Screener - Pullback table
    // (e.g. KR/GRDN showed Unsupported when Supported was correct, and vice versa for
    // MLTX/GE). Map from the actual code instead of its sign.
    const LORP_BULLISH_CODES = new Set([1, 3, -4, -5]);   // LORP Long, Upward First Pullback, Upward MR
    const LORP_BEARISH_CODES = new Set([-1, -3, 4, 5]);   // LORP Short, Downward First Pullback, Downward MR
    const lorpDirection = LORP_BULLISH_CODES.has(r.backtestStream) ? 'long'
                        : LORP_BEARISH_CODES.has(r.backtestStream) ? 'short'
                        : null;
    const sectorStr = sectorTagDisplay(bareSym(r.sym), lorpDirection);
    const sectorNameStr = sectorNameDisplay(bareSym(r.sym));
    return [r.sym, sigStr, `$${fmt(r.price)}`, entryStr, macd0Str, distStr, adxStr, diStr, normalizeSrc(r), sectorNameStr, sectorStr];
  }

  const lorpHeaders = ['Ticker', 'Sig', 'Price', 'Type', 'MACD0', 'Dist', 'ADX', 'DI', 'Src', 'Sector', 'Sector Support'];
  const lorpRightAlign = new Set([2, 5]);  // Price, Dist right-aligned (shifted after Sig moved to index 1); tag columns left-aligned
  // Fixed-width monospace grid (same renderer as the SID table) so columns line up under the
  // headers in any viewer, not only a markdown renderer. Context columns (Cf/ADX/RVOL/Aroon/
  // %B/ATR%/MAs/Chandelier) moved off the table — read them on the chart or via confluence_check.py.
  function printLorpTable(rows) {
    const cells = rows.map(lorpRowCells);
    const widths = lorpHeaders.map((h, i) => Math.max(h.length, ...cells.map(c => String(c[i]).length)));
    const pad = (x, i) => { const sx = String(x); const g = Math.max(0, widths[i] - sx.length); return lorpRightAlign.has(i) ? ' '.repeat(g) + sx : sx + ' '.repeat(g); };
    console.log('| ' + lorpHeaders.map((h, i) => pad(h, i)).join(' | ') + ' |');
    console.log('|-' + widths.map(w => '-'.repeat(w)).join('-|-') + '-|');
    cells.forEach(c => console.log('| ' + c.map((x, i) => pad(x, i)).join(' | ') + ' |'));
  }

  const sortLorp = arr => [...arr].sort((a, b) => {
    // #3 (Jul 2026): LC entry signal first, then ADX (desc), then distance-from-kernel (asc).
    const fired = r => (r.lorpBuySignal || r.lorpSellSignal) ? 0 : 1;
    const fDiff = fired(a) - fired(b);
    if (fDiff !== 0) return fDiff;
    const adxA = a.adx != null ? a.adx : -Infinity, adxB = b.adx != null ? b.adx : -Infinity;
    if (adxB !== adxA) return adxB - adxA;
    const dA = a.distFromKernel != null ? a.distFromKernel : Infinity;
    const dB = b.distFromKernel != null ? b.distFromKernel : Infinity;
    return dA - dB;
  });

  function printLorpSection(tickers, label) {
    if (tickers.length === 0 && label !== 'LORP Screener') return;

    // ── Brief-level filters (applied after TV Screener) ──────────
    // 2. Exclude No LC data
    // 4. RVOL < 4 (exclude extreme RVOL)
    // 5. Aroon > 50
    // 6. Breakout (Dist>1.5) requires 2+ consecutive WRB (wrbPrior >= 2)
    // 7. VD > 0.5 for Buy (positive VD confirmed)
    const filtered = tickers.filter(r => {
      const buy  = r.lcBuy     != null ? r.lcBuy.toFixed(2)     : r.lorpBuySignal  ? '✓' : '0';
      const sell = r.lcSell    != null ? r.lcSell.toFixed(2)    : r.lorpSellSignal ? '✓' : '0';
      const rvol  = r.rvol  != null ? r.rvol.toFixed(2)  : 'n/a';
      const aroon = r.aroon != null ? r.aroon.toFixed(1) : 'n/a';
      const vd    = r.vd    != null ? r.vd.toFixed(2)    : 'n/a';
      // PRECEDENCE: a fired LC entry anchors the row — it is never filtered out. RVOL/VD only
      // annotate. (Pre-fix, AVLV's fired Buy @ $90.79 was dropped here for RVOL 0.53 < 1.0.)
      if (r.lorpBuySignal || r.lorpSellSignal) return true;
      if (r.entryType === 'No LC data')                                               { process.stderr.write(`[LORP rejected] ${r.sym}: No LC data  Buy=${buy} Sell=${sell} RVOL=${rvol} Aroon=${aroon} VD=${vd}\n`); return false; }
      // David (10 Sep 2026): RVOL floor 1.0->0.8 for consistency - note this doesn't actually
      // affect Trend rows (they bypass this filter entirely via the fired-signal precedence
      // above), only Pullback/other non-signal rows.
      if (r.rvol != null && r.rvol < 0.8)                                             { process.stderr.write(`[LORP rejected] ${r.sym}: RVOL too low  Buy=${buy} Sell=${sell} RVOL=${rvol} Aroon=${aroon} VD=${vd}\n`); return false; }
      if (r.rvol != null && r.rvol >= 4)                                              { process.stderr.write(`[LORP rejected] ${r.sym}: RVOL too high  Buy=${buy} Sell=${sell} RVOL=${rvol} Aroon=${aroon} VD=${vd}\n`); return false; }
      // Aroon demoted to context only — not a hard filter for LORP
      // WRB requirement removed — WRB shown as context column only
      return true;
    });

    // David (26 Aug 2026): replaced the Buy VD / Sell VD split with Trend / Pullback,
    // reusing the entryType field already computed per-row (Pullback/Trend/Breakout,
    // see the Type legend above). Breakout folds into the Trend stream — both are
    // momentum-continuation, as opposed to Pullback's mean-reversion character.
    // Rows with no specific type ("—") also fall into Trend as a residual bucket,
    // matching how they previously fell into the old catch-all Sell VD list.
    // David (9 Sep 2026): Trend table was showing every RVOL-passed, non-Pullback-classified
    // row (~64 tickers on a normal day) — the old entryType/Dist-based residual bucket, not
    // an actual signal filter. Intent was always "only tickers that fired a genuine LORP
    // entry" (the same 🟢/🔴 LC marker shown in Sig). Restricted accordingly. Pullback logic
    // deliberately left untouched — David confirmed that side is working as intended.
    let pullbackTickers = filtered.filter(r => r.entryType?.startsWith('Pullback'));
    let trendTickers    = filtered.filter(r => r.lorpBuySignal || r.lorpSellSignal);

    // David (27 Aug 2026): "combine" the old entryType-based Trend/Pullback tables with
    // the native-code Trend/Pullback tables — one section each, not two competing ones.
    // Folded into the main "LORP Screener" section only (the other two calls — Watch List
    // carry-forward and Fired-entry-other-section — keep their own narrower populations,
    // so this doesn't duplicate rows across sections). Any lorpAll row with a genuine
    // native Trend/Pullback code that isn't already present here gets unioned in.
    if (label === 'LORP Screener') {
      const alreadyShown = new Set(filtered.map(r => r.sym));
      const nativeOnly = lorpAll.filter(r => r.lorpNativeTable && !alreadyShown.has(r.sym));
      trendTickers    = [...trendTickers,    ...nativeOnly.filter(r => r.lorpNativeTable === 'Trend')];
      pullbackTickers = [...pullbackTickers, ...nativeOnly.filter(r => r.lorpNativeTable === 'Pullback')];
    }

    if (trendTickers.length > 0) {
      console.log(`*${label} — Trend (${trendTickers.length}):*\n`);
      printLorpTable(sortLorp(trendTickers));
      console.log('');
    }
    if (pullbackTickers.length > 0) {
      console.log(`*${label} — Pullback (${pullbackTickers.length}):*\n`);
      printLorpTable(sortLorp(pullbackTickers));
      console.log('');
    }
  }

  { const _rs = readReminders('lorp'); if (_rs.length) console.log('\n' + _rs.map(x => `\uD83D\uDCCC ${x}`).join('\n') + '\n'); }
  printLorpSection(lorpScreener, 'LORP Screener');
  printLorpSection(lorpBriefTickers, 'Watch List (carry forward)');
  // Fired LC entries that live in another watchlist section (e.g. LFST in SID SCREENER).
  // Surfaced now the scan reads all sections; the Also column shows section-of-origin.
  printLorpSection(lorpFiredOther, 'Fired entry — other section');

  // Screener comparison
  if (lorpScreenerSet.size > 0) {
    console.log(`*📊 Screener match: ${screenerMatched.length}/${lorpScreenerSet.size} tickers scanned*`);
    if (screenerMissed.length > 0) {
      console.log(`*⚠️ Not in scan: ${screenerMissed.join(' · ')}*`);
    }
    console.log('');
  }

  // David (27 Aug 2026): separate native-code Trend/Pullback tables retired — folded into
  // the "LORP Screener" section above (see printLorpSection). lorpPullbackRows kept as the
  // authoritative native-Pullback set feeding Brief Output below ("watched as a set").
  const lorpPullbackRows = lorpAll.filter(r => r.lorpNativeTable === 'Pullback').sort((a, b) => a.sym.localeCompare(b.sym));

  // ── Persistent LORP Watchlist — update + output ──────────────────
  // David (10 Sep 2026): repurposed from tracking LC entries (Trend) to tracking Pullback/
  // reversion signals instead. Trend entries should be shown once and never repeated (#5,
  // confirmed) — no persistence layer feeds Trend at all anymore. Pullback tickers persist
  // up to 5 trading days since reversions take time to develop (#1, "happy with 5" as a max).
  // Old watchlist entries from the prior (LC-entry) scheme will self-expire within 5 days
  // since they won't match today's Pullback classification — no manual reset needed.
  {
    // Today's brief date
    const briefDateStr = (brief.generated_at
      ? new Date(brief.generated_at).toISOString()
      : new Date().toISOString()).split('T')[0];

    const todayPullback = lorpAll.filter(r => r.lorpNativeTable === 'Pullback');
    const todayPullbackSyms = new Set(todayPullback.map(r => bareSym(r.sym)));

    const lorpWatchlist = loadLorpWatchlist();

    // Step 1: Add/refresh Pullback tickers seen today
    for (const r of todayPullback) {
      const sym = bareSym(r.sym);
      if (!lorpWatchlist[sym] || lorpWatchlist[sym].status !== 'active') {
        lorpWatchlist[sym] = {
          first_seen:      briefDateStr,
          last_seen:       briefDateStr,
          pb_first_date:   briefDateStr,
          pb_first_price:  r.price,
          pb_native_label: r.lorpNativeLabel || null,
          status:          'active',
        };
        process.stderr.write(`[watchlist] Added: ${sym} @ $${r.price?.toFixed(2)} on ${briefDateStr} (${r.lorpNativeLabel || 'Pullback'})\n`);
      } else {
        lorpWatchlist[sym].last_seen = briefDateStr;
        if (r.lorpNativeLabel) lorpWatchlist[sym].pb_native_label = r.lorpNativeLabel;
      }
    }

    // Bare-symbol set of current LORP SCREENER membership (for evict-on-drop check)
    const screenerBareSet = new Set([...lorpScreenerSet].map(t => bareSym(t)));

    // Step 2: Check active entries for exit / expiry
    for (const [sym, entry] of Object.entries(lorpWatchlist)) {
      if (entry.status !== 'active') continue;
      const r = lorpAll.find(t => bareSym(t.sym) === sym);
      if (r) entry.last_seen = briefDateStr;
      // Evict: name has dropped out of LORP SCREENER entirely
      if (!screenerBareSet.has(sym)) {
        entry.status = 'dropped';
        process.stderr.write(`[watchlist] Dropped: ${sym} — no longer in LORP SCREENER on ${briefDateStr}\n`);
        continue;
      }
      // Fired: an LC entry has fired for this ticker — David (13 Sep 2026): once a
      // Pullback fires an actual entry it's his call to act on or not, immediately,
      // not something to keep carrying forward. Evict right away, not on the 5-day
      // expiry timer (which is for reversions that never fire at all).
      if (r && (r.lorpBuySignal || r.lorpSellSignal)) {
        entry.status = 'fired';
        process.stderr.write(`[watchlist] Fired: ${sym} — LC entry fired on ${briefDateStr}, removed from watch\n`);
        continue;
      }
      // Expire: 5 trading bars since first_seen with no Pullback classification today
      const bars = countTradingDays(entry.first_seen, briefDateStr);
      if (bars > 5 && !todayPullbackSyms.has(sym)) {
        entry.status = 'expired';
        process.stderr.write(`[watchlist] Expired: ${sym} — ${bars} bars since ${entry.first_seen}\n`);
      }
    }

    // Step 3: Save updated watchlist
    saveLorpWatchlist(lorpWatchlist);

    // Step 4: Output section
    const activeWatch = Object.entries(lorpWatchlist)
      .filter(([, e]) => e.status === 'active')
      .sort((a, b) => a[1].first_seen.localeCompare(b[1].first_seen));

    if (activeWatch.length > 0) {
      console.log('---\n');
      console.log(`**📋 LORP PULLBACK WATCH — ${activeWatch.length} tickers**`);
      console.log('*Tracks reversion tickers for up to 5 trading days while the pullback develops*\n');
      console.log('| Ticker | Price | Days | First Seen | Entry $ | Type | Status |');
      console.log('|--------|-------|------|------------|---------|------|--------|');

      for (const [sym, entry] of activeWatch) {
        const r = lorpAll.find(t => bareSym(t.sym) === sym);

        const priceStr  = r?.price != null ? `$${fmt(r.price)}` : '—';
        const days      = countTradingDays(entry.first_seen, briefDateStr);
        const seenDate  = entry.first_seen
          ? new Date(entry.first_seen + 'T00:00:00')
              .toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
          : '—';
        const entryPrice = entry.pb_first_price != null ? `$${entry.pb_first_price.toFixed(2)}` : '—';
        const typeStr     = entry.pb_native_label || r?.lorpNativeLabel || '—';
        const statusStr   = r ? 'Active' : 'Active ⚠ not in scan';

        console.log(`| ${sym} | ${priceStr} | ${days} | ${seenDate} | ${entryPrice} | ${typeStr} | ${statusStr} |`);
      }
      console.log('');

      // Show recent exits/expirations (last 5 trading days)
      const recentGone = Object.entries(lorpWatchlist)
        .filter(([, e]) => e.status === 'exited' || e.status === 'expired')
        .filter(([, e]) => countTradingDays(e.last_seen ?? e.first_seen, briefDateStr) <= 5);
      if (recentGone.length > 0) {
        console.log(`*Recent exits: ${recentGone.map(([s, e]) => `${s} (${e.status})`).join(' · ')}*\n`);
      }
    }

    // Expose updated watchlist for sidecar generation below
    // (used to include active persistent tickers in LORP BRIEF push)
    Object.defineProperty(globalThis, '_lorpWatchlist', { value: lorpWatchlist, configurable: true });
  }

  // ── SID Market Breadth (ETF vs Stock OB/OS counts) — retired 27 Aug 2026 ──
  // David: "not needed as it shows in the tables below" (same counts derivable from the
  // Long/Short candidate tables). Wrapped rather than deleted, matching this file's own
  // convention for retired sections (see the Pullback section above).
  // NOTE (28 Aug 2026): baseTicker() moved to true top-level scope, near normalizeSrc()
  // (~line 1250) — it's needed there now too, and needs to exist BEFORE that point in
  // execution order, not just outside any dead block. See the comment at its new
  // location for the full story; this is the second time this class of bug has bitten
  // this file, so it's staying documented in both places.
  if (false) {
  console.log('---\n');
  {
    const sidScanned = sidResults.filter(r => !r.error && (r.wrsi != null || r.sidArmedLong != null || r.sidArmedShort != null || r.adx != null));
    // Use all scanned SID results that have RSI data to calculate breadth
    // OB = armed short (RSI has been >= 70), OS = armed long (RSI has been <= 30)
    const allSidScanned = sidResults.filter(r => !r.error);

    // Split by ETF vs stock using etfUniverse from rules.json
    // Extract base ticker (strip exchange prefix if present e.g. NASDAQ:AAPL → AAPL)
    function baseTicker(sym) { return sym.includes(':') ? sym.split(':')[1] : sym; }

    // Use isLongPass/isShortPass so breadth counts match the signals table exactly
    // (entry signal firing alone — Weekly RSI Gate removed as a gate)
    const etfOB    = allSidScanned.filter(r => r.isShortPass && etfUniverse.has(baseTicker(r.sym)));
    const etfOS    = allSidScanned.filter(r => r.isLongPass  && etfUniverse.has(baseTicker(r.sym)));
    const stockOB  = allSidScanned.filter(r => r.isShortPass && !etfUniverse.has(baseTicker(r.sym)));
    const stockOS  = allSidScanned.filter(r => r.isLongPass  && !etfUniverse.has(baseTicker(r.sym)));

    const etfTotal   = etfOB.length   + etfOS.length;
    const stockTotal = stockOB.length + stockOS.length;

    // Ratio flag
    let breadthFlag = '';
    if (etfOB.length > 0 && etfOS.length > 0) {
      const ratio = etfOB.length / etfOS.length;
      if (ratio >= 2)      breadthFlag = '🔴 Market Extended — ETF OB dominant (favour OS longs)';
      else if (ratio <= 0.5) breadthFlag = '🟢 Market Oversold — ETF OS dominant (favour OB shorts with caution)';
      else                   breadthFlag = '✅ Balanced — both setups valid';
    } else if (etfOB.length  > 3) breadthFlag = '🔴 Market Extended — ETF OB dominant';
    else if (etfOS.length > 3)    breadthFlag = '🟢 Market Oversold — ETF OS dominant';
    else                          breadthFlag = '✅ Neutral breadth';

    console.log(`**📊 SID MARKET BREADTH**\n`);
    console.log(`| | Short Entry (OB) | Long Entry (OS) | Total |`);
    console.log(`|-|-----------------|-----------------|-------|`);
    console.log(`| **ETFs** | ${etfOB.length} | ${etfOS.length} | ${etfTotal} |`);
    console.log(`| **Stocks** | ${stockOB.length} | ${stockOS.length} | ${stockTotal} |`);
    console.log('');
    console.log(`*${breadthFlag}*\n`);
    if (etfOB.length > 0) console.log(`*ETF Short Entry: ${etfOB.map(r => baseTicker(r.sym)).join(' · ')}*`);
    if (etfOS.length > 0) console.log(`*ETF Long Entry:  ${etfOS.map(r => baseTicker(r.sym)).join(' · ')}*`);
    console.log('');
  }
  } // end retired SID Market Breadth (David, 27 Aug 2026)

  // ── SID ──
  console.log('---\n');
  const sidPass = sidResults.filter(r => !r.error && (r.isLongPass || r.isShortPass)).filter(r => {
  if (isFundOrTrust(r.sym)) { process.stderr.write(`[SID rejected] ${r.sym}: fund/trust (sector=Miscellaneous), not a real equity for SID\n`); return false; }
  return true;
});
  const sidLongs  = sidPass.filter(r => r.isLongPass);
  const sidShorts = sidPass.filter(r => r.isShortPass);
  // Populate cross-strategy SID membership sets (used by alsoTag)
  sidLongs.forEach(r  => _sidLongSyms.add(r.sym));
  sidShorts.forEach(r => _sidShortSyms.add(r.sym));

  // Indicator detected if ANY symbol has a non-null sidArmedLong value.
  // v8.5 'SID Armed Long' = 0 when not armed (still non-null → detected).
  // v10.5 'Long Entry' = '0.0000' when no signal → parseNum → 0 (non-null → detected).
  const sidIndicatorFound = sidResults.some(r => !r.error && r.sidArmedLong != null);
  if (!sidBrief) {
    console.log('**⚡ SID — no SID scan data** *(SID layout not scanned)*\n');
  } else if (!sidIndicatorFound && sidBrief) {
    console.log('**⚡ SID — ⚠️ SID indicator not found in data window**\n');
    console.log('*Add "SID Trading Signals Pro" (v8.5.17+) to the SID layout and enable its data window outputs.*\n');
  } else if (sidPass.length === 0) {
    console.log('**⚡ SID — 0 signals** *(no entry signals fired today)*\n');
  } else {
    console.log(`**⚡ SID — ${sidPass.length} signals** *(${sidLongs.length} Long · ${sidShorts.length} Short)*`);
    console.log('*SID entry signal fired — verify Gap/ATR Ratio manually before acting.*');
    console.log('*Gap/ATR = SL distance in ATRs (how far the stop sits from entry). Per STRATEGIES.md: ≥2.0 ideal (sound stop room) · <1.5 avoid (stop too tight, noise-vulnerable). Shown as an approximate starting point (~); calculate the real value manually before acting — no auto-flag, no hard reject. ATR% alone has low predictive value.*\n');
    { const _rs = readReminders('sid'); if (_rs.length) console.log('\n' + _rs.map(x => `\uD83D\uDCCC ${x}`).join('\n') + '\n'); }

    const sidHeaders = ['Ticker','Sig','Price','MACD0','Gap/ATR','ADX','DI','SMA200','SMA50','RVOL','Src','Score','Sector','Sector Support'];
    const sidRightAlign = new Set([2, 9]);  // Price, RVOL (SMA50 inserted at idx 8 -> RVOL shifts to 9)

    function sidRowCells(r) {
      const D = '-';
      const sig    = r.isLongPass ? '🟢 Long' : '🔴 Short';  // fired SID entry signal (🟢 long / 🔴 short)
      const sma200 = r.aboveSMA200 === true  ? ('Abv ' + (r.sma200Pct != null ? '+' + r.sma200Pct.toFixed(1) + '%' : '')).trim()
                   : r.aboveSMA200 === false ? ('Blw ' + (r.sma200Pct != null ? r.sma200Pct.toFixed(1) + '%' : '')).trim()
                   : D;
      // David (28 Aug 2026): SMA50 column, same formatting pattern as SMA200.
      const sma50  = r.aboveSMA50 === true  ? ('Abv ' + (r.sma50Pct != null ? '+' + r.sma50Pct.toFixed(1) + '%' : '')).trim()
                   : r.aboveSMA50 === false ? ('Blw ' + (r.sma50Pct != null ? r.sma50Pct.toFixed(1) + '%' : '')).trim()
                   : D;
      const di     = (r.diPlus != null && r.diMinus != null) ? `${r.diPlus.toFixed(0)}/${r.diMinus.toFixed(0)}` : D;
      const adx    = r.adx == null ? D
                   : (r.adx >= 20 && r.adx <= 25) ? r.adx.toFixed(1) + ' NML'
                   : r.adx.toFixed(1);
      const atr    = r.atrPct != null ? r.atrPct.toFixed(1) + '%' : D;
      // Gap/ATR is the swing approximation — a starting-point reference only; the real value
      // (entry-SL)/entry / ATR% is worked out manually. No absolute >=2 reject (matches confluence_check.py).
      const gatr   = r.gatrRatio == null ? D : r.gatrRatio.toFixed(2);
      const rvol   = r.rvol   != null ? r.rvol.toFixed(1) : D;
      const vdDir     = r.vdPos === true ? 'Buy' : r.vdPos === false ? 'Sell' : null;
      const vdAligned = r.isLongPass ? (r.vdPos === true) : (r.vdPos === false);
      const vd     = vdDir == null ? D : (vdDir + ' ' + (vdAligned ? 'ok' : 'x'));
      const src    = normalizeSrc(r);
      // Weekly RSI + Weekly MACD removed from the brief entirely (weekly indicator deleted on TV).
      // MACD0 = RAW (MACD - Signal), matching the chart and the LORP brief convention (STRATEGIES.md).
      // The %-of-price normalisation is used only inside the short-gate flags for cross-ticker comparability.
      const macd0Raw = (r.macd != null && r.macdSig != null) ? (r.macd - r.macdSig) : null;
      const macd0Str = macd0Raw == null ? D : (macd0Raw >= 0 ? '+' : '') + macd0Raw.toFixed(2);
      const sidDirection = r.isLongPass ? 'long' : 'short';
      const sectorStr = sectorTagDisplay(bareSym(r.sym), sidDirection);
      const sectorNameStr = sectorNameDisplay(bareSym(r.sym));
      return [r.sym, sig, '$' + fmt(r.price), macd0Str, gatr, adx, di, sma200, sma50, rvol, src, sidScore(r), sectorNameStr, sectorStr];
    }

    function printSIDTable(rows) {
      const cells = rows.map(sidRowCells);
      const widths = sidHeaders.map((h, i) => Math.max(h.length, ...cells.map(c => String(c[i]).length)));
      const pad = (x, i) => { const sx = String(x); const g = Math.max(0, widths[i] - sx.length); return sidRightAlign.has(i) ? ' '.repeat(g) + sx : sx + ' '.repeat(g); };
      console.log('| ' + sidHeaders.map((h, i) => pad(h, i)).join(' | ') + ' |');
      console.log('|-' + widths.map(w => '-'.repeat(w)).join('-|-') + '-|');
      cells.forEach(c => console.log('| ' + c.map((x, i) => pad(x, i)).join(' | ') + ' |'));
    }

    function extendedCaution(rows, swingWord) {
      // Per STRATEGIES.md: Gap/ATR >= 2.0 is IDEAL (stop room); < 1.5 is the caution (stop too tight).
      const tight = rows.filter(r => r.gatrRatio != null && r.gatrRatio < 1.5).sort((a, b) => a.gatrRatio - b.gatrRatio);
      if (!tight.length) return;
      console.log('');
      console.log(`> \ud83d\udea9 TIGHT STOP \u2014 Gap/ATR < 1.5; stop sits too close to entry (noise-vulnerable), avoid: ${tight.map(r => `${r.sym} (${r.gatrRatio.toFixed(2)})`).join(', ')}`);
    }

    function adxCaution(rows) {
      const nml = rows.filter(r => r.adx != null && r.adx >= 20 && r.adx <= 25);
      if (!nml.length) return;
      console.log('');
      console.log(`> ⚠️ ADX no-man's-land (20–25) — neither coiling (<20) nor trending (≥25); directional read unreliable: ${nml.map(r => `${r.sym} (${r.adx.toFixed(1)})`).join(', ')}`);
    }

    // Validated SID short guards (sid-adx-analysis): ADX 40-50 run-over, MACD0 >= +0.25% premature fade.
    function sidShortCaution(rows) {
      const runover = rows.filter(r => r.adx != null && r.adx >= 40 && r.adx < 50);
      const premature = rows.filter(r => r.macd != null && r.macdSig != null && r.price && ((r.macd - r.macdSig) / r.price * 100) >= 0.25);
      if (runover.length) { console.log(''); console.log(`> ⛔ SHORT run-over zone — ADX 40–50 (validated −3.16%/trade, avg loss −13.6%): ${runover.map(r => `${r.sym} (${r.adx.toFixed(1)})`).join(', ')}`); }
      if (premature.length) { console.log(''); console.log(`> ⚠️ Premature fade — MACD0 ≥ +0.25% above signal (validated −0.81%/trade): ${premature.map(r => r.sym).join(', ')}`); }
      const diSpread = r => (r.diPlus != null && r.diMinus != null) ? (r.diPlus - r.diMinus) : null;
      const diWide = rows.filter(r => { const sp = diSpread(r); return sp != null && sp >= 20; });
      const diMod  = rows.filter(r => { const sp = diSpread(r); return sp != null && sp >= 10 && sp < 20; });
      if (diWide.length) { console.log(''); console.log(`> ⛔ SHORT run-over — DI spread ≥ 20 (fading a strong uptrend, validated −1.02%/trade): ${diWide.map(r => `${r.sym} (${diSpread(r).toFixed(0)})`).join(', ')}`); }
      if (diMod.length)  { console.log(''); console.log(`> ⚠️ Weak short — DI spread 10–20 (negative-edge zone; SID shorts want spread < ~10, ideally a small POSITIVE spread of 0–10, not deeply negative): ${diMod.map(r => `${r.sym} (${diSpread(r).toFixed(0)})`).join(', ')}`); }
    }

    // David (8 Sep 2026): long-side equivalent of sidShortCaution, added after realising
    // the brief had zero DI-Gap guidance for longs despite the validated favourable zone
    // (SID Strategy Pine indicator input defaults, 12 Aug 2026 analysis): DI gap -20 to -5
    // is favourable for longs — i.e. DI- still moderately ahead of DI+, NOT DI+ > DI- as
    // "the general view" would suggest. A positive gap means the downtrend has already
    // fully reverted by the time RSI touches oversold — the early-reversal window SID is
    // designed to catch has likely already passed. A gap more extreme than -20 means the
    // downtrend is still dominant, too early/dangerous to catch. No specific %/trade figures
    // are quoted here (unlike the short-side warnings) since that granular backtest wasn't
    // run for the long side — this reflects the favourable ZONE only, not validated P&L.
    function sidLongCaution(rows) {
      const diGap = r => (r.diPlus != null && r.diMinus != null) ? (r.diPlus - r.diMinus) : null;
      const tooLate = rows.filter(r => { const g = diGap(r); return g != null && g > -5; });
      const tooEarly = rows.filter(r => { const g = diGap(r); return g != null && g < -20; });
      if (tooLate.length)  { console.log(''); console.log(`> ⚠️ DI gap > -5 (outside favourable -20/-5 zone) — downtrend may have already reverted before this RSI touch, early-reversal window likely passed: ${tooLate.map(r => `${r.sym} (${diGap(r).toFixed(0)})`).join(', ')}`); }
      if (tooEarly.length) { console.log(''); console.log(`> ⚠️ DI gap < -20 (outside favourable -20/-5 zone) — downtrend still strongly dominant, may be too early to catch the reversal: ${tooEarly.map(r => `${r.sym} (${diGap(r).toFixed(0)})`).join(', ')}`); }
    }

    if (sidLongs.length > 0) {
      console.log(`*Long candidates (${sidLongs.length}):*\n`);
      printSIDTable(sidLongs);
      adxCaution(sidLongs);
      sidLongCaution(sidLongs);
      console.log('');
    }

    if (sidShorts.length > 0) {
      console.log(`*Short candidates (${sidShorts.length}):*\n`);
      printSIDTable(sidShorts);
      adxCaution(sidShorts);
      sidShortCaution(sidShorts);
      console.log('');
    }
  }
  // SPY Regime Gate removed 28 Aug 2026 — see extraction removal note near top of file.

  // ── Pullback Section (output retired 26 Aug 2026 — see wrapped block below) ──

  // Stage counts
  const stage3 = pullbackUnique.filter(r => r.stageInfo.stage === 3);
  const stage2 = pullbackUnique.filter(r => r.stageInfo.stage === 2);
  const stage1 = pullbackUnique.filter(r => r.stageInfo.stage === 1);
  const stage0 = pullbackUnique.filter(r => r.stageInfo.stage === 0);
  // Stage 3 split: breakout vs in-band
  const stage3Breakout = stage3.filter(r => r.stageInfo.kind === 'breakout');
  const stage3InBand   = stage3.filter(r => r.stageInfo.kind === 'inband');

  // Sort: stage desc then RVOL desc — Stage 0 WATCH hidden from output
  const pbSorted = [...stage3, ...stage2, ...stage1]
    .sort((a, b) => {
      if (b.stageInfo.stage !== a.stageInfo.stage) return b.stageInfo.stage - a.stageInfo.stage;
      return (b.rvol ?? 0) - (a.rvol ?? 0);
    });

  // Check whether Pullback-specific indicators were present in the scan data
  const pbBookerFound    = pbProcessed.some(r => r.pb_flag != null || r.up_arrow != null);
  const pbSlingshotFound = pbProcessed.some(r => r.ema38 != null || r.ema62 != null);
  const pbIndicatorWarn  = (!pbBookerFound || !pbSlingshotFound) && pbProcessed.length > 0
    ? '\n    ⚠️ INDICATOR DATA MISSING — add to PULLBACK layout data window:\n' +
      (!pbBookerFound    ? '       · ADX + EMA21 Trend Setup [Booker Method] (Pullback/Breakout signals)\n' : '') +
      (!pbSlingshotFound ? '       · CM_SlingShotSystem (EMA38/EMA62 bands)\n' : '')
    : '';

  const pbHeader2 = `${'═'.repeat(44)}\n📈 PULLBACK SCREENER  —  ${pbSorted.length} tickers shown (${stage0.length} WATCH hidden)\n    Stage 3 🟢 BREAKOUT: ${stage3Breakout.length}  |  🔵 IN-BAND: ${stage3InBand.length}  |  Stage 2 🟠 EMA21: ${stage2.length}  |  Stage 1 🟡 PB: ${stage1.length}\n    Entries require price ≥ EMA21 (no negative %). ADX 20–40 filter applied upstream.\n    ⚑ LuxAlgo HTF Divergence: manual chart check required.${pbIndicatorWarn}\n${'═'.repeat(44)}`;

  // ── Pullback section retired (David, 26 Aug 2026): "delete all references to the
  // old Pullback & ADX Continuation" — folded into LORP Trend/Pullback tables instead.
  // Wrapped rather than deleted, matching the existing ADX Continuation precedent below.
  if (false) {
  if (pbSorted.length === 0) {
    const watchNote = stage0.length > 0 ? ` *(${stage0.length} WATCH-only hidden)*` : '';
    console.log(`**📈 PULLBACK** — No Stage 1–3 candidates${watchNote}\n`);
  } else {
    console.log(pbHeader2 + '\n');

    const pbTableHeader  = '| Ticker | Price | Stage | EMA38 | EMA62 | EMA21 | % EMA21 | Band↑ | VD | GP Zone | PP | CAP | Also |';
    const pbTableDivider = '|--------|-------|-------|-------|-------|-------|---------|-------|----|---------|-----|-----|------|';
    console.log(pbTableHeader);
    console.log(pbTableDivider);

    pbSorted.forEach(r => {
      const stageStr  = `${r.stageInfo.label}`;
      const ema38Str  = r.ema38 != null ? `$${r.ema38.toFixed(2)}` : '—';
      const ema62Str  = r.ema62 != null ? `$${r.ema62.toFixed(2)}` : '—';
      const ema21Str  = r.ema21 != null ? `$${r.ema21.toFixed(2)}` : '—';
      const pctE21     = r.stageInfo?.pctAboveEma21;
      const pctE21Str  = pctE21 != null ? `${pctE21 >= 0 ? '+' : ''}${pctE21.toFixed(1)}%` : '—';
      const bandStr   = r.bandValid === true ? '✓' : r.bandValid === false ? '✗' : '—';
      const vdStr     = r.vdPos === true ? '▲' : r.vdPos === false ? '▼' : '—';
      const gpStr     = pbGpStatus(r.gpFlag, r.gpTop, r.gpBot, r.price, r.atr);
      const ppStr     = r.ppFlag != null && r.ppFlag >= 1 ? '★' : '—';
      // Show ALL firing CAP signals (demand AND supply), not just the highest priority.
      // Supply (SS/CS) matters as much as demand (SD/CD) and must not be masked.
      const capParts = [];
      if (r.pbCapClimaxDemand > 0) capParts.push('🔥 CD');
      if (r.pbCapStrongDemand > 0) capParts.push('💪 SD');
      if (r.pbCapClimaxSupply > 0) capParts.push('🔥 CS');
      if (r.pbCapStrongSupply > 0) capParts.push('💪 SS');
      const capStr = capParts.length ? capParts.join(' ') : (r.pbCapDemand != null ? '—' : '');
      console.log(`| ${r.sym} | $${fmt(r.price)} | ${stageStr} | ${ema38Str} | ${ema62Str} | ${ema21Str} | ${pctE21Str} | ${bandStr} | ${vdStr} | ${gpStr} | ${ppStr} | ${capStr} | ${alsoTag(r.sym, 'PB')} |`);
    });
    console.log('');

    // Invalidated by GP zone
    if (pbInvalidatedGP.length > 0) {
      console.log(`*⛔ GP Zone invalidated (suppressed): ${pbInvalidatedGP.map(r => r.sym).join(' · ')}*\n`);
    }
  }
  } // end retired Pullback section (David, 26 Aug 2026)

  // ── ADX Breakout ── REMOVED from brief per user #8 (Jul 2026); ADX now shown in the LORP table
  {
    function printAdxContRow(r) {
      const closeStr = r.price != null ? `$${fmt(r.price)}` : '—';
      const adxStr   = r.adx   != null ? r.adx.toFixed(1)   : '—';
      const diStr    = (r.diPlus != null && r.diMinus != null) ? `${r.diPlus.toFixed(0)}/${r.diMinus.toFixed(0)}` : '—';
      const brk      = (r.price != null && r.boxUpper != null && r.price > r.boxUpper) ? '↑ box'
                     : (r.price != null && r.boxLower != null && r.price < r.boxLower) ? '↓ box'
                     : '—';
      const bqTag    = r.bookerQualUp === 1 ? ' 🔔 BQ↑' : r.bookerQualDown === 1 ? ' 🔔 BQ↓' : '';
      console.log(`| ${r.sym}${bqTag} | ${closeStr} | ${adxStr} | ${diStr} | ${brk} | ${alsoTag(r.sym, 'ADX')} |`);
    }
    function printAdxBBWPRow(r) {
      const closeStr   = r.price != null ? `$${fmt(r.price)}` : '—';
      const adxStr     = r.adx   != null ? r.adx.toFixed(1)   : '—';
      const bbwpStr    = r.bbwp  != null ? r.bbwp.toFixed(1)  : '—';
      const aboveSMA20 = r.basis != null && r.price != null ? r.price > r.basis : null;
      const direction  = aboveSMA20 === true ? '↑' : aboveSMA20 === false ? '↓' : '—';
      const bqTag      = r.bookerQualUp  === 1 ? ' 🔔 BQ↑'
                       : r.bookerQualDown === 1 ? ' 🔔 BQ↓'
                       : '';
      console.log(`| ${r.sym}${bqTag} | ${closeStr} | ${adxStr} | ${bbwpStr} | ${direction} | ${alsoTag(r.sym, 'ADX')} |`);
    }

    const hasCoiling  = adxCoiling.length  > 0;   // now: continuation candidates
    const hasExtended = adxExtended.length > 0;

    if (false && (hasCoiling || hasExtended)) {  // #8: ADX Breakout section suppressed
      if (hasCoiling) {
        console.log(`**⚡ ADX CONTINUATION (ADX ≥ 25) — ${adxCoiling.length} tickers**\n`);
        console.log('| Ticker | Close | ADX | DI+/DI- | Break | Also |');
        console.log('|--------|-------|-----|---------|-------|------|');
        adxCoiling.forEach(printAdxContRow);
        console.log('');
      }
      if (hasExtended) {
        console.log(`**⚠️ BBWP EXTENDED (≥98%) — ${adxExtended.length} tickers**\n`);
        console.log('| Ticker | Close | ADX | BBWP | vs SMA20 | Also |');
        console.log('|--------|-------|-----|------|----------|------|');
        adxExtended.forEach(printAdxBBWPRow);
        console.log('');
      }
      console.log('*ADX ≥ 25 + DI direction + close beyond Box = continuation breakout · 25–40 cap applied by TV Screener · 🔔 BQ = Booker Quality signal*\n');
      console.log('*⚠️ Confirm breakout direction + ADX rising on chart before acting*\n');
    }
    // No output when neither section has candidates — correct and expected
  }

  // ── Below EMA50 ──
  {
    const belowEMA50 = neutral.filter(r => r.aboveEMA50 === false).map(r => r.sym);
    if (belowEMA50.length) {
      console.log('---\n');
      console.log(`**⬇️ BELOW EMA50 — ${belowEMA50.length} symbols**\n`);
      for (let i = 0; i < belowEMA50.length; i += 8) {
        console.log(belowEMA50.slice(i, i+8).join(' · '));
      }
      console.log('');
    }
  }

  // ── Errors ──
  if (errors.length) {
    console.log('---\n');
    console.log(`**⚠️ SCAN ERRORS — ${errors.length} symbols**\n`);
    errors.forEach(r => console.log(`- ${r.sym}: ${r.error}`));
    console.log('');
  }

  // ── Footer ──
  console.log('---\n');
  console.log('*⚠️ Preliminary screen only — confirm on chart before acting*  ');
  console.log('*LORP: Pre-filtered by TV Screener (ATR<5%, MACD>0, EMA21>EMA34, Vol>500K, RelVol>1.0, Price>EMA34, Aroon Down<30%, RSI 45-75)*  ');
  console.log('*Brief filters: RVOL>0.8, RVOL<4, VD>0.5, No LC data excluded*');
  console.log('*Type: Pullback 🔄 = Dist<0.5 · Trend ↗ = Dist 0.5–1.5 · Breakout 🚀 = Dist>1.5 · WRB ✓ = wide range bar in prior bars · ✗ = none*  ');
  console.log('');
  console.log('📐 **CONFLUENCE FACTORS BY STRATEGY**\n');
  console.log('**LORP:** 🟢 LC Premium Buy/StopBuy signal · RVOL >0.8 · ATR% <5%  ');
  console.log('         Sig = FRESH fires only — markers already in the prior brief are filtered as carried-over · ·Nc = N held-over markers suppressed\n');
  console.log('**SID:**  Long: RSI crossed below 30 (OS touch) · RSI rising  ');
  console.log('          Short: RSI crossed above 70 (OB touch) · RSI falling  ');
  console.log('          SMA200 tier (HIGH CONVICTION ≥5% away) · ADX (<20 coiling ✓ · 20-25 NML ⚠️ · 25-40 trending)  ');
  console.log('          Gap/ATR ≥2.0 ideal (stop room) · <1.5 avoid (stop too tight) · Src: SID·LORP·BTW  ');
  console.log('          ATR% risk · Gap/ATR = SL distance in ATRs (per STRATEGIES.md: ≥2.0 ideal · <1.5 avoid) · VD (ref)\n');

  // ── CSV Export ──
  // Save alongside the LORP JSON but with standardised name for email attachment
  const csvPath = briefFile.replace(/-lorp\.json$/, '-data.csv').replace(/\.json$/, '-data.csv');
  const csvRows = [];

  // Header — new fields aligned with current brief design
  csvRows.push('Section,Ticker,Price,Type,Dist,ATR%,RVOL,VD,Aroon,WRB,EMA50,SMA200,GP_Flag,GP_Top,GP_Bot');

  // LORP SCREENER
  lorpScreener.forEach(r => {
    const vdStr  = r.vdPos === true ? 'Buy' : r.vdPos === false ? 'Sell' : '';
    const wrbStr = r.wrbInPrior === true ? 'WRB' : '';
    csvRows.push([
      'LORP SCREENER', r.sym, fmt(r.price), r.entryType ?? '',
      r.distFromKernel != null ? r.distFromKernel.toFixed(2) : '',
      r.atrPct != null ? r.atrPct.toFixed(1) : '',
      r.rvol   != null ? r.rvol.toFixed(1)   : '',
      vdStr,
      r.aroon  != null ? r.aroon.toFixed(0)  : '',
      wrbStr,
      r.ma1    != null ? r.ma1.toFixed(2)    : '',
      r.ma2    != null ? r.ma2.toFixed(2)    : '',
      '', '', '',  // GP_Flag, GP_Top, GP_Bot — not on LORP layout
    ].join(','));
  });

  // LORP BRIEF
  lorpBriefTickers.forEach(r => {
    const vdStr  = r.vdPos === true ? 'Buy' : r.vdPos === false ? 'Sell' : '';
    const wrbStr = r.wrbInPrior === true ? 'WRB' : '';
    csvRows.push([
      'LORP BRIEF', r.sym, fmt(r.price), r.entryType ?? '',
      r.distFromKernel != null ? r.distFromKernel.toFixed(2) : '',
      r.atrPct != null ? r.atrPct.toFixed(1) : '',
      r.rvol   != null ? r.rvol.toFixed(1)   : '',
      vdStr,
      r.aroon  != null ? r.aroon.toFixed(0)  : '',
      wrbStr,
      r.ma1    != null ? r.ma1.toFixed(2)    : '',
      r.ma2    != null ? r.ma2.toFixed(2)    : '',
      '', '', '',  // GP_Flag, GP_Top, GP_Bot — not on LORP layout
    ].join(','));
  });

  // Screener tickers not found in scan
  if (screenerMissed.length > 0) {
    screenerMissed.forEach(t => {
      csvRows.push(`LORP SCREENER (not scanned),${t},,,,,,,,,,,,,,`);
    });
  }

  // SID
  sidResults.filter(r => !r.error && (r.isLongPass || r.isShortPass)).forEach(r => {
    const dirStr = r.isLongPass ? 'Long' : 'Short';
    const vdStr  = r.vdPos === true ? 'Buy' : r.vdPos === false ? 'Sell' : '';
    csvRows.push([
      'SID', r.sym, fmt(r.price), dirStr,
      '', '',
      r.rvol   != null ? r.rvol.toFixed(1)   : '',
      vdStr,
      r.aroon  != null ? r.aroon.toFixed(0)  : '',
      '',
      '', '',
      r.gpFlag != null ? r.gpFlag.toFixed(0) : '',
      r.gpTop  != null ? r.gpTop.toFixed(2)  : '',
      r.gpBot  != null ? r.gpBot.toFixed(2)  : '',
    ].join(','));
  });

  // PULLBACK
  pullbackUnique.forEach(r => {
    const vdStr   = r.vdPos === true ? 'Buy' : r.vdPos === false ? 'Sell' : '';
    const stageStr = r.stageInfo ? `Stage ${r.stageInfo.stage}` : '';
    csvRows.push([
      'PULLBACK', r.sym, fmt(r.price), stageStr,
      '', '', r.rvol != null ? r.rvol.toFixed(1) : '',
      vdStr, '', '',
      r.ema38 != null ? r.ema38.toFixed(2) : '',
      r.ema62 != null ? r.ema62.toFixed(2) : '',
      r.gpFlag != null ? r.gpFlag.toFixed(0) : '',
      r.gpTop  != null ? r.gpTop.toFixed(2)  : '',
      r.gpBot  != null ? r.gpBot.toFixed(2)  : '',
    ].join(','));
  });

  // ADX BREAKOUT SCREENER (coiling only — BBWP ≤5)
  adxCoiling.forEach(r => {
    const vdStr   = r.vd    != null ? (r.vd > 0 ? 'Buy' : 'Sell') : '';
    const bbwpStr = r.bbwp  != null ? r.bbwp.toFixed(1) : '';
    const dirStr  = r.basis != null && r.price != null ? (r.price > r.basis ? 'above' : 'below') : '';
    csvRows.push([
      'ADX BREAKOUT SCREENER', r.sym, fmt(r.price), '',
      '', '', r.rvol != null ? r.rvol.toFixed(1) : '',
      vdStr, bbwpStr, dirStr, '', '',
      '', '', '',  // GP_Flag, GP_Top, GP_Bot — not on ADX layout
    ].join(','));
  });

  const fsSync = require('fs');
  fsSync.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
  process.stderr.write(`[csv] Written to ${csvPath}\n`);

  // ── LORP BRIEF Import File ──
  // David (13 Sep 2026): Rebuilt to match David's actual instruction — Brief Output
  // for LORP carries ONLY tickers still waiting on a reversion signal that have not
  // yet fired an actual LC entry. The old lorpBriefScreenerSyms gate (any LORP-screener
  // ticker with positive Buy VD, regardless of signal) is removed: it was pulling in
  // ~40+ tickers/day that never appeared in the printed Trend/Pullback tables — the same
  // bloat pattern fixed for the Trend table's own display on 9 Sep 2026, but never
  // mirrored into this list. Once a ticker fires an LC entry it belongs in Trend and is
  // David's call to act on or not — it stops being carried forward as a "watch."
  const firedTodaySet = new Set(
    lorpAll.filter(r => r.lorpBuySignal || r.lorpSellSignal).map(r => bareSym(r.sym))
  );
  // Today's native-Pullback (reversion-only, not-yet-fired) tickers.
  const lorpNativePullbackSyms = lorpPullbackRows
    .map(r => bareSym(r.sym))
    .filter(sym => !firedTodaySet.has(sym));
  // Persistent watchlist tickers still active AND not fired since — included so a
  // reversion being watched keeps getting scanned even if it briefly drops out of
  // today's native-Pullback classification, without carrying anything that has fired.
  const lorpWatchlistActive = globalThis._lorpWatchlist
    ? Object.entries(globalThis._lorpWatchlist)
        .filter(([sym, e]) => e.status === 'active' && !firedTodaySet.has(sym))
        .map(([sym]) => sym)
        .filter(sym => !lorpNativePullbackSyms.includes(sym))
    : [];
  const lorpBriefImport = [...new Set([...lorpWatchlistActive, ...lorpNativePullbackSyms])].sort();

  const importPath = briefFile.replace('.json', '-brief-import.txt');
  fsSync.writeFileSync(importPath, lorpBriefImport.join('\n') + '\n', 'utf8');
  process.stderr.write(`[import] LORP BRIEF import (${lorpBriefImport.length} tickers) written to ${importPath}\n`);

  // ── Watchlist Updates Sidecar ──
  // Generates a JSON sidecar consumed by push-watchlist.cjs to update TV BRIEF sections
  const briefDateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  const briefDate = briefDateMatch ? briefDateMatch[1] : localDateStr();

  const sidBriefTickers = sidResults
    .filter(r => !r.error && (r.isLongPass || r.isShortPass))
    .map(r => r.sym);

  // ADX Continuation and Pullback retired (David, 26 Aug 2026) — no longer contribute to
  // Brief Output. Kept as unused local computations elsewhere in the file rather than
  // deleted outright, matching how the print sections themselves were retired above.

  // Merge LORP + SID outputs into a single deduplicated, sorted list
  const briefOutputTickers = [
    ...new Set([
      ...lorpBriefImport,
      ...sidBriefTickers.map(s => bareSym(s)),
    ]),
  ].sort();

  // David (13 Sep 2026): fix for the 9 Sep "ASX/invalid" bug. Root cause: this sidecar
  // was writing BARE tickers (no exchange prefix); push-watchlist.cjs's
  // resolveExchangePrefix can only recover a prefix by finding the ticker somewhere ELSE
  // in the current TV watchlist, which fails for a ticker that's brand new to the
  // watchlist — exactly the case for fresh LORP Pullback/reversion candidates (MLYS, PBR,
  // RHI, SHG on 9 Sep). None were actually ASX-listed; they just had nowhere to borrow a
  // prefix from, fell back to bare, and sync-watchlist.cjs's isValidTicker regex (which
  // requires EXCHANGE:TICKER) then rejected them and mislabelled them "ASX/invalid".
  // Fix: never lose the prefix in the first place. Today's scans (lorpAll, sidResults)
  // already carry fully-qualified symbols before bareSym() strips them for display —
  // build a lookup back to that qualified form for the sidecar TV actually consumes.
  // The printed footer and brief-import.txt stay bare (unchanged, for readability).
  const qualifiedSymOf = new Map();
  for (const r of [...lorpAll, ...sidResults]) {
    if (r && r.sym) qualifiedSymOf.set(bareSym(r.sym), r.sym);
  }
  const briefOutputTickersQualified = briefOutputTickers.map(sym => qualifiedSymOf.get(sym) || sym);

  const watchlistUpdates = {
    date: briefDate,
    generated_at: new Date().toISOString(),
    sections: {
      'Brief Output': briefOutputTickersQualified,
    },
  };

  const sidecarPath = /-lorp\.json$/.test(briefFile)
    ? briefFile.replace(/-lorp\.json$/, '-watchlist-updates.json')
    : briefFile.replace(/\.json$/, '-watchlist-updates.json');
  fsSync.writeFileSync(sidecarPath, JSON.stringify(watchlistUpdates, null, 2), 'utf8');
  process.stderr.write(`[watchlist] Updates written to ${sidecarPath}\n`);

  // Also append to tables output
  if (lorpBriefImport.length > 0) {
    const importNote = `\n---\n\n**📋 Brief Output — ${briefOutputTickers.length} tickers** *(LORP · SID — pushed to watchlist)*\n\n${briefOutputTickers.join(' · ')}\n`;
    process.stdout.write(importNote);
  }

// ══════════════════════════════════════════════════════════════════
// VERBOSE OUTPUT (--verbose flag)
// ══════════════════════════════════════════════════════════════════
} else {

  console.log(`\nLORP / SID / ADX BREAKOUT / PULLBACK MORNING BRIEF — ${ts}`);
  console.log(`Preliminary screen only. Run Mac Automator before acting on any signal.\n`);
  console.log('═'.repeat(60));

  // ── SUMMARY TABLE ────────────────────────────────────────────────
  {
    console.log('\nSUMMARY\n');
    const COL_SYM  = 8;
    const COL_STRAT = 20;
    const header = 'SYMBOL'.padEnd(COL_SYM) + 'STRATEGY'.padEnd(COL_STRAT) + 'DETAIL';
    console.log('  ' + header);
    console.log('  ' + '─'.repeat(header.length));

    const summaryRows = results
      .filter(r => !r.error)
      .map(r => {
        let strategy, detail;
        if (r.strategy === 'LORP') {
          strategy = 'LORP PASS';
          detail   = `Full confluence ✓`;
        } else if (r.strategy === 'LORP_WATCH') {
          strategy = 'LORP WATCH';
          detail   = `Tier 1 pass, Tier 2 marginal`;
        } else if (adxCoilingAll.find(a => a.sym === r.sym)) {
          strategy = 'ADX BREAKOUT';
          const adxEntry = adxCoilingAll.find(a => a.sym === r.sym);
          detail = adxEntry?.bbwp != null
            ? `BBWP ${adxEntry.bbwp.toFixed(1)}${adxEntry.bbwp <= 5 ? ' (coiling)' : adxEntry.bbwp >= 98 ? ' (extended)' : ''}`
            : `ADX ${adxEntry?.adx?.toFixed(1) ?? '?'} (coiling)`;
        } else if (pullbackAll.find(a => a.sym === r.sym)) {
          strategy = 'PULLBACK';
          detail   = `Partial screen ✓`;
        } else {
          strategy = 'Neutral';
          detail   = r.aboveEMA50 === false ? 'Below EMA50' : 'No signal';
        }
        return { sym: r.sym, strategy, detail };
      });

    summaryRows.forEach(row => {
      console.log('  ' + row.sym.padEnd(COL_SYM) + row.strategy.padEnd(COL_STRAT) + row.detail);
    });

    const active = summaryRows.filter(r => r.strategy !== 'Neutral').length;
    console.log(`\n  ${active} active signal${active !== 1 ? 's' : ''} / ${summaryRows.length} symbols scanned`);
    if (errors.length) console.log(`  ⚠️  ${errors.length} symbol${errors.length !== 1 ? 's' : ''} with errors (see bottom)`);
    console.log('');
  }

  // ── SID note ──
  console.log('\n⚡ SID OB/OS — see SID section at bottom of this email (BTW universe · RSI OB≥70 / OS≤30)\n');

  // ── LORP Pass ──
  if (lorp.length > 0) {
    console.log('═'.repeat(60));
    console.log(`\n✅ LORP PASS — ${lorp.length} signals (Tier 1 + Tier 2 confirmed)\n`);
    console.log('  Check chart for LORP entry signal before acting.\n');
    console.log('  Ticker  Price       ADX    ATR%   RVOL   VD          Aroon');
    console.log('  ' + '─'.repeat(75));
    lorp.forEach(r => {
      const vdStr    = r.vdPos === true ? 'Buy ✓' : r.vdPos === false ? 'Sell ⚠️' : '—';
      const adxStr   = r.adx     != null ? r.adx.toFixed(1)     : '—';
      const atrStr   = r.atrPct  != null ? r.atrPct.toFixed(1) + '%' : '—';
      const rvolStr  = r.rvol    != null ? r.rvol.toFixed(1)    : '—';
      const aroonStr = r.aroon   != null ? r.aroon.toFixed(0)   : '—';
      console.log(`  ${r.sym.padEnd(6)}  $${String(r.price?.toFixed(2)).padEnd(10)}  ${adxStr.padEnd(5)}  ${atrStr.padEnd(6)} ${rvolStr.padEnd(6)} ${vdStr.padEnd(10)}  ${aroonStr}`);
    });
    console.log('');
  }

  // ── LORP Watch ──
  if (lorpWatch.length > 0) {
    console.log('═'.repeat(60));
    console.log(`\n⚠️ LORP WATCH — ${lorpWatch.length} signals (Tier 1 pass, Tier 2 marginal)\n`);
    console.log('  Review Tier 2 breakdown before acting.\n');
    lorpWatch.forEach(r => {
      const adxStr   = r.adx     != null ? `ADX ${r.adx.toFixed(1)}` : 'ADX n/a';
      const atrStr   = r.atrPct  != null ? `ATR% ${r.atrPct.toFixed(1)}%` : 'ATR% n/a';
      console.log(`  ${r.sym.padEnd(6)}  $${String(r.price?.toFixed(2)).padEnd(10)}  ${adxStr}  ${atrStr}`);
      console.log(`         Tier 2: ${lorpT2Breakdown(r)}`);
      console.log('');
    });
  }

  // ── ADX Breakout ──
  {
    console.log('\n' + '═'.repeat(60));
    if (adxCoiling.length > 0 || adxExtended.length > 0) {
      if (adxCoiling.length > 0) {
        console.log(`\n⚡ ADX BREAKOUT — BBWP COILING (≤5%) — ${adxCoiling.length} tickers\n`);
        adxCoiling.forEach(r => {
          const bbwpStr = r.bbwp != null ? `BBWP ${r.bbwp.toFixed(1)}` : `ADX ${r.adx?.toFixed(1) ?? '?'}`;
          const bqStr   = r.bookerQualUp === 1 ? ' 🔔 BQ↑' : r.bookerQualDown === 1 ? ' 🔔 BQ↓' : '';
          const dirStr  = r.basis != null && r.price != null ? (r.price > r.basis ? ' ↑ above SMA20' : ' ↓ below SMA20') : '';
          console.log(`  ${r.sym.padEnd(6)} ${bbwpStr}${bqStr}${dirStr}`);
        });
      }
      if (adxExtended.length > 0) {
        console.log(`\n⚠️  ADX BREAKOUT — BBWP EXTENDED (≥98%) — ${adxExtended.length} tickers\n`);
        adxExtended.forEach(r => {
          const bbwpStr = r.bbwp != null ? `BBWP ${r.bbwp.toFixed(1)}` : `ADX ${r.adx?.toFixed(1) ?? '?'}`;
          const bqStr   = r.bookerQualUp === 1 ? ' 🔔 BQ↑' : r.bookerQualDown === 1 ? ' 🔔 BQ↓' : '';
          const dirStr  = r.basis != null && r.price != null ? (r.price > r.basis ? ' ↑ above SMA20' : ' ↓ below SMA20') : '';
          console.log(`  ${r.sym.padEnd(6)} ${bbwpStr}${bqStr}${dirStr}`);
        });
      }
      console.log('');
    } else {
      console.log('\n📦 ADX BREAKOUT: No coiling (BBWP ≤5) or extended (BBWP ≥98) candidates\n');
    }
  }

  // ── Pullback ──
  {
    console.log('═'.repeat(60));
    if (pullbackAll.length > 0) {
      const ma1Label = pbHasData ? 'SMA50' : 'EMA50 proxy';
      console.log(`\n📈 PULLBACK SCREEN${pbHasData ? '' : ' — PARTIAL'} (Long-only trend pullback)\n`);
      if (!pbHasData) {
        console.log('  ⚠️  MA#1 = EMA50 in this scan — Pullback uses SMA50. Verify on Pullback chart.');
      }
      console.log('  ⚠️  EMA21 extension check requires Pullback CSV export via Mac Automator v1.1\n');
      pullbackAll.forEach(r => {
        const vdStr = r.vd != null ? (r.vd > 0 ? 'net buy pressure ✓' : 'net sell pressure ⚠️') : 'n/a';
        console.log(`  ${r.sym.padEnd(6)} Price ${r.price?.toFixed(2)} > ${ma1Label} ${r.ma1?.toFixed(2)} > SMA200 ${r.ma2?.toFixed(2)} ✓`);
        console.log(`         RVOL ${r.rvol != null ? r.rvol.toFixed(2) : 'n/a'} ✓  ATR% ${r.atrPct != null ? r.atrPct.toFixed(2)+'%' : 'n/a'} ✓`);
        console.log(`         Vol Δ: ${vdStr}  ⚠️  Verify EMA21 extension via Automator v1.1`);
        console.log('');
      });
    } else {
      console.log('\n📈 PULLBACK SCREEN: No candidates\n');
    }
  }

  // ── Neutral ──
  if (neutral.length > 0) {
    console.log('\n' + '═'.repeat(60));
    console.log('\n— NEUTRAL\n');
    const belowEMA50 = neutral.filter(r => r.aboveEMA50 === false).map(r => r.sym);
    const mixed      = neutral.filter(r => r.aboveEMA50 !== false).map(r => r.sym);
    if (belowEMA50.length) console.log(`  Below EMA50: ${belowEMA50.join(', ')}`);
    if (mixed.length)      console.log(`  Mixed/flat:  ${mixed.join(', ')}`);
  }

  if (errors.length > 0) {
    console.log('\n⚠️  ERRORS');
    errors.forEach(r => console.log(`  ${r.sym}: ${r.error}`));
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\nPRELIMINARY SCREEN LIMITATIONS:');
  console.log('  SID:      See SID section at bottom of email (BTW universe, RSI OB/OS scan).');
  console.log('  LORP:     Signals from LORP Confluence v1.2 indicator. Missing:');
  console.log('            HTF divergence — verify on chart before acting.');
  console.log('  ADX:      Box data + breakout direction — verify on chart before acting.');
  console.log('  PULLBACK: Pullback=1/Breakout=1 from ADX + EMA21 Trend Setup (Booker Method).\n');

} // end VERBOSE
