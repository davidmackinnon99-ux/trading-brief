#!/usr/bin/env node
// Diagnostic: check specific tickers across all brief JSONs
const fs   = require('fs');
const path = require('path');

const BRIEFS = process.env.HOME + '/.tradingview-mcp/briefs';
const DATE   = new Date().toISOString().slice(0,10);
const CHECK  = ['KO','COST','SM','RBRK','RVMD','DRH','AAMI'];

function loadFirstJSON(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^[^{]*/, '');
  try { return JSON.parse(raw); } catch(e) {
    let depth=0, i=0, inStr=false, escape=false;
    for(; i<raw.length; i++) {
      const c=raw[i];
      if(escape){escape=false;continue;}
      if(c==='\\'){escape=true;continue;}
      if(c==='"'){inStr=!inStr;continue;}
      if(inStr)continue;
      if(c==='{')depth++;
      else if(c==='}'){depth--;if(depth===0){i++;break;}}
    }
    return JSON.parse(raw.slice(0,i));
  }
}

const files = {
  SID:  `${BRIEFS}/brief-${DATE}-sid.json`,
  LORP: `${BRIEFS}/brief-${DATE}-lorp.json`,
};

for (const [layout, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) { console.log(`\n[${layout}] file not found`); continue; }
  const data = loadFirstJSON(file);
  const syms = data.symbols_scanned || [];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${layout}] ${syms.length} symbols scanned`);

  for (const ticker of CHECK) {
    const s = syms.find(x => (x.symbol||'').split(':').pop() === ticker);
    if (!s) { console.log(`  ${ticker}: NOT IN SCAN`); continue; }
    if (s.error) { console.log(`  ${ticker}: ERROR — ${s.error}`); continue; }

    const studies = s.indicators?.studies || [];
    console.log(`\n  ${ticker}:`);
    for (const st of studies) {
      const vals = st.values || {};
      const summary = Object.entries(vals)
        .map(([k,v]) => `${k}=${v}`)
        .join(' | ');
      console.log(`    [${st.name}] ${summary}`);
    }
  }
}
