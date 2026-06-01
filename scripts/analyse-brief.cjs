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
 *   ✅ MACD above zero
 *   ✅ Aroon > 0 (direction)
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

if (!briefFile) {
  const today = new Date().toISOString().split('T')[0];
  briefFile = path.join(briefsDir, `brief-${today}-lorp.json`);
  if (!fs.existsSync(briefFile)) {
    // Fallback to legacy single-file format
    briefFile = path.join(briefsDir, `brief-${today}.json`);
  }
  if (!fs.existsSync(briefFile)) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
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

// Load REGIME brief and extract SPY EMA21 regime gate
// Falls back to main brief if SPY is in the main scan
let spyAboveEMA21 = null;
let spyPrice = null;
let spyEMA21 = null;

function extractSPY(briefData) {
  return briefData?.symbols_scanned?.find(s =>
    s.symbol === 'SPY' || s.symbol === 'AMEX:SPY' ||
    s.symbol === 'BATS:SPY' || s.symbol === 'NYSE:SPY' ||
    s.symbol === 'ARCA:SPY' ||
    (s.symbol?.endsWith(':SPY') && s.symbol?.length <= 8)
  );
}

// Try regime brief first, then fall back to main brief
let spyScan = null;
if (regimeBriefFile && fs.existsSync(regimeBriefFile)) {
  try {
    const regimeBrief = loadFirstJSON(regimeBriefFile);
    spyScan = extractSPY(regimeBrief);
    if (!spyScan) process.stderr.write(`[regime] SPY not found in regime scan — trying main brief\n`);
  } catch(e) {
    process.stderr.write(`[warn] Could not load REGIME brief: ${e.message}\n`);
  }
}
if (!spyScan) {
  spyScan = extractSPY(brief);
  if (spyScan) process.stderr.write(`[regime] SPY found in main brief (fallback)\n`);
}

if (spyScan && !spyScan.error) {
  spyPrice = spyScan.quote?.last;
  const studies = spyScan.indicators?.studies || [];
  const ema21St = studies.find(s =>
    s.name.toLowerCase().includes('ema21') ||
    s.name.toLowerCase().includes('ema 21') ||
    s.name.toLowerCase().includes('trend setup')
  );
  const lorpMASt = studies.find(s =>
    s.name.toLowerCase().includes('lorp moving') ||
    s.name.toLowerCase().includes('lorp ma')
  );
  // Fallback: EMA 8/20/50 Rainbow Areas (present on REGIME USA layout) — use EMA 20 as proxy for EMA21
  const ema8_20_50St = studies.find(s =>
    s.name.toLowerCase().includes('ema 8/20/50') ||
    s.name.toLowerCase().includes('ema 8 20 50') ||
    s.name.toLowerCase().includes('rainbow')
  );
  spyEMA21 = parseNum(getVal(ema21St?.values, 'EMA 21', 'EMA21', 'EMA_21'))
          ?? parseNum(getVal(lorpMASt?.values, 'MA #1', 'MA#1', 'MA 1'))
          ?? parseNum(getVal(ema8_20_50St?.values, 'EMA 20', 'EMA20'));
  if (spyPrice != null && spyEMA21 != null) {
    spyAboveEMA21 = spyPrice > spyEMA21;
    process.stderr.write(`[regime] SPY=$${spyPrice.toFixed(2)} EMA21=$${spyEMA21.toFixed(2)} → ${spyAboveEMA21 ? 'BULLISH ✓' : 'BEARISH ⚠️'}\n`);
  } else {
    process.stderr.write(`[regime] SPY found but EMA21 not available (price=${spyPrice}, ema21=${spyEMA21})\n`);
  }
} else {
  process.stderr.write(`[regime] SPY not found in any scan — add SPY to PULLBACK SCREENER watchlist section\n`);
}

// Load previous brief for ADX slope (↑/↓ direction arrow in ADX Breakout section)
// Looks back up to 7 calendar days for the most recent prior main brief file.
const prevAdxMap    = {};
const prevDiPlusMap  = {};
const prevDiMinusMap = {};
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

// Load section assignments from rules.json
const rulesPath = path.join(__dirname, '../rules.json');
const rules = fs.existsSync(rulesPath) ? JSON.parse(fs.readFileSync(rulesPath, 'utf8')) : {};
const etfUniverse = new Set(rules.etf_universe || []);
const watchlistSections = rules.watchlist_sections || {};

// Tickers to permanently exclude from all brief output (e.g. delisted, wrong exchange, data unavailable)
// EQR: resolves to ASX_DLY:EQR (EQ Resources Ltd, Australia) instead of NYSE:EQR — exclude until
// the watchlist entry is updated to use the full NASDAQ:EQR or NYSE:EQR prefix.
const EXCLUDED_TICKERS = new Set(['TPH', 'EQR', 'ASX_DLY:EQR']);
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
const sidResults = sidBrief ? sidBrief.symbols_scanned.filter(s => !EXCLUDED_TICKERS.has(s.symbol)).map(s => {
  if (s.error) return { sym: s.symbol, error: s.error };
  const studies = s.indicators?.studies || [];
  const price   = s.quote?.last;

  // SID layout has two SID indicators:
  //   s7  "SID Strategy v10.5.4.15"        — entry/exit signals only
  //   s18 "SID Trading Signals Pro v8.5.10" — full confluence (Aroon, ADX, ATR%, SMA200, Weekly RSI, etc.)
  // Prefer v8.5 for confluence data; fall back to v10.5 for entry signals if v8.5 not yet loaded.
  const sidV85St = getStudy(studies, 'SID Trading Signals Pro', 'SID Trading Signals', 'SID v8.5', 'SID-C', 'SID Confluence');
  const sidCSt   = sidV85St; // v8.5.10 is the sole source — entry signals + all confluence data
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
  // Confluence factors — from SID Trading Signals Pro v8.5.10 (embedded in indicator)
  const wrsiGate      = parseNum(getVal(sidCSt?.values, 'Weekly RSI Gate', 'Weekly RSI gate', 'WRSI Gate'));
  const wrsi          = parseNum(getVal(sidCSt?.values, 'Weekly RSI'));
  const sma200        = parseNum(getVal(sidCSt?.values, 'SMA200'));
  const aroonOsc      = parseNum(getVal(sidCSt?.values, 'Aroon Osc', 'Aroon Oscillator'));
  const adxVal        = parseNum(getVal(sidCSt?.values, 'ADX'));
  const atrPctSid     = parseNum(getVal(sidCSt?.values, 'ATR%'));
  const gatrRatio     = parseNum(getVal(sidCSt?.values, 'Gap/ATR Ratio'));

  // Fallback to standalone indicators if SID-C not found
  const aroon  = aroonOsc ?? parseNum(getVal(aroonSt?.values, 'Aroon Oscillator', 'Aroon', 'aroon'));
  const adx    = adxVal   ?? parseNum(getVal(adxSt?.values, 'ADX', 'adx'));
  const atrPct = atrPctSid ?? parseNum(getVal(atrSt?.values, 'ATR% raw (buffer ref)', 'ATR%', 'ATR %'));
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

  // Signal passes on entry firing alone — Weekly RSI Gate shown as context, not a hard filter.
  // User assesses weekly RSI direction by eye; wrsiGate and wrsi exposed as table columns.
  const isLongPass  = sidArmedLong  === 1;
  const isShortPass = sidArmedShort === 1;
  const isArmed     = sidArmedLong  === 1 || sidArmedShort === 1;

  // Section source
  const inSIDScreener = sidScreenerSet.has(s.symbol);
  const inSIDBrief    = sidBriefSet.has(s.symbol);
  const inBTW         = btwSet.has(s.symbol);

  return {
    sym: s.symbol, price, isLongPass, isShortPass, isArmed, wrsiGate,
    sidArmedLong, sidArmedShort, sidLongExit, sidShortExit,
    wrsi, sma200, aboveSMA200, sma200Pct,
    aroon, adx, atrPct, gatrRatio, rvol, vd, vdPos,
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
  // LORP Confluence v1.2 indicator — reads pass/fail flags directly from chart
  const lorpCSt = getStudy(studies, 'LORP Confluence v1.4', 'LORP Confluence');
  // New indicators on LORP layout (added May 2026)
  const capSt   = getStudy(studies, 'CAP Tools Supplement');           // Climax/Strong Demand+Supply flags
  const chandSt = getStudy(studies, 'Chandelier Exit');                // Long Stop level
  const vidyaSt = getStudy(studies, 'Volumatic Variable Index Dynamic Average', 'Volumatic VIDYA', 'VIDYA');

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
  // Volumatic VIDYA — trend-adaptive moving average (acts as dynamic support/resistance)
  const vidyaVal   = parseNum(getVal(vidyaSt?.values, 'Plot'));
  const aboveVIDYA = vidyaVal != null && price != null ? price > vidyaVal : null;
  // GP Zone flag (requires GP Zone Exporter indicator on LORP chart — empty if not added)
  const gpStLORP = getStudy(studies, 'GP Zone Exporter', 'GP Zone', 'Golden Pocket', 'GP_Zone', 'GP Flag');
  const gpFlag   = parseNum(getVal(gpStLORP?.values, 'GP_Flag', 'GP Flag', 'GP flag'));
  const gpTop    = parseNum(getVal(gpStLORP?.values, 'GP_Top',  'GP Top'));
  const gpBot    = parseNum(getVal(gpStLORP?.values, 'GP_Bot',  'GP Bot'));
  // LORP Confluence v1.4 — EMA21, EMA34 and Kernel values from indicator
  const lorpFullPass = parseNum(getVal(lorpCSt?.values, 'Full Confluence Pass'));
  const lorpT1Watch  = parseNum(getVal(lorpCSt?.values, 'Tier 1 Pass / Tier 2 Marginal'));
  const lorpT1Fail   = parseNum(getVal(lorpCSt?.values, 'Tier 1 Fail'));
  const lorpEMA21    = parseNum(getVal(lorpCSt?.values, 'EMA21'));
  const lorpEMA34    = parseNum(getVal(lorpCSt?.values, 'EMA34'));

  // LC Premium — Kernel values from data window
  const lcSt           = getStudy(studies, 'Lorentzian Classification', 'LC Premium', 'ML: Lorentzian');
  const kernelVal      = parseNum(getVal(lcSt?.values, 'Kernel Regression Estimate', 'Kernel'));
  const distFromKernel = parseNum(getVal(lcSt?.values, 'Distance from Kernel'));
  const distAboveKernel = parseNum(getVal(lcSt?.values, 'Distance Above Kernel'));
  // LC Premium signal keys — exact match only (key absent or 0 when no signal).
  // Buy/Sell/StopBuy/StopSell contain the signal price when active, empty otherwise.
  // Must use hasOwnProperty — fuzzy getVal('Buy') would match 'StopBuy' as a fallback.
  const _lcVals    = lcSt?.values ?? {};
  const lcBuy      = Object.prototype.hasOwnProperty.call(_lcVals, 'Buy')      ? parseNum(_lcVals['Buy'])      : null;
  const lcSell     = Object.prototype.hasOwnProperty.call(_lcVals, 'Sell')     ? parseNum(_lcVals['Sell'])     : null;
  const lcStopBuy  = Object.prototype.hasOwnProperty.call(_lcVals, 'StopBuy')  ? parseNum(_lcVals['StopBuy'])  : null;
  const lcStopSell = Object.prototype.hasOwnProperty.call(_lcVals, 'StopSell') ? parseNum(_lcVals['StopSell']) : null;
  // Valid LORP entry signal: Buy > 0 OR StopBuy > 0
  const lorpBuySignal  = (lcBuy     != null && lcBuy     > 0) || (lcStopBuy  != null && lcStopBuy  > 0);
  const lorpSellSignal = (lcSell    != null && lcSell    > 0) || (lcStopSell != null && lcStopSell > 0);

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
  const entryType = distFromKernel == null ? 'No LC data'
    : distFromKernel < 0.50 ? 'Pullback 🔄'
    : distFromKernel < 1.50 ? 'Trend ↗'
    : 'Breakout 🚀';

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
    // LORP Confluence v1.4 indicator values
    lorpEMA21, lorpEMA34,
    // LC Premium kernel values
    kernelVal, distFromKernel, distAboveKernel, entryType,
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
    // GP Zone flag (null if indicator not on LORP chart)
    gpFlag, gpTop, gpBot,
    // Pocket Pivot
    pocketPivot,
    // New indicators (May 2026 LORP layout)
    capDemandFired, capSupplyFired, capClimaxDemand, capClimaxSupply, capStrongDemand, capStrongSupply,
    chandStop, vidyaVal, aboveVIDYA,
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

  const bookerAdx  = getStudy(studies, 'Rob Booker - ADX Breakout DM Final', 'ADX Breakout DM');
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

const adxCoiling = (() => {
  if (!adxHasDedicatedScan) {
    process.stderr.write('[adx] No dedicated ADX scan — falling back to LORP scan (no BBWP/Box data)\n');
    return results.filter(r => !r.error && r.adx != null && r.adx < 18 && adxUniverseSet.has(r.sym));
  }
  if (adxHasBBWP) {
    return Object.entries(adxPageMap)
      .filter(([sym, r]) => adxUniverseSet.has(sym) && r.bbwp != null && r.bbwp <= 5)
      .map(([sym, r]) => ({ sym, ...r }));
  }
  // BBWP indicator not on layout — fall back to ADX < 18
  process.stderr.write('[adx] No BBWP data on layout — falling back to ADX < 18 coiling filter\n');
  return Object.entries(adxPageMap)
    .filter(([sym, r]) => adxUniverseSet.has(sym) && r.adx != null && r.adx < 18)
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

  if (up_arrow === 1 || inBand) {
    return {
      stage: 3,
      label: '🟢 ENTRY',
      detail: buy_entry != null && buy_entry > 0 ? `Entry $${buy_entry.toFixed(2)}` : 'In band',
    };
  }
  if (pb_flag === 1 && pctAboveEma21 != null && pctAboveEma21 <= 3.0) {
    return {
      stage: 2,
      label: '🟠 EMA21',
      detail: `${pctAboveEma21.toFixed(1)}% above EMA21`,
    };
  }
  if (pb_flag === 1) {
    return {
      stage: 1,
      label: '🟡 PB',
      detail: pctAboveEma21 != null ? `${pctAboveEma21.toFixed(1)}% above EMA21` : '',
    };
  }
  return {
    stage: 0,
    label: '⬜ WATCH',
    detail: pctAboveEma21 != null ? `${pctAboveEma21.toFixed(1)}% above EMA21` : '',
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
  if (excludeStrategy !== 'SID_LONG' && _sidLongSyms.has(sym)) tags.push('SID📈');
  if (excludeStrategy !== 'SID_SHORT'&& _sidShortSyms.has(sym))tags.push('SID📉');
  if (excludeStrategy !== 'PB'       && _pbStage123.has(sym)) {
    const pb = pullbackAll.find(r => r.sym === sym);
    const emoji = pb?.stageInfo?.stage === 3 ? '🟢' : pb?.stageInfo?.stage === 2 ? '🟠' : '🟡';
    tags.push(`PB${emoji}`);
  }
  if (excludeStrategy !== 'ADX'      && _adxCoilSyms.has(sym)) tags.push('ADX📦');
  return tags.length ? tags.join(' ') : '—';
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
    factors.push((r.rvol >= 1.0 && r.vdPos === true) ? 'Vol ✓' : 'Vol ✗');
  }
  if (r.wrbInPrior != null) {
    factors.push(r.wrbInPrior ? 'WRB ✓' : 'WRB ✗');
  }
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
  const lorpAll = results.filter(r => !r.error && r.strategy === 'LORP');

  // Split by source section — deduplicate LORP BRIEF against LORP SCREENER
  const lorpScreener = lorpAll.filter(r => lorpScreenerSet.has(r.sym));
  const lorpBriefTickers = lorpAll.filter(r => lorpBriefSet.has(r.sym) && !lorpScreenerSet.has(r.sym));
  const lorpOther = lorpAll.filter(r => !lorpScreenerSet.has(r.sym) && !lorpBriefSet.has(r.sym));

  // Screener comparison — which screener tickers are in the brief?
  const screenerMatched = [...lorpScreenerSet].filter(t => lorpAll.find(r => r.sym === t));
  const screenerMissed  = [...lorpScreenerSet].filter(t => !lorpAll.find(r => r.sym === t));

  const totalLorp = lorpScreener.length + lorpBriefTickers.length;

  // Apply brief-level filters to get true candidate counts
  function applyBriefFilters(tickers) {
    return tickers.filter(r => {
      if (r.entryType === 'No LC data') return false;
      if (r.rvol != null && r.rvol < 1.0) return false;
      if (r.rvol != null && r.rvol >= 4) return false;
      // Aroon demoted to context only — not a hard filter (redundant with MA stack for LORP)
      return true;
    });
  }
  const lorpScreenerFiltered = applyBriefFilters(lorpScreener);
  const lorpBriefFiltered    = applyBriefFilters(lorpBriefTickers);
  const filteredBuyVD  = [...lorpScreenerFiltered, ...lorpBriefFiltered].filter(r => r.entryType?.startsWith('Pullback') || (r.vd != null && r.vd > 0.5)).length;
  const filteredSellVD = [...lorpScreenerFiltered, ...lorpBriefFiltered].filter(r => !r.entryType?.startsWith('Pullback') && (r.vd == null || r.vd <= 0.5)).length;
  const totalFiltered  = filteredBuyVD + filteredSellVD;

  if (totalFiltered === 0) {
    console.log('**✅ LORP — 0 candidates** *(TV Screener returned no tickers passing brief filters)*\n');
  } else {
    console.log(`**✅ LORP — ${totalFiltered} candidates** *(${filteredBuyVD} Buy VD · ${filteredSellVD} Sell VD)*`);
    console.log('*Pre-filtered by TV Screener + brief filters — check chart before acting*\n');
  }

  function printLorpRow(r) {
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
    const wrbStr   = r.wrbInPrior === true ? 'WRB ✓' : r.wrbInPrior === false ? '✗' : '—';
    // Sig column — all active signals this bar
    const sigParts = [];
    if (r.lorpBuySignal)                                     sigParts.push('🟢 LC');
    if (r.lorpSellSignal)                                    sigParts.push('🔴 LC');
    if (r.aroonLong  !== null)                               sigParts.push('🟢 A');
    if (r.aroonShort !== null)                               sigParts.push('🔴 A');
    if (r.aroonLongChart  != null && r.aroonLongChart  > 0)  sigParts.push('🟢 AC');
    if (r.aroonShortChart != null && r.aroonShortChart > 0)  sigParts.push('🔴 AC');
    // Pocket Pivot
    if (r.pocketPivot === true)             sigParts.push('★ PP');
    // CAP Tools signals (new May 2026)
    if (r.capClimaxDemand > 0)  sigParts.push('🔥 CD');   // Climax Demand
    if (r.capStrongDemand > 0)  sigParts.push('💪 SD');   // Strong Demand
    if (r.capClimaxSupply > 0)  sigParts.push('🔥 CS');   // Climax Supply
    if (r.capStrongSupply > 0)  sigParts.push('💪 SS');   // Strong Supply
    const sigStr = sigParts.length ? sigParts.join(' ') : '—';
    const distStr  = r.distFromKernel != null ? r.distFromKernel.toFixed(2) : '—';
    const rangePct = (r.high != null && r.low != null && r.low > 0)
      ? ((r.high - r.low) / r.low * 100).toFixed(1) + '%' : '—';
    // PB% = change from open (intraday move) — prev_close not available from TV MCP
    const pbDepth  = (r.price != null && r.open != null && r.open > 0)
      ? ((r.price - r.open) / r.open * 100).toFixed(1) + '%' : '—';
    const ma1Str    = r.ma1      != null ? r.ma1.toFixed(2)      : '—';
    const ma2Str    = r.ma2      != null ? r.ma2.toFixed(2)      : '—';
    const vidyaStr  = r.vidyaVal != null ? r.vidyaVal.toFixed(2) : '—';
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
    console.log(`| ${r.sym} | $${fmt(r.price)} | ${r.entryType ?? '—'} | ${distStr} | ${atrStr} | ${rvolStr} | ${vdStr} | ${aroonStr} | ${adxStr} | ${diPStr} | ${diMStr} | ${bbStr} | ${wrbStr} | ${rangePct} | ${pbDepth} | ${ma1Str} | ${ma2Str} | ${vidyaStr} | ${chandStr} | ${sigStr} | ${alsoTag(r.sym, 'LORP')} |`);
  }

  const lorpHeader  = '| Ticker | Price | Type | Dist | ATR% | RVOL | VD | Aroon | ADX | DI+ | DI- | %B | WRB | Range% | vs Open | EMA50 | SMA200 | VIDYA | Chand | Sig | Also |';
  const lorpDivider = '|--------|-------|------|------|------|------|----|-------|-----|-----|-----|----|----|--------|---------|-------|--------|-------|-------|-----|----|';

  const sortLorp = arr => [...arr].sort((a, b) => {
    const typeOrder = t => t?.startsWith('Pullback') ? 0 : t?.startsWith('Trend') ? 1 : 2;
    const tDiff = typeOrder(a.entryType) - typeOrder(b.entryType);
    if (tDiff !== 0) return tDiff;
    return (a.distFromKernel ?? 999) - (b.distFromKernel ?? 999);
  });

  function printLorpSection(tickers, label) {
    if (tickers.length === 0) return;

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
      if (r.entryType === 'No LC data')                                               { process.stderr.write(`[LORP rejected] ${r.sym}: No LC data  Buy=${buy} Sell=${sell} RVOL=${rvol} Aroon=${aroon} VD=${vd}\n`); return false; }
      if (r.rvol != null && r.rvol < 1.0)                                             { process.stderr.write(`[LORP rejected] ${r.sym}: RVOL too low  Buy=${buy} Sell=${sell} RVOL=${rvol} Aroon=${aroon} VD=${vd}\n`); return false; }
      if (r.rvol != null && r.rvol >= 4)                                              { process.stderr.write(`[LORP rejected] ${r.sym}: RVOL too high  Buy=${buy} Sell=${sell} RVOL=${rvol} Aroon=${aroon} VD=${vd}\n`); return false; }
      // Aroon demoted to context only — not a hard filter for LORP
      // WRB requirement removed — WRB shown as context column only
      return true;
    });

    // Pullback entries: negative VD is expected — always shown in Buy section with ↓ (PB) note
    // Trend/Breakout entries: VD > 0.5 required for Buy section
    const buyTickers  = filtered.filter(r => r.entryType?.startsWith('Pullback') || (r.vd != null && r.vd > 0.5));
    const sellTickers = filtered.filter(r => !r.entryType?.startsWith('Pullback') && (r.vd == null || r.vd <= 0.5));

    if (buyTickers.length > 0) {
      console.log(`*${label} — Buy VD (${buyTickers.length}):*\n`);
      console.log(lorpHeader);
      console.log(lorpDivider);
      sortLorp(buyTickers).forEach(printLorpRow);
      console.log('');
    }
    if (sellTickers.length > 0) {
      console.log(`*${label} — Sell VD ⚠️ (${sellTickers.length}, context only):*\n`);
      console.log(lorpHeader);
      console.log(lorpDivider);
      sortLorp(sellTickers).forEach(printLorpRow);
      console.log('');
    }
  }

  printLorpSection(lorpScreener, 'LORP Screener');
  printLorpSection(lorpBriefTickers, 'Watch List (carry forward)');

  // Screener comparison
  if (lorpScreenerSet.size > 0) {
    console.log(`*📊 Screener match: ${screenerMatched.length}/${lorpScreenerSet.size} tickers scanned*`);
    if (screenerMissed.length > 0) {
      console.log(`*⚠️ Not in scan: ${screenerMissed.join(' · ')}*`);
    }
    console.log('');
  }

  // ── Persistent LORP Watchlist — update + output ──────────────────
  {
    // Today's brief date
    const briefDateStr = (brief.generated_at
      ? new Date(brief.generated_at).toISOString()
      : new Date().toISOString()).split('T')[0];

    // Tickers that passed Buy VD filter today (same logic as printLorpSection buyTickers)
    const todayBuyVD = [...lorpScreener, ...lorpBriefTickers].filter(r => {
      if (r.entryType === 'No LC data') return false;
      if (r.rvol != null && r.rvol < 1.0) return false;
      if (r.rvol != null && r.rvol >= 4)  return false;
      // Aroon demoted to context only — not a hard filter for LORP watchlist
      // Pullback entries qualify regardless of VD direction
      return r.entryType?.startsWith('Pullback') || (r.vd != null && r.vd > 0.5);
    });
    const todayBuyVDSyms = new Set(todayBuyVD.map(r => bareSym(r.sym)));

    const lorpWatchlist = loadLorpWatchlist();

    // Step 1: Add/refresh Buy VD tickers seen today
    for (const r of todayBuyVD) {
      const sym = bareSym(r.sym);
      if (!lorpWatchlist[sym] || lorpWatchlist[sym].status !== 'active') {
        lorpWatchlist[sym] = {
          first_seen:     briefDateStr,
          last_seen:      briefDateStr,
          lorp_buy_date:  briefDateStr,
          lorp_buy_price: r.price,
          status:         'active',
        };
        process.stderr.write(`[watchlist] Added: ${sym} @ $${r.price?.toFixed(2)} on ${briefDateStr}\n`);
      } else {
        lorpWatchlist[sym].last_seen = briefDateStr;
      }
    }

    // Step 2: Check active entries for exit / expiry
    for (const [sym, entry] of Object.entries(lorpWatchlist)) {
      if (entry.status !== 'active') continue;
      // Find current scan data for this ticker (match on bare symbol)
      const r = lorpAll.find(t => bareSym(t.sym) === sym);
      if (r) {
        entry.last_seen = briefDateStr;
        // Exit: StopBuy fired (column AX in Automator CSV)
        if (r.lcStopBuy != null && r.lcStopBuy > 0) {
          entry.status = 'exited';
          process.stderr.write(`[watchlist] Exited: ${sym} — StopBuy fired on ${briefDateStr}\n`);
          continue;
        }
      }
      // Expire: 15 trading bars since first_seen with no Buy VD signal today
      const bars = countTradingDays(entry.first_seen, briefDateStr);
      if (bars > 15 && !todayBuyVDSyms.has(sym)) {
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
      console.log(`**📋 LORP PERSISTENT WATCH — ${activeWatch.length} tickers**`);
      console.log('*Tracks tickers through pullback phase regardless of TV Screener filters*\n');
      console.log('| Ticker | Price | Days | Buy Date | Buy $ | CCI OS | MACD X | CE | Status |');
      console.log('|--------|-------|------|----------|-------|--------|--------|----|--------|');

      for (const [sym, entry] of activeWatch) {
        const r = lorpAll.find(t => bareSym(t.sym) === sym);

        const priceStr  = r?.price != null ? `$${fmt(r.price)}` : '—';
        const days      = countTradingDays(entry.first_seen, briefDateStr);
        const buyDate   = entry.lorp_buy_date
          ? new Date(entry.lorp_buy_date + 'T00:00:00')
              .toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
          : '—';
        const buyPrice  = entry.lorp_buy_price != null ? `$${entry.lorp_buy_price.toFixed(2)}` : '—';

        // CCI OS: Enter Long (into OS) fired — from CCI_S indicator (current bar)
        const cciOSStr  = r?.cciOSEntry  ? '🔔 OS' : '—';
        // MACD Cross proxy: MACD positive AND above signal line
        const macdXStr  = (r?.macd != null && r.macd > 0 &&
                           r?.macdSig != null && r.macd > r.macdSig) ? '✓' : '—';
        // CE Buy: Buy Label active from LC Premium (Buy fired, Sell not fired)
        const ceBuyStr  = r?.ceBuyActive ? '✓' : '—';
        // Status note: warn if ticker is not in today's scan
        const statusStr = r ? 'Active' : 'Active ⚠ not in scan';

        console.log(`| ${sym} | ${priceStr} | ${days} | ${buyDate} | ${buyPrice} | ${cciOSStr} | ${macdXStr} | ${ceBuyStr} | ${statusStr} |`);
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

  // ── SID Market Breadth (ETF vs Stock OB/OS counts) ──
  console.log('---\n');
  {
    const sidScanned = sidResults.filter(r => !r.error && r.wrsi != null || r.sidArmedLong != null || r.sidArmedShort != null || r.aroon != null);
    // Use all scanned SID results that have RSI data to calculate breadth
    // OB = armed short (RSI has been >= 70), OS = armed long (RSI has been <= 30)
    const allSidScanned = sidResults.filter(r => !r.error);

    // Split by ETF vs stock using etfUniverse from rules.json
    // Extract base ticker (strip exchange prefix if present e.g. NASDAQ:AAPL → AAPL)
    function baseTicker(sym) { return sym.includes(':') ? sym.split(':')[1] : sym; }

    // Use isLongPass/isShortPass so breadth counts match the signals table exactly
    // (both require the Weekly RSI Gate to pass, not just a raw entry signal)
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

  // ── SID ──
  console.log('---\n');
  const sidPass = sidResults.filter(r => !r.error && (r.isLongPass || r.isShortPass));
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
    console.log('*Add "SID Trading Signals Pro" (v10.5.4.15+) to the SID layout and enable its data window outputs.*\n');
  } else if (sidPass.length === 0) {
    console.log('**⚡ SID — 0 signals** *(no entry signals fired today)*\n');
  } else {
    console.log(`**⚡ SID — ${sidPass.length} signals** *(${sidLongs.length} Long · ${sidShorts.length} Short)*`);
    console.log('*SID entry signal fired — verify Weekly RSI gate + Gap/ATR Ratio manually before acting*\n');

    const sidHeader  = '| Ticker | Price | Dir | W.RSI | Gate | SMA200 | Aroon | ADX | ATR% | RVOL | VD | GP | Source | Also |';
    const sidDivider = '|--------|-------|-----|-------|------|--------|-------|-----|------|------|----|-----|--------|------|';

    function printSIDRow(r) {
      const dirStr    = r.isLongPass ? 'Long 📈' : 'Short 📉';
      const wrsiStr   = r.wrsi    != null ? r.wrsi.toFixed(1)    : '—';
      const gateStr   = r.wrsiGate === 1  ? '✅' : r.wrsiGate === 0 ? '⚠️' : '—';
      const sma200Str = r.aboveSMA200 === true  ? `Above (${r.sma200Pct != null ? '+'+r.sma200Pct.toFixed(1)+'%' : '✓'})` :
                        r.aboveSMA200 === false ? `Below ⚠️ (${r.sma200Pct != null ? r.sma200Pct.toFixed(1)+'%' : ''})` : '—';
      const aroonStr  = r.aroon  != null ? r.aroon.toFixed(0)  : '—';
      const adxStr    = r.adx    != null ? r.adx.toFixed(1)    : '—';
      const atrStr    = r.atrPct != null ? r.atrPct.toFixed(1) + '%' : '—';
      const rvolStr   = r.rvol   != null ? r.rvol.toFixed(1)   : '—';
      const vdStr     = r.vdPos === true ? 'Buy ✓' : r.vdPos === false ? 'Sell ⚠️' : '—';
      const gp        = gpLabel(r.gpFlag);
      const srcStr    = r.inBTW ? 'BTW ★' :
                        r.inSIDScreener || r.inSIDBrief ? 'SID Scr' :
                        tickerSection[baseTicker(r.sym)] || 'Other';
      const sidExclude = r.isLongPass ? 'SID_LONG' : 'SID_SHORT';
      console.log(`| ${r.sym} | $${fmt(r.price)} | ${dirStr} | ${wrsiStr} | ${gateStr} | ${sma200Str} | ${aroonStr} | ${adxStr} | ${atrStr} | ${rvolStr} | ${vdStr} | ${gp} | ${srcStr} | ${alsoTag(r.sym, sidExclude)} |`);
    }

    if (sidLongs.length > 0) {
      console.log(`*Long candidates (${sidLongs.length}):*\n`);
      console.log(sidHeader);
      console.log(sidDivider);
      sidLongs.forEach(printSIDRow);
      console.log('');
    }

    if (sidShorts.length > 0) {
      console.log(`*Short candidates (${sidShorts.length}):*\n`);
      console.log(sidHeader);
      console.log(sidDivider);
      sidShorts.forEach(printSIDRow);
      console.log('');
    }
  }
  // ── SPY Regime Gate ──
  console.log('---\n');
  const regimeStr = spyAboveEMA21 === true
    ? `✅ SPY Regime: BULLISH — SPY $${spyPrice?.toFixed(2)} above EMA21 $${spyEMA21?.toFixed(2)}`
    : spyAboveEMA21 === false
    ? `⚠️ SPY Regime: BEARISH — SPY $${spyPrice?.toFixed(2)} below EMA21 $${spyEMA21?.toFixed(2)} — Pullback entries not recommended`
    : '⚠️ SPY Regime: unknown (REGIME scan not available)';
  console.log(`*${regimeStr}*\n`);

  // ── Pullback Section ──
  console.log('---\n');

  // Stage counts
  const stage3 = pullbackUnique.filter(r => r.stageInfo.stage === 3);
  const stage2 = pullbackUnique.filter(r => r.stageInfo.stage === 2);
  const stage1 = pullbackUnique.filter(r => r.stageInfo.stage === 1);
  const stage0 = pullbackUnique.filter(r => r.stageInfo.stage === 0);

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

  const pbHeader2 = `${'═'.repeat(44)}\n📈 PULLBACK SCREENER  —  ${pbSorted.length} tickers shown (${stage0.length} WATCH hidden)\n    Stage 3 🟢 ENTRY: ${stage3.length}  |  Stage 2 🟠 EMA21: ${stage2.length}  |  Stage 1 🟡 PB: ${stage1.length}\n    ADX 20–40 filter applied by TV Screener upstream.\n    ⚑ LuxAlgo HTF Divergence: manual chart check required.${pbIndicatorWarn}\n${'═'.repeat(44)}`;

  if (pbSorted.length === 0) {
    const watchNote = stage0.length > 0 ? ` *(${stage0.length} WATCH-only hidden)*` : '';
    console.log(`**📈 PULLBACK** — No Stage 1–3 candidates${watchNote}\n`);
  } else {
    console.log(pbHeader2 + '\n');

    const pbTableHeader  = '| Ticker | Price | Stage | EMA38 | EMA62 | EMA21 | Band↑ | VD | GP Zone | PP | CAP | Also |';
    const pbTableDivider = '|--------|-------|-------|-------|-------|-------|-------|----|---------|-----|-----|------|';
    console.log(pbTableHeader);
    console.log(pbTableDivider);

    pbSorted.forEach(r => {
      const stageStr  = `${r.stageInfo.label}`;
      const ema38Str  = r.ema38 != null ? `$${r.ema38.toFixed(2)}` : '—';
      const ema62Str  = r.ema62 != null ? `$${r.ema62.toFixed(2)}` : '—';
      const ema21Str  = r.ema21 != null ? `$${r.ema21.toFixed(2)}` : '—';
      const bandStr   = r.bandValid === true ? '✓' : r.bandValid === false ? '✗' : '—';
      const vdStr     = r.vdPos === true ? '▲' : r.vdPos === false ? '▼' : '—';
      const gpStr     = pbGpStatus(r.gpFlag, r.gpTop, r.gpBot, r.price, r.atr);
      const ppStr     = r.ppFlag != null && r.ppFlag >= 1 ? '★' : '—';
      const capStr = r.pbCapClimaxDemand > 0 ? '🔥 CD'
                   : r.pbCapStrongDemand > 0 ? '💪 SD'
                   : r.pbCapClimaxSupply > 0 ? '🔥 CS'
                   : r.pbCapStrongSupply > 0 ? '💪 SS'
                   : r.pbCapDemand != null   ? '—' : '';
      console.log(`| ${r.sym} | $${fmt(r.price)} | ${stageStr} | ${ema38Str} | ${ema62Str} | ${ema21Str} | ${bandStr} | ${vdStr} | ${gpStr} | ${ppStr} | ${capStr} | ${alsoTag(r.sym, 'PB')} |`);
    });
    console.log('');

    // Invalidated by GP zone
    if (pbInvalidatedGP.length > 0) {
      console.log(`*⛔ GP Zone invalidated (suppressed): ${pbInvalidatedGP.map(r => r.sym).join(' · ')}*\n`);
    }
  }

  // ── ADX Breakout ──
  console.log('---\n');
  {
    function printAdxBBWPRow(r) {
      const closeStr   = r.price != null ? `$${fmt(r.price)}` : '—';
      const adxStr     = r.adx   != null ? r.adx.toFixed(1)   : '—';
      const bbwpStr    = r.bbwp  != null ? r.bbwp.toFixed(1)  : '—';
      const aboveSMA20 = r.basis != null && r.price != null ? r.price > r.basis : null;
      const direction  = aboveSMA20 === true ? '↑' : aboveSMA20 === false ? '↓' : '—';
      const bqTag      = r.bookerQualUp  === 1 ? ' 🔔 BQ↑'
                       : r.bookerQualDown === 1 ? ' 🔔 BQ↓'
                       : '';
      const alsoStr    = alsoTag(r.sym, 'ADX');
      console.log(`| ${r.sym}${bqTag} | ${closeStr} | ${adxStr} | ${bbwpStr} | ${direction} | ${alsoStr} |`);
    }

    const hasCoiling  = adxCoiling.length  > 0;
    const hasExtended = adxExtended.length > 0;

    if (hasCoiling || hasExtended) {
      if (hasCoiling) {
        console.log(`**⚡ BBWP COILING (≤5%) — ${adxCoiling.length} tickers**\n`);
        console.log('| Ticker | Close | ADX | BBWP | vs SMA20 | Also |');
        console.log('|--------|-------|-----|------|----------|------|');
        adxCoiling.forEach(printAdxBBWPRow);
        console.log('');
      }
      if (hasExtended) {
        console.log(`**⚠️ BBWP EXTENDED (≥98%) — ${adxExtended.length} tickers**\n`);
        console.log('| Ticker | Close | ADX | BBWP | vs SMA20 | Also |');
        console.log('|--------|-------|-----|------|----------|------|');
        adxExtended.forEach(printAdxBBWPRow);
        console.log('');
      }
      console.log('*TV Screener pre-filters ADX 15–18 · BBWP ≤5 = coiling · BBWP ≥98 = extended · 🔔 BQ = Booker Quality signal on this bar*\n');
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
  console.log('*Brief filters: RVOL>1.0, RVOL<4, Aroon>0 & rising, VD>0.5, No LC data excluded*');
  console.log('*Type: Pullback 🔄 = Dist<0.5 · Trend ↗ = Dist 0.5–1.5 · Breakout 🚀 = Dist>1.5 · WRB ✓ = wide range bar in prior bars · ✗ = none*  ');
  console.log('*Pullback v2.0: Stage 3=ENTRY (up_arrow/in-band) · Stage 2=EMA21 (pb_flag+≤3% above EMA21) · Stage 1=PB (pb_flag) · Hard gates: band inverted/GP zone*  ');
  console.log('');
  console.log('📐 **CONFLUENCE FACTORS BY STRATEGY**\n');
  console.log('**LORP:** Distance from Kernel (Pullback 🔄 <0.5 · Trend ↗ 0.5–1.5 · Breakout 🚀 >1.5)  ');
  console.log('         🟢 LC Premium Buy/StopBuy signal · Buy VD ✓ · RVOL >1.0 · Aroon >0 & rising · WRB prior bars · ATR% <5%  ');
  console.log('         Sell VD ⚠️ shown for context only — not entry signals\n');
  console.log('**SID:**  Long: RSI crossed below 30 (OS touch) · RSI rising · MACD ↑ 1 bar · ⚠️ Weekly RSI gate (manual check)  ');
  console.log('          Short: RSI crossed above 70 (OB touch) · RSI falling · MACD ↓ 1 bar · ⚠️ Weekly RSI gate (manual check)  ');
  console.log('          SMA200 tier (HIGH CONVICTION ≥5% away) · ADX context (<20 choppy ✓ · 20-25 ⚠️ danger zone)  ');
  console.log('          ATR% risk · Gap/ATR Ratio at entry (≥2.0 ideal · <1.5 avoid) · VD (ref)  ');
  console.log('          🟡 GP: NEAR / 🟢 GP: IN — zone proximity reference only\n');
  console.log('**PULLBACK v2.0:** Entry trigger: Stage 3 🟢 ENTRY · Stage 2 🟠 EMA21 · Stage 1 🟡 PB  ');
  console.log('                   ADX + EMA21 Trend Setup (Booker Method) · SlingShotSystem bands  ');
  console.log('                   Hard gates: Band inverted → suppressed · Inside GP Zone → suppressed  ');
  console.log('                   ⚑ LuxAlgo HTF Divergence: manual chart check required\n');
  console.log('**ADX BREAKOUT:** Screen: ADX <18 (coiling) · ADX ↑ rising · Box/ATR = box range ÷ ATR (ref) · RVOL ≥2x  ');
  console.log('                  Entry trigger: price breaks above Box Upper (Long) OR below Box Lower (Short)  ');
  console.log('                  VD is reference only — a BUY entry can have positive or negative VD  ');
  console.log('                  Quality: ✅ Up = Booker Quality Up · ↓ Down = Booker Quality Down · — = no signal  ');
  console.log('                  🟡 GP: NEAR / 🟢 GP: IN — zone proximity reference only\n');
  console.log('                  Chart checklist before acting:  ');
  console.log('                  · Price breaking above Box Upper?  ');
  console.log('                  · Breakout bar a WRB?  ');
  console.log('                  · ADX visibly rising?  ');
  console.log('                  · DI+ crossing above or already above DI-?  ');
  console.log('                  · Supply zone overhead that could reject breakout?\n');
  console.log('*⚠️ GP zone flags require GP Zone Exporter on all layouts + columns exported in CSV*');

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
  // Combines today's Buy VD screener tickers with active persistent watchlist tickers.
  // Active watchlist tickers are included so they get scanned on the next brief run
  // even if they've dropped out of the TV Screener.
  const lorpBriefScreenerSyms = lorpScreener
    .filter(r => r.vdPos === true)
    .map(r => bareSym(r.sym));
  const lorpWatchlistActive = globalThis._lorpWatchlist
    ? Object.entries(globalThis._lorpWatchlist)
        .filter(([, e]) => e.status === 'active')
        .map(([sym]) => sym)
        .filter(sym => !lorpBriefScreenerSyms.includes(sym))
    : [];
  const lorpBriefImport = [...lorpBriefScreenerSyms, ...lorpWatchlistActive].sort();

  const importPath = briefFile.replace('.json', '-brief-import.txt');
  fsSync.writeFileSync(importPath, lorpBriefImport.join('\n') + '\n', 'utf8');
  process.stderr.write(`[import] LORP BRIEF import (${lorpBriefImport.length} tickers) written to ${importPath}\n`);

  // ── Watchlist Updates Sidecar ──
  // Generates a JSON sidecar consumed by push-watchlist.cjs to update TV BRIEF sections
  const briefDateMatch = briefFile.match(/brief-(\d{4}-\d{2}-\d{2})/);
  const briefDate = briefDateMatch ? briefDateMatch[1] : new Date().toISOString().split('T')[0];

  const sidBriefTickers = sidResults
    .filter(r => !r.error && (r.isLongPass || r.isShortPass))
    .map(r => r.sym);

  // Both coiling (BBWP ≤5) and extended (BBWP ≥98) pushed to Brief Output
  const adxBriefTickers = adxCoilingAll.map(r => r.sym);

  const pullbackBriefTickers = pullbackAll
    .filter(r => r.stageInfo && r.stageInfo.stage >= 1)
    .map(r => r.sym);

  // Merge all four strategy outputs into a single deduplicated, sorted list
  const briefOutputTickers = [
    ...new Set([
      ...lorpBriefImport,
      ...sidBriefTickers.map(s => bareSym(s)),
      ...adxBriefTickers.map(s => bareSym(s)),
      ...pullbackBriefTickers.map(s => bareSym(s)),
    ]),
  ].sort();

  const watchlistUpdates = {
    date: briefDate,
    generated_at: new Date().toISOString(),
    sections: {
      'Brief Output': briefOutputTickers,
    },
  };

  const sidecarPath = /-lorp\.json$/.test(briefFile)
    ? briefFile.replace(/-lorp\.json$/, '-watchlist-updates.json')
    : briefFile.replace(/\.json$/, '-watchlist-updates.json');
  fsSync.writeFileSync(sidecarPath, JSON.stringify(watchlistUpdates, null, 2), 'utf8');
  process.stderr.write(`[watchlist] Updates written to ${sidecarPath}\n`);

  // Also append to tables output
  if (lorpBriefImport.length > 0) {
    const importNote = `\n---\n\n**📋 Brief Output — ${briefOutputTickers.length} tickers** *(LORP Buy VD · SID · ADX · Pullback — pushed to watchlist)*\n\n${briefOutputTickers.join(' · ')}\n`;
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
    console.log('  Ticker  Price       EMA21       ADX    ATR%   RVOL   VD          Aroon');
    console.log('  ' + '─'.repeat(75));
    lorp.forEach(r => {
      const vdStr    = r.vdPos === true ? 'Buy ✓' : r.vdPos === false ? 'Sell ⚠️' : '—';
      const ema21Str = r.lorpEMA21 != null ? `$${r.lorpEMA21.toFixed(2)}` : '—';
      const adxStr   = r.adx     != null ? r.adx.toFixed(1)     : '—';
      const atrStr   = r.atrPct  != null ? r.atrPct.toFixed(1) + '%' : '—';
      const rvolStr  = r.rvol    != null ? r.rvol.toFixed(1)    : '—';
      const aroonStr = r.aroon   != null ? r.aroon.toFixed(0)   : '—';
      console.log(`  ${r.sym.padEnd(6)}  $${String(r.price?.toFixed(2)).padEnd(10)} ${ema21Str.padEnd(10)}  ${adxStr.padEnd(5)}  ${atrStr.padEnd(6)} ${rvolStr.padEnd(6)} ${vdStr.padEnd(10)}  ${aroonStr}`);
    });
    console.log('');
  }

  // ── LORP Watch ──
  if (lorpWatch.length > 0) {
    console.log('═'.repeat(60));
    console.log(`\n⚠️ LORP WATCH — ${lorpWatch.length} signals (Tier 1 pass, Tier 2 marginal)\n`);
    console.log('  Review Tier 2 breakdown before acting.\n');
    lorpWatch.forEach(r => {
      const ema21Str = r.lorpEMA21 != null ? `EMA21 $${r.lorpEMA21.toFixed(2)}` : 'EMA21 n/a';
      const adxStr   = r.adx     != null ? `ADX ${r.adx.toFixed(1)}` : 'ADX n/a';
      const atrStr   = r.atrPct  != null ? `ATR% ${r.atrPct.toFixed(1)}%` : 'ATR% n/a';
      console.log(`  ${r.sym.padEnd(6)}  $${String(r.price?.toFixed(2)).padEnd(10)} ${ema21Str}  ${adxStr}  ${atrStr}`);
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
  console.log('  LORP:     Signals from LORP Confluence v1.2 indicator. Missing: Weekly RSI/MACD,');
  console.log('            HTF divergence — verify on chart before acting.');
  console.log('  ADX:      Box data + breakout direction — verify on chart before acting.');
  console.log('  PULLBACK: Pullback=1/Breakout=1 from ADX + EMA21 Trend Setup (Booker Method).\n');

} // end VERBOSE
