const fs = require('fs');
function loadFirstJSON(f) {
  const raw = fs.readFileSync(f, 'utf8').replace(/^[^{]*/, '');
  try { return JSON.parse(raw); } catch(e) {
    let depth=0, i=0, inStr=false, escape=false;
    for (; i<raw.length; i++) {
      const c = raw[i];
      if (escape)       { escape=false; continue; }
      if (c === '\\')   { escape=true;  continue; }
      if (c === '"')    { inStr=!inStr; continue; }
      if (inStr)        { continue; }
      if (c === '{')    { depth++; }
      else if (c==='}') { depth--; if (depth===0) { i++; break; } }
    }
    return JSON.parse(raw.slice(0, i));
  }
}

const data = loadFirstJSON('/Users/davidmackinnon/.tradingview-mcp/briefs/brief-2026-05-22-lorp.json');
const CHECK = ['SIRI','ENS','HLIO','KYIV','TXN','IVW'];

data.symbols_scanned.forEach(s => {
  const base = (s.symbol || '').split(':').pop();
  if (!CHECK.includes(base)) return;
  const studies = s.indicators?.studies || [];
  const aroon = studies.find(st => st.name.toLowerCase().includes('aroon'));
  console.log(`\n${base} Aroon values:`, JSON.stringify(aroon?.values || {}));
});
