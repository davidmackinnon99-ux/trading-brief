import CDP from 'chrome-remote-interface';

let client = null;
let targetInfo = null;
const CDP_HOST = 'localhost';
const CDP_PORT = 9222;
const MAX_RETRIES = 5;
const BASE_DELAY = 500;

// Known direct API paths discovered via live probing (see PROBE_RESULTS.md)
const KNOWN_PATHS = {
  chartApi: 'window.TradingViewApi._activeChartWidgetWV.value()',
  chartWidgetCollection: 'window.TradingViewApi._chartWidgetCollection',
  bottomWidgetBar: 'window.TradingView.bottomWidgetBar',
  replayApi: 'window.TradingViewApi._replayApi',
  alertService: 'window.TradingViewApi._alertService',
  chartApiInstance: 'window.ChartApiInstance',
  mainSeriesBars: 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars()',
  // Phase 1: Strategy data — model().dataSources() → find strategy → .performance().value(), .ordersData(), .reportData()
  strategyStudy: 'chart._chartWidget.model().model().dataSources()',
  // Phase 2: Layouts — getSavedCharts(cb), loadChartFromServer(id)
  layoutManager: 'window.TradingViewApi.getSavedCharts',
  // Phase 5: Symbol search — searchSymbols(query) returns Promise
  symbolSearchApi: 'window.TradingViewApi.searchSymbols',
  // Phase 6: Pine scripts — REST API at pine-facade.tradingview.com/pine-facade/list/?filter=saved
  pineFacadeApi: 'https://pine-facade.tradingview.com/pine-facade',
};

export { KNOWN_PATHS };

export async function getClient() {
  if (client) {
    try {
      // Quick liveness check
      await client.Runtime.evaluate({ expression: '1', returnByValue: true });
      return client;
    } catch {
      client = null;
      targetInfo = null;
    }
  }
  return connect();
}

export async function connect() {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const target = await findChartTarget();
      if (!target) {
        throw new Error('No TradingView chart target found. Is TradingView open with a chart?');
      }
      targetInfo = target;
      client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });

      // Enable required domains
      await client.Runtime.enable();
      await client.Page.enable();
      await client.DOM.enable();

      return client;
    } catch (err) {
      lastError = err;
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 30000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`CDP connection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function findChartTarget() {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();
  const chartTargets = targets.filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url));

  // Deduplicate by layout ID — prefer Desktop app pages over Chrome tab pages.
  // When both the Desktop app and a Chrome tab have the same layout open, CDP sees
  // two pages with the same layout ID. The Desktop app page has a non-empty
  // 'description' field (typically "Electron"); Chrome tab pages have description="".
  // We keep only one page per layout ID, preferring the Desktop app instance.
  const seenLayoutIds = {};
  const dedupedTargets = [];
  for (const t of chartTargets) {
    const m = t.url.match(/\/chart\/([^/]+)\//);
    const layoutId = m ? m[1] : t.url;
    if (!seenLayoutIds[layoutId]) {
      seenLayoutIds[layoutId] = t;
      dedupedTargets.push(t);
    } else {
      // Prefer Desktop app (non-empty description) over Chrome tab (empty description)
      const existing = seenLayoutIds[layoutId];
      const existingIsDesktop = !!(existing.description && existing.description.trim());
      const newIsDesktop = !!(t.description && t.description.trim());
      if (newIsDesktop && !existingIsDesktop) {
        // Replace Chrome tab entry with Desktop app entry
        const idx = dedupedTargets.indexOf(existing);
        dedupedTargets[idx] = t;
        seenLayoutIds[layoutId] = t;
        process.stderr.write(`[connection] INFO: Layout ${layoutId} on both Desktop app and Chrome tab — preferring Desktop app page.\n`);
      } else {
        process.stderr.write(`[connection] INFO: Layout ${layoutId} appears on multiple CDP pages — keeping first (Desktop app preferred).\n`);
      }
    }
  }
  if (dedupedTargets.length < chartTargets.length) {
    process.stderr.write(`[connection] Deduplicated ${chartTargets.length} → ${dedupedTargets.length} chart pages (Chrome tabs suppressed where Desktop app page exists).\n`);
  }
  // Use deduplicated list going forward
  chartTargets.length = 0;
  chartTargets.push(...dedupedTargets);

  // If an indicator hint is set, scan all chart pages to find the one that has that indicator.
  // TradingView Desktop runs each saved chart layout as a separate page — this ensures we
  // connect to the correct layout page for each scan rather than always defaulting to page 1.
  const hint = process.env.TRADINGVIEW_INDICATOR_HINT;
  if (hint && chartTargets.length > 1) {
    const needle = hint.toLowerCase();
    for (const target of chartTargets) {
      try {
        const tempClient = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });
        await tempClient.Runtime.enable();
        const result = await tempClient.Runtime.evaluate({
          expression: `(function() {
            try {
              var defs = window.TradingViewApi._chartWidgetCollection._chartWidgetsDefs;
              if (!defs || !defs.length) return [];
              return defs[0].chartWidget.model().model().dataSources()
                .filter(function(s) { return s && s.metaInfo; })
                .map(function(s) {
                  try { var m = s.metaInfo(); return (m.description || '').toLowerCase(); } catch(e) { return ''; }
                })
                .filter(Boolean);
            } catch(e) { return []; }
          })()`,
          returnByValue: true,
        });
        await tempClient.close();
        const names = result.result?.value || [];
        if (names.some(n => n.includes(needle))) {
          process.stderr.write(`[connection] TRADINGVIEW_INDICATOR_HINT="${hint}" → matched page ${target.url}\n`);
          return target;
        }
      } catch (_) {
        // Skip unreachable targets
      }
    }
    process.stderr.write(`[connection] WARNING: TRADINGVIEW_INDICATOR_HINT="${hint}" not found on any chart page — using default\n`);
  }

  return chartTargets[0]
    || targets.find(t => t.type === 'page' && /tradingview/i.test(t.url))
    || null;
}

export async function getTargetInfo() {
  if (!targetInfo) {
    await getClient();
  }
  return targetInfo;
}

export async function evaluate(expression, opts = {}) {
  const c = await getClient();
  const result = await c.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: opts.awaitPromise ?? false,
    ...opts,
  });
  if (result.exceptionDetails) {
    const msg = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Unknown evaluation error';
    throw new Error(`JS evaluation error: ${msg}`);
  }
  return result.result?.value;
}

export async function evaluateAsync(expression) {
  return evaluate(expression, { awaitPromise: true });
}

export async function disconnect() {
  if (client) {
    try { await client.close(); } catch {}
    client = null;
    targetInfo = null;
  }
}

// --- Direct API path helpers ---
// Each returns the STRING expression path after verifying it exists.
// Callers use the returned string in their own evaluate() calls.

async function verifyAndReturn(path, name) {
  const exists = await evaluate(`typeof (${path}) !== 'undefined' && (${path}) !== null`);
  if (!exists) {
    throw new Error(`${name} not available at ${path}`);
  }
  return path;
}

export async function getChartApi() {
  return verifyAndReturn(KNOWN_PATHS.chartApi, 'Chart API');
}

export async function getChartCollection() {
  return verifyAndReturn(KNOWN_PATHS.chartWidgetCollection, 'Chart Widget Collection');
}

export async function getBottomBar() {
  return verifyAndReturn(KNOWN_PATHS.bottomWidgetBar, 'Bottom Widget Bar');
}

export async function getReplayApi() {
  return verifyAndReturn(KNOWN_PATHS.replayApi, 'Replay API');
}

export async function getMainSeriesBars() {
  return verifyAndReturn(KNOWN_PATHS.mainSeriesBars, 'Main Series Bars');
}
