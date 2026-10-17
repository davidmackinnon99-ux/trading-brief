// One-off: add symbols (from a CSV/txt with EXCHANGE:TICKER lines) to the end of a section
// in the active custom watchlist, skipping any already on the list.
import fs from 'fs';
import { evaluateAsync, disconnect } from '../../src/connection.js';
const [file, section, listId] = process.argv.slice(2);
const want = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => /^[A-Z_]+:[A-Z0-9.]+$/.test(s));
const cur = JSON.parse(await evaluateAsync(`fetch('/api/v1/symbols_list/custom/${listId}/', {credentials:'include'}).then(r => r.text())`));
const syms = cur.symbols;
const have = new Set(syms.filter(s => !s.startsWith('###')).map(s => s.split(':').pop()));
const add = want.filter(s => !have.has(s.split(':').pop()));
const hdr = syms.findIndex(s => s.startsWith('###') && s.toUpperCase().includes(section.toUpperCase()));
if (hdr < 0) { console.log('section not found'); process.exit(1); }
let end = syms.findIndex((s, i) => i > hdr && s.startsWith('###')); if (end < 0) end = syms.length;
const next = [...syms.slice(0, end), ...add, ...syms.slice(end)];
if (process.argv.includes('--dry')) { console.log(JSON.stringify({ name: cur.name, before: syms.length, add: add.length, after: next.length, sample: add.slice(0, 8) })); process.exit(0); }
const r = await evaluateAsync(`fetch('/api/v1/symbols_list/custom/${listId}/replace/?unsafe=true', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: ${JSON.stringify(JSON.stringify(next))}}).then(async r => r.status + ' ' + (await r.text()).length)`);
console.log(JSON.stringify({ added: add.length, after: next.length, response: r }));
await disconnect(); process.exit(0);
