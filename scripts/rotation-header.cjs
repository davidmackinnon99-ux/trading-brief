#!/usr/bin/env node
// rotation-header.cjs — prints a short "Rotation" header for the top of the morning brief.
// Prefers the JSON companion written locally by sector-rotation-report.cjs.
// If only the Markdown report was downloaded, print a compact truthful fallback rather
// than incorrectly saying that no rotation report exists.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const args = process.argv.slice(2);
const di = args.indexOf('--date');
const wantDate = di >= 0 ? args[di + 1] : null;
const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--date') || path.join(os.homedir(), 'Downloads', 'Briefs');

function candidates() {
  const dirs = [...new Set([dir, path.dirname(dir)])];
  const found = [];
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(d).filter(f => /^sector_rotation_\d{4}-\d{2}-\d{2}\.(json|md)$/.test(f)); } catch { continue; }
    if (wantDate) files = files.filter(f => f.includes(wantDate));
    found.push(...files.map(f => path.join(d, f)));
  }
  return found.sort();
}
function newest() {
  const files = candidates();
  if (!files.length) return null;
  const dates = files.map(f => path.basename(f).match(/\d{4}-\d{2}-\d{2}/)[0]);
  const latest = dates.sort().at(-1);
  const json = files.find(f => f.includes(latest) && f.endsWith('.json'));
  const md = files.find(f => f.includes(latest) && f.endsWith('.md'));
  // A rich emailed Markdown report is canonical over our deliberately compact
  // local JSON fallback. A future rich cloud JSON companion remains preferred.
  if (json && md) {
    try {
      const parsed = JSON.parse(fs.readFileSync(json, 'utf8'));
      if (parsed.schema === 'local-sector-rotation-v1') return md;
    } catch {}
  }
  return json || md;
}
const f = newest();
if (!f) { console.log('ROTATION: no sector rotation report found in ' + dir + ' or ' + path.dirname(dir) + ' — check the 6:15 email.'); process.exit(0); }
if (f.endsWith('.md')) {
  const md = fs.readFileSync(f, 'utf8');
  const date = (md.match(/^# Sector Rotation — US close (\d{4}-\d{2}-\d{2})/m) || [])[1] || 'unknown date';
  const spy = (md.match(/^SPY:\s*(.+)$/m) || [])[1] || 'summary unavailable';
  const meaning = (md.match(/^## What it means\s+\n+([^\n]+)/m) || [])[1] || 'See the full report for rotation context.';
  console.log(`ROTATION — US close ${date}: ${spy}`);
  console.log(`  Context: ${meaning}`);
  console.log(`  Full report: ${f}`);
  process.exit(0);
}
let J;
try { J = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log('ROTATION: could not read ' + path.basename(f) + ' (' + e.message + ').'); process.exit(0); }

const ageDays = (Date.now() - Date.parse(J.date + 'T20:00:00Z')) / 864e5;
const stale = ageDays > 4 ? `  ** STALE: latest report is ${J.date} **` : '';
const sg = n => (n > 0 ? '+' : '') + n.toFixed(1);
const lbl = g => `${g.name} (${g.ticker})`;
const G = J.groups || [];
const list = (arr, fn, max = 5) => arr.length ? arr.slice(0, max).map(fn).join('; ') : 'none';
const below2 = g => /^below/.test(g.ma50 || '') && /^below/.test(g.ma200 || '');

if (J.schema === 'local-sector-rotation-v1') {
  const G = J.groups || [];
  const inflow = G.filter(g => g.rs5 >= 0.5).sort((a, b) => b.rs5 - a.rs5);
  const outflow = G.filter(g => g.rs5 <= -0.5).sort((a, b) => a.rs5 - b.rs5);
  const fmt = g => `${lbl(g)} ${sg(g.rs5)}% vs SPY${Number.isFinite(g.shift) ? `, shift ${sg(g.shift)}` : ''}`;
  console.log(`ROTATION — US close ${J.date}: SPY ${sg(J.spy_5d)}% over ${J.lookback_bars} sessions, ${J.beating_spy}/${J.total} sectors beating SPY${stale}`);
  console.log(`  Supportive: ${list(inflow, fmt, 4)}`);
  console.log(`  Opposed:    ${list(outflow, fmt, 4)}`);
  console.log(`  Context: ${J.summary}`);
  console.log('  Rotation is context only, not a SID gate; industries may diverge from their sector.');
  console.log(`  Full report: ${path.join(path.dirname(f), path.basename(f).replace('.json', '.md'))}`);
  process.exit(0);
}

const trig = G.filter(g => g.sid_stage === 'SID TRIGGER').sort((a, b) => a.rsi - b.rsi);
const setup = G.filter(g => g.sid_stage === 'SID SETUP').sort((a, b) => a.rsi - b.rsi);
const watch = G.filter(g => g.sid_stage === 'SID WATCH').sort((a, b) => a.rsi - b.rsi);
const inflow = G.filter(g => g.rs5 > 0 && g.shift > 0).sort((a, b) => b.shift - a.shift);
const outflow = G.filter(g => g.status === 'FADING' || g.rs5 < 0).sort((a, b) => a.rs5 - b.rs5);
const ob = G.filter(g => g.overbought).sort((a, b) => b.rsi - a.rsi);
const nearOb = G.filter(g => !g.overbought && g.rsi >= 67).sort((a, b) => b.rsi - a.rsi);

const L = [];
L.push(`ROTATION — US close ${J.date}: SPY ${sg(J.spy_5d)}% 5D (prior month ${sg(J.spy_prior)}%), ${J.beating_spy}/${J.total} groups beating SPY${stale}`);
L.push(`  SID triggers: ${list(trig, g => `${lbl(g)} RSI ${g.rsi} (low ${g.rsi_low5}), vol ${g.vol_ratio}x`)}`);
L.push(`  SID setups:   ${list(setup, g => `${lbl(g)} RSI ${g.rsi}`)}${watch.length ? '  | watch: ' + list(watch, g => `${g.ticker} ${g.rsi}`) : ''}`);
L.push(`  Money in:     ${list(inflow, g => `${lbl(g)} ${sg(g.r5)}%${g.vol_ratio >= 1 ? ' vol ' + g.vol_ratio + 'x' : ' light vol'}${below2(g) ? ' [below 50/200]' : ''}`)}`);
L.push(`  Money out:    ${list(outflow, g => `${lbl(g)} ${sg(g.r5)}%${g.vol_ratio >= 1.2 ? ' heavy vol ' + g.vol_ratio + 'x' : ''}`, 4)}`);
L.push(`  Overbought:   ${ob.length ? list(ob, g => `${lbl(g)} RSI ${g.rsi}`) : 'none'}${nearOb.length ? '  | near: ' + list(nearOb, g => `${g.ticker} ${g.rsi}`) : ''}`);
L.push(`  Full report: ${path.join(dir, path.basename(f).replace('.json', '.md'))}`);
console.log(L.join('\n'));
