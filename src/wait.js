import { evaluate } from './connection.js';

const DEFAULT_TIMEOUT = 12000;
const POLL_INTERVAL = 100;

// ── Phase 1 probe: price data ready ──────────────────────────────────────────
// mainSeries().isLoading() flips false the moment price data for the new symbol is
// loaded (~0.5s) — far faster/more reliable than the old DOM bar-count heuristic.
const PRICE_READY_EXPR = `
  (function() {
    try {
      var cw = window.TradingViewApi._activeChartWidgetWV.value();
      var chart = (cw && cw._chartWidget) ? cw._chartWidget : cw;
      var ms = chart.model().mainSeries();
      var sym = '';
      try { var si = ms.symbolInfo(); sym = si ? (si.full_name || si.name || '') : ''; } catch (e) {}
      var nbars = 0;
      try { nbars = ms.bars().size(); } catch (e) { try { nbars = ms.bars().length; } catch (e2) {} }
      return JSON.stringify({ ok: true, isLoading: !!ms.isLoading(), sym: sym, bars: nbars });
    } catch (e) { return JSON.stringify({ err: e.message }); }
  })()
`;

// ── Phase 2 probe: indicators settled ────────────────────────────────────────
// After price loads, indicators (esp. heavy ones like ML Lorentzian) keep recalculating
// for a variable 2–7s. Reading study values before they finish yields stale/empty data
// (e.g. LORP "No LC data" wrongly excluding every ticker).
//
// Counting "studies with values" and waiting for it to plateau is NOT reliable: the count
// stabilises at the fast indicators' total while the single slowest one (Lorentzian) is
// still empty, so it returns too early. Instead, when a layout has a known slow/critical
// indicator, we wait until THAT indicator has a value. Set via env var READY_REQUIRE_STUDY
// (case-insensitive name substring, e.g. "Lorentzian" for the LORP layout). Layouts without
// it set fall back to count-stability (fine — none have an equally-laggy indicator).
//
// Returns JSON { n, reqPresent } where reqPresent is true if no required study is configured,
// or the required study currently has a non-empty value.
const REQUIRE_STUDY = (process.env.READY_REQUIRE_STUDY || '').toLowerCase();
const STUDY_PROBE_EXPR = `
  (function() {
    try {
      var REQ = ${JSON.stringify(REQUIRE_STUDY)};
      var cw = window.TradingViewApi._activeChartWidgetWV.value();
      var chart = (cw && cw._chartWidget) ? cw._chartWidget : cw;
      var srcs = chart.model().model().dataSources();
      var n = 0, reqPresent = REQ ? false : true;
      for (var i = 0; i < srcs.length; i++) {
        try {
          var s = srcs[i];
          if (!s.metaInfo) continue;
          var name = '';
          try { var m = s.metaInfo(); name = (m.description || '').toLowerCase(); } catch (e) {}
          var dwv = s.dataWindowView && s.dataWindowView();
          if (!dwv) continue;
          var items = dwv.items();
          var hasVal = false;
          for (var j = 0; j < items.length; j++) {
            if (items[j]._value && items[j]._value !== '∅') { hasVal = true; break; }
          }
          if (hasVal) {
            n++;
            if (REQ && name.indexOf(REQ) >= 0) reqPresent = true;
          }
        } catch (e) {}
      }
      return JSON.stringify({ n: n, reqPresent: reqPresent });
    } catch (e) { return JSON.stringify({ n: -1, reqPresent: false }); }
  })()
`;

// Wait until the chart is ready to read: price data loaded for the requested symbol AND
// indicator values settled. Returns true when ready, false on timeout (caller proceeds;
// the per-symbol timeout guard handles genuinely stuck symbols).
export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT) {
  const start = Date.now();
  const wantTicker = expectedSymbol ? String(expectedSymbol).split(':').pop().toUpperCase() : null;

  // ── Phase 1: price data ready ──
  let priceReady = false;
  while (Date.now() - start < timeout) {
    const raw = await evaluate(PRICE_READY_EXPR);
    let st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch (_) {}
    if (!st || st.err) {
      // API path unavailable — fixed settle fallback so we never hard-fail.
      await new Promise(r => setTimeout(r, 1500));
      return false;
    }
    const symbolOk = !wantTicker || (st.sym && st.sym.toUpperCase().includes(wantTicker));
    if (st.isLoading === false && symbolOk && st.bars > 10) { priceReady = true; break; }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  if (!priceReady) return false;

  // ── Phase 2: indicators settled ──
  // Ready when: the count of studies-with-values has plateaued (STABLE_POLLS consecutive
  // equal reads) AND the required slow indicator (if configured) has a value. The required
  // check is what prevents returning early during the plateau-before-Lorentzian gap.
  const STABLE_POLLS = 3;
  const STUDY_POLL = 150;
  let last = -1, stable = 0;
  while (Date.now() - start < timeout) {
    const raw = await evaluate(STUDY_PROBE_EXPR);
    let p = null;
    try { p = raw ? JSON.parse(raw) : null; } catch (_) {}
    if (p && p.n >= 0) {
      if (p.n === last) stable++; else stable = 0;
      last = p.n;
      if (stable >= STABLE_POLLS && p.n > 0 && p.reqPresent) return true;
    }
    await new Promise(r => setTimeout(r, STUDY_POLL));
  }
  // Timed out during settle — proceed if we at least have values.
  return last > 0;
}
