// One-off (17 Oct 2026): recreate David's main TradingView watchlist from the saved
// rules.json copy (10 sections, exchange-qualified symbols). Creates a NEW list; touches nothing else.
import fs from 'fs';
import { evaluateAsync, disconnect } from '../../src/connection.js';
const rules = JSON.parse(fs.readFileSync(new URL('../../rules.backup-2026-10-16-full-watchlist.json', import.meta.url)));
const q = rules.watchlist_qualified || {};
const SEP = '###⁤';
const symbols = []; const seen = new Set(); const missingPrefix = [];
for (const [section, tickers] of Object.entries(rules.watchlist_sections)) {
  symbols.push(SEP + section);
  for (const t of tickers) {
    const full = q[t] || null;
    if (!full) { missingPrefix.push(t); continue; }
    if (seen.has(full)) continue;
    seen.add(full); symbols.push(full);
  }
}
const name = process.argv[2] || 'Main Watchlist';
if (process.argv.includes('--dry')) { console.log(JSON.stringify({ name, entries: symbols.length, unique: seen.size, missingPrefix, head: symbols.slice(0, 15) })); process.exit(0); }
const body = JSON.stringify({ name, symbols });
const r = await evaluateAsync(`fetch('/api/v1/symbols_list/custom/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(body)} }).then(async r => r.status + ' ' + (await r.text())).catch(e => 'ERR ' + e.message)`);
console.log(String(r).slice(0, 400));
await disconnect(); process.exit(0);
