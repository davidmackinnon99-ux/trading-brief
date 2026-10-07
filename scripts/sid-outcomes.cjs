#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SID alert outcome tracker (David, 7 Oct 2026 — SID_DAILY_BRIEF_REQUIREMENTS.md §8–9)
//
// Fills the `outcome` field of every record in brief-YYYY-MM-DD-sid-audit.json using
// the SID-layout scans that the morning brief ALREADY saves each day
// (brief-YYYY-MM-DD-sid.json). No extra TradingView scans.
//
// Per alert, from the bar after the alert until RSI 50 is reached or EXPIRY_BARS pass:
//   rsi50_reached / bars_to_rsi50      (SID Trading Signals Pro "RSI (0-100)")
//   bb_mid_reached / bars_to_bb_mid    (long: high ≥ BB Basis; short: low ≤ BB Basis)
//   sma50_reached / sma200_reached     (only where the MA was ahead at the alert)
//   cap_zone_touched                   (opposing CAP zone ahead at the alert was touched)
//   mfe_atr / mae_atr                  (vs alert close, in alert-day ATR)
//   status: open | rsi50 | expired
// Caveat: only days with a saved SID scan are seen (missed scans = missed bars); each
// record carries snapshots_seen and trading_days_elapsed so that can be judged.
//
// Usage: node scripts/sid-outcomes.cjs [briefsDir]
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const EXPIRY_BARS = 15;
const LOOKBACK_DAYS = 45;
const dir = process.argv[2] || path.join(process.env.HOME, '.tradingview-mcp', 'briefs');

const num = (v) => { if (v == null) return null; const n = parseFloat(String(v).replace(/−/g, '-').replace(/[^0-9.\-+]/g, '')); return Number.isFinite(n) ? n : null; };
function tradingDaysBetween(a, b) { // weekdays after a up to and including b
  const from = new Date(a + 'T00:00:00'), to = new Date(b + 'T00:00:00');
  let n = 0; const c = new Date(from); c.setDate(c.getDate() + 1);
  while (c <= to) { const d = c.getDay(); if (d !== 0 && d !== 6) n++; c.setDate(c.getDate() + 1); }
  return n;
}
function loadFirstJSON(p) {
  const raw = fs.readFileSync(p, 'utf8').replace(/^[^{]*/, '');
  try { return JSON.parse(raw); } catch (e) {
    let depth = 0, i = 0, inStr = false, esc = false;
    for (; i < raw.length; i++) { const ch = raw[i]; if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '"') { inStr = !inStr; continue; } if (inStr) continue; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { i++; break; } } }
    return JSON.parse(raw.slice(0, i));
  }
}

const files = fs.readdirSync(dir);
const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
const audits = files.filter((f) => /^brief-\d{4}-\d{2}-\d{2}-sid-audit\.json$/.test(f) && f.slice(6, 16) >= cutoff).sort();
const scans = files.filter((f) => /^brief-\d{4}-\d{2}-\d{2}-sid\.json$/.test(f)).map((f) => f.slice(6, 16)).sort();
const scanCache = new Map();
function scanIndex(date) {
  if (scanCache.has(date)) return scanCache.get(date);
  let m = null;
  try {
    const p = path.join(dir, `brief-${date}-sid.json`);
    if (fs.statSync(p).size) {
      m = new Map();
      for (const s of (loadFirstJSON(p).symbols_scanned || [])) {
        if (s.error) continue;
        const sts = s.indicators?.studies || [];
        const ex = (pre) => sts.find((x) => String(x.name || '').startsWith(pre));
        const v = (st, k) => (st && st.values && Object.prototype.hasOwnProperty.call(st.values, k) ? num(st.values[k]) : null);
        const pro = ex('SID Trading Signals Pro'), bb = ex('Bollinger Bands'), strat = ex('SID Strategy');
        m.set(s.symbol, { rsi: v(pro, 'RSI (0-100)'), bb: v(bb, 'Basis'), sma50: v(strat, 'SMA50 Value'), sma200: v(pro, 'SMA200'),
          close: num(s.quote?.close ?? s.quote?.last), high: num(s.quote?.high), low: num(s.quote?.low) });
      }
    }
  } catch (e) { m = null; }
  scanCache.set(date, m);
  return m;
}

let updated = 0, open = 0;
for (const f of audits) {
  const p = path.join(dir, f);
  let audit;
  try { audit = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  const alertDate = f.slice(6, 16);
  let changed = false;
  for (const rec of audit.records || []) {
    if (rec.outcome && rec.outcome.status !== 'open') continue;
    const a = rec.raw || {};
    const long = rec.direction === 'long';
    const entry = a.close, atr = a.atr;
    if (entry == null || !atr) { rec.outcome = { status: 'expired', note: 'no entry price/ATR in audit' }; changed = true; continue; }
    const later = scans.filter((d) => d > alertDate);
    const o = { status: 'open', snapshots_seen: 0, trading_days_elapsed: 0, rsi50_reached: false, bars_to_rsi50: null,
      bb_mid_reached: false, bars_to_bb_mid: null, sma50_reached: null, sma200_reached: null, cap_zone_touched: null,
      mfe_atr: 0, mae_atr: 0, event_status: (rec.reason_codes || []).filter((c) => /EARNINGS|OVERNIGHT|ENTRY_MISSED/.test(c)),
      updated_at: new Date().toISOString() };
    const ma50Ahead = a.sma50 != null && (long ? a.sma50 > entry : a.sma50 < entry);
    const ma200Ahead = a.sma200 != null && (long ? a.sma200 > entry : a.sma200 < entry);
    if (ma50Ahead) o.sma50_reached = false;
    if (ma200Ahead) o.sma200_reached = false;
    const oppZone = rec.derived?.cap?.opposing?.state === 'ahead' ? (long ? rec.derived.cap.supply : rec.derived.cap.demand) : null;
    if (oppZone) o.cap_zone_touched = false;
    for (const d of later) {
      const bars = tradingDaysBetween(alertDate, d);
      if (bars > EXPIRY_BARS) break;
      const idx = scanIndex(d);
      const b = idx && idx.get(rec.symbol);
      o.trading_days_elapsed = bars;
      if (!b) continue;
      o.snapshots_seen++;
      if (b.high != null && b.low != null) {
        const fav = long ? (b.high - entry) / atr : (entry - b.low) / atr;
        const adv = long ? (entry - b.low) / atr : (b.high - entry) / atr;
        o.mfe_atr = Math.max(o.mfe_atr, +fav.toFixed(2));
        o.mae_atr = Math.max(o.mae_atr, +adv.toFixed(2));
      }
      if (!o.bb_mid_reached && b.bb != null && (long ? b.high >= b.bb : b.low <= b.bb)) { o.bb_mid_reached = true; o.bars_to_bb_mid = bars; }
      if (o.sma50_reached === false && b.sma50 != null && (long ? b.high >= b.sma50 : b.low <= b.sma50)) o.sma50_reached = bars;
      if (o.sma200_reached === false && b.sma200 != null && (long ? b.high >= b.sma200 : b.low <= b.sma200)) o.sma200_reached = bars;
      if (o.cap_zone_touched === false && (long ? b.high >= oppZone.lo : b.low <= oppZone.hi)) o.cap_zone_touched = bars;
      if (b.rsi != null && (long ? b.rsi >= 50 : b.rsi <= 50)) { o.rsi50_reached = true; o.bars_to_rsi50 = bars; o.status = 'rsi50'; break; }
    }
    const elapsedNow = tradingDaysBetween(alertDate, new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' }));
    if (o.status === 'open' && elapsedNow > EXPIRY_BARS) o.status = 'expired';
    if (o.status === 'open') open++;
    rec.outcome = o; changed = true; updated++;
  }
  if (changed) fs.writeFileSync(p, JSON.stringify(audit, null, 1));
}
process.stderr.write(`[sid-outcomes] ${audits.length} audit file(s), ${updated} record(s) updated, ${open} still open\n`);
