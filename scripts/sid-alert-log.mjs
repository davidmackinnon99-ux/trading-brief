#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// SID alert log export (David, 7 Oct 2026)
// Reads TradingView's own alert-fire log (the alerts David actually received) and saves
// the SID ENTRY fires for the latest daily bar, so the brief reviews exactly the list
// TradingView sent — not only what the chart scan detected. One HTTP call through the
// already-open TradingView Desktop session (same cookie the app uses). No chart changes.
//
// Usage: node scripts/sid-alert-log.mjs <out.json> [barDate]
// Output: { fetched_at, bar_date, sid: [{ticker, chart_symbol, pro_symbol, close, fire_time, bar_time}],
//           ldc: [...same for LORP "LDC Open" alerts...], other_count }
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import { evaluateAsync, disconnect } from '../src/connection.js';

const out = process.argv[2];
if (!out) { console.error('usage: sid-alert-log.mjs <out.json>'); process.exit(2); }

const SID_PREFIX = 'SID ENTRY';   // alert message template: "SID ENTRY {{ticker}} | Close={{close}}"
const LDC_PREFIX = 'LDC Open';    // LORP alert: "LDC Open Long ▲ | {{ticker}}@{{close}} | ({{interval}})"

function parseSym(raw) {
  try { return JSON.parse(String(raw).replace(/^=/, '')).symbol || raw; } catch (e) { return raw; }
}

try {
  const txt = await evaluateAsync(`fetch('https://pricealerts.tradingview.com/list_fires', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ payload: { limit: 1000 } }) }).then(r => r.text())`);
  const j = JSON.parse(txt);
  if (j.s !== 'ok' || !Array.isArray(j.r)) throw new Error(j.errmsg || 'unexpected response');
  const rows = j.r.map((f) => {
    const chart = parseSym(f.symbol), pro = parseSym(f.pro_symbol);
    const ticker = String(pro || chart).split(':').pop();
    const m = String(f.message || '');
    const close = (m.match(/Close=([0-9.]+)/) || m.match(/@([0-9.]+)/) || [])[1];
    return { ticker, chart_symbol: chart, pro_symbol: pro, close: close ? Number(close) : null,
      fire_time: f.fire_time, bar_time: f.bar_time, message: m, resolution: f.resolution };
  }).filter((r) => r.resolution === '1D');
  const sidAll = rows.filter((r) => r.message.startsWith(SID_PREFIX));
  // optional 2nd arg = bar date (YYYY-MM-DD, US session date) to export an earlier day
  const barDate = process.argv[3] || sidAll.map((r) => String(r.bar_time).slice(0, 10)).sort().pop() || null;
  const latest = (list) => {
    const seen = new Map();
    for (const r of list.filter((x) => String(x.bar_time).slice(0, 10) === barDate)) if (!seen.has(r.ticker)) seen.set(r.ticker, r);
    return [...seen.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  };
  const res = { fetched_at: new Date().toISOString(), bar_date: barDate, sid: latest(sidAll),
    ldc: latest(rows.filter((r) => r.message.startsWith(LDC_PREFIX))),
    other_count: rows.filter((r) => !r.message.startsWith(SID_PREFIX) && !r.message.startsWith(LDC_PREFIX)).length };
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  process.stderr.write(`[sid-alert-log] bar ${barDate}: ${res.sid.length} SID ENTRY, ${res.ldc.length} LDC alerts → ${out}\n`);
} catch (e) {
  process.stderr.write(`[sid-alert-log] failed (${e.message}) — brief will use the scan's own entry signals only\n`);
}
await disconnect().catch(() => {});
process.exit(0);
