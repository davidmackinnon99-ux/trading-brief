#!/usr/bin/env node
// Build the local sector-rotation companion consumed by rotation-header.cjs.
// This deliberately reports only what the local sector scan measures: each
// SPDR sector ETF versus SPY over the same 3-5 session window. It does not
// invent the cloud report's sub-industry, volume, RSI or moving-average fields.
'use strict';

const fs = require('fs');
const path = require('path');

const [input, outputDir, reportDateArg] = process.argv.slice(2);
if (!input || !outputDir) {
  console.error('Usage: sector-rotation-report.cjs <brief-DATE-sectors.json> <output-dir> [DATE]');
  process.exit(2);
}

const NAMES = {
  XLB: 'Materials', XLC: 'Communication Services', XLE: 'Energy', XLF: 'Financials',
  XLI: 'Industrials', XLK: 'Technology', XLP: 'Consumer Staples', XLRE: 'Real Estate',
  XLU: 'Utilities', XLV: 'Health Care', XLY: 'Consumer Discretionary',
};

const round = n => Math.round(n * 100) / 100;
const signed = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const current = load(input);
const generatedAt = new Date(current.generated_at);
const newYorkDate = Number.isNaN(generatedAt.valueOf()) ? null : new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(generatedAt);
const reportDate = reportDateArg || newYorkDate || path.basename(input).match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
const briefDir = path.dirname(input);

// Use up to three prior saved scans. The change in relative strength from the
// oldest available observation is context/persistence, not an entry gate.
const histories = fs.readdirSync(briefDir)
  .filter(f => /^brief-\d{4}-\d{2}-\d{2}-sectors\.json$/.test(f) && path.join(briefDir, f) !== input)
  .sort()
  .slice(-3)
  .map(f => {
    try { return load(path.join(briefDir, f)); } catch { return null; }
  })
  .filter(Boolean);

const spy = Number(current.spy_change_pct);
if (!Number.isFinite(spy)) {
  console.error('Sector rotation report: current SPY change is unavailable');
  process.exit(1);
}

const groups = Object.entries(current.etfs || {}).map(([ticker, raw]) => {
  const change = Number(raw);
  const rs = change - spy;
  const priorRs = histories.map(h => {
    const e = Number(h.etfs?.[ticker]);
    const s = Number(h.spy_change_pct);
    return Number.isFinite(e) && Number.isFinite(s) ? e - s : null;
  }).filter(Number.isFinite);
  const baseline = priorRs.length ? priorRs[0] : null;
  const shift = baseline == null ? null : rs - baseline;
  const supportiveCount = priorRs.filter(v => v >= 0.5).length + (rs >= 0.5 ? 1 : 0);
  const opposedCount = priorRs.filter(v => v <= -0.5).length + (rs <= -0.5 ? 1 : 0);
  const observed = priorRs.length + 1;
  let status = 'NEUTRAL';
  if (rs >= 0.5 && supportiveCount >= Math.min(2, observed)) status = 'PERSISTENT INFLOW';
  else if (rs >= 0.5) status = 'NEW INFLOW';
  else if (rs <= -0.5 && opposedCount >= Math.min(2, observed)) status = 'PERSISTENT OUTFLOW';
  else if (rs <= -0.5) status = 'NEW OUTFLOW';
  return {
    name: NAMES[ticker] || ticker,
    ticker,
    change_pct: round(change),
    rs5: round(rs),
    shift: shift == null ? null : round(shift),
    status,
    observations: observed,
  };
}).sort((a, b) => b.rs5 - a.rs5);

const beating = groups.filter(g => g.rs5 > 0).length;
const inflow = groups.filter(g => g.rs5 >= 0.5);
const outflow = groups.filter(g => g.rs5 <= -0.5).sort((a, b) => a.rs5 - b.rs5);
const windowBars = Number(current.lookback_bars) || 4;
const summary = inflow.length && outflow.length
  ? `Rotation is split: leadership in ${inflow.slice(0, 3).map(g => g.ticker).join(', ')}, while ${outflow.slice(0, 3).map(g => g.ticker).join(', ')} lag SPY.`
  : inflow.length ? `Broadly supportive rotation, led by ${inflow.slice(0, 3).map(g => g.ticker).join(', ')}.`
  : outflow.length ? `Broadly defensive rotation: ${outflow.slice(0, 3).map(g => g.ticker).join(', ')} are the principal SPY laggards.`
  : 'Sector relative performance is tightly clustered around SPY.';

const json = {
  schema: 'local-sector-rotation-v1',
  date: reportDate,
  generated_at: current.generated_at,
  lookback_bars: windowBars,
  spy_5d: round(spy),
  beating_spy: beating,
  total: groups.length,
  groups,
  summary,
  limitations: 'Local report: sector ETFs versus SPY only. No sub-industry, volume, RSI, MA or fund-flow fields are inferred.',
};

fs.mkdirSync(outputDir, { recursive: true });
const base = path.join(outputDir, `sector_rotation_${reportDate}`);
fs.writeFileSync(`${base}.json`, JSON.stringify(json, null, 2) + '\n');

const rows = groups.map(g => `| ${g.name} (${g.ticker}) | ${signed(g.change_pct)}% | ${signed(g.rs5)}% | ${g.shift == null ? 'n/a' : signed(g.shift)} | ${g.status} |`).join('\n');
const md = `# Sector Rotation — US close ${reportDate}\n\n` +
  `SPY: ${signed(spy)}% over the last ${windowBars} sessions. ${beating} of ${groups.length} sectors beat SPY.\n\n` +
  `| Sector | ${windowBars}-session % | RS vs SPY | Multi-scan shift | Status |\n` +
  `| --- | ---: | ---: | ---: | --- |\n${rows}\n\n` +
  `## What it means\n\n${summary}\n\n` +
  `Sector direction is additional support or risk context, never a SID entry gate. Industries and individual stocks can diverge from their parent sector.\n\n` +
  `Caveat: this local report measures price relative strength across the 11 SPDR sectors. It does not claim fund flows and does not reproduce the cloud report's sub-industry, volume, RSI or moving-average analysis.\n`;
fs.writeFileSync(`${base}.md`, md);
console.log(`[rotation] wrote ${base}.json and ${base}.md`);

