// layout-audit.mjs — READ-ONLY audit of every open TradingView chart tab (CDP port 9222).
// For each tab: layout name/id, symbol, timeframe, and every study (incl. hidden) with its inputs.
// Nothing is clicked or changed. Usage: node scripts/layout-audit.mjs > out.json
import CDP from 'chrome-remote-interface';
const targets = (await (await fetch('http://localhost:9222/json/list')).json())
  .filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url));
const out = [];
for (const t of targets) {
  let c;
  try {
    c = await CDP({ host: 'localhost', port: 9222, target: t.id });
    const expr = `(function(){
      try {
        var api = window.TradingViewApi; var w = api._activeChartWidgetWV.value();
        var layoutName = null; try { layoutName = api.layoutName ? api.layoutName() : null; } catch(e) {}
        var studies = w.getAllStudies().map(function(s){
          var st = w.getStudyById(s.id), inputs = null, vis = null;
          try { vis = st.isVisible(); } catch(e) {}
          try { inputs = st.getInputValues().filter(function(i){ return !(typeof i.value === 'string' && i.value.length > 300); }); } catch(e) {}
          return { id: s.id, name: s.name, visible: vis, inputs: inputs };
        });
        return JSON.stringify({ layoutName: layoutName, symbol: w.symbol(), resolution: w.resolution(), studies: studies });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()`;
    const r = await c.Runtime.evaluate({ expression: expr, returnByValue: true });
    out.push({ title: t.title, url: t.url, chart_id: t.url.match(/\/chart\/([^/?]+)/)?.[1] || null, ...JSON.parse(r.result.value || '{}') });
  } catch (e) {
    out.push({ title: t.title, url: t.url, error: e.message });
  } finally { if (c) await c.close(); }
}
console.log(JSON.stringify(out, null, 1));
process.exit(0);
