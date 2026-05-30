/**
 * Morning brief core logic.
 * Reads rules.json, scans watchlist symbols, returns structured data
 * for Claude to apply bias criteria and generate a session brief.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as chart from "./chart.js";
import * as data from "./data.js";
import * as ui from "./ui.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../");
const SESSIONS_DIR = join(homedir(), ".tradingview-mcp", "sessions");

function loadRules(rulesPath) {
  const candidates = [
    rulesPath,
    join(PROJECT_ROOT, "rules.json"),
    join(homedir(), ".tradingview-mcp", "rules.json"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return { rules: JSON.parse(readFileSync(p, "utf8")), path: p };
      } catch (e) {
        throw new Error(`Failed to parse rules.json at ${p}: ${e.message}`);
      }
    }
  }

  throw new Error(
    "No rules.json found. Copy rules.example.json to rules.json and fill in your trading rules.\n" +
      "Looked in:\n" +
      candidates
        .filter(Boolean)
        .map((p) => `  - ${p}`)
        .join("\n"),
  );
}

export async function runBrief({ rules_path, sections } = {}) {
  const { rules, path: loadedFrom } = loadRules(rules_path);
  const {
    watchlist = [],
    watchlist_sections = {},
    default_timeframe = "1D",
    scan_delay_ms: rules_scan_delay_ms = 1000,
    symbol_timeout_ms = 30000,
    lorp_layout = "LORP",
    pullback_layout = "Pullback",
  } = rules;
  // Allow per-invocation override via env var — used by morning-brief.sh to give
  // the SID scan a longer delay (its indicators need more time to recalculate).
  const scan_delay_ms = parseInt(process.env.SCAN_DELAY_MS || '') || rules_scan_delay_ms;

  if (!watchlist.length) {
    throw new Error(
      "rules.json watchlist is empty. Add at least one symbol to your watchlist array.",
    );
  }

  // If --sections specified, filter watchlist to only symbols in those sections.
  // Uses case-insensitive partial matching against watchlist_sections keys.
  let filteredWatchlist = watchlist;
  if (sections) {
    const requestedSections = sections.split(',').map(s => s.trim()).filter(Boolean);
    const sectionKeys = Object.keys(watchlist_sections);
    const symbolSet = new Set();

    for (const requested of requestedSections) {
      const rl = requested.toLowerCase();
      const matched = sectionKeys.filter(k => {
        const kl = k.toLowerCase();
        return kl === rl || kl.includes(rl) || rl.includes(kl);
      });
      for (const key of matched) {
        for (const sym of (watchlist_sections[key] || [])) symbolSet.add(sym);
      }
    }

    filteredWatchlist = watchlist.filter(s => symbolSet.has(s));
    process.stderr.write(`[brief] sections filter: ${requestedSections.join(', ')} → ${filteredWatchlist.length} symbols (from ${watchlist.length} total)\n`);
  }

  // Save current chart state so we can restore after scanning
  let originalSymbol, originalTimeframe;
  try {
    const currentState = await chart.getState();
    originalSymbol = currentState.symbol;
    originalTimeframe = currentState.resolution;
  } catch (_) {}

  const results = [];
  // Track whether we've already set the timeframe to default_timeframe.
  // Symbol changes preserve the current timeframe in TradingView, so we only
  // need to set it once (on the first symbol). Calling setTimeframe() on every
  // symbol triggers a full chart re-render + waitForChartReady() poll — roughly
  // 4-5 extra seconds per symbol. Skipping it for symbols 2-N saves ~20 minutes
  // on a 267-symbol watchlist.
  let timeframeConfirmed = false;

  for (const symbol of filteredWatchlist) {
    const scanOne = async () => {
      await chart.setSymbol({ symbol });
      await new Promise((r) => setTimeout(r, scan_delay_ms));

      if (!timeframeConfirmed) {
        await chart.setTimeframe({ timeframe: default_timeframe });
        await new Promise((r) => setTimeout(r, scan_delay_ms));
        timeframeConfirmed = true;
      }

      const [state, indicators, quote] = await Promise.all([
        chart.getState(),
        data.getStudyValues(),
        data.getQuote({}),
      ]);

      return { symbol, timeframe: default_timeframe, state, indicators, quote };
    };

    try {
      const result = await Promise.race([
        scanOne(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`symbol scan timeout (${symbol_timeout_ms / 1000}s)`)),
            symbol_timeout_ms,
          ),
        ),
      ]);
      results.push(result);
    } catch (err) {
      process.stderr.write(`[brief] TIMEOUT/ERROR ${symbol}: ${err.message}\n`);
      results.push({ symbol, error: err.message });
    }
  }

  // ── Pullback layout pass (disabled — layout switching discards unsaved chart changes) ──
  // TODO: Re-enable once LORP layout is confirmed saved to cloud and safe to reload.
  // When re-enabled, this will switch to Pullback layout, scan full watchlist for
  // SMA50/SMA200 data, then switch back to lorp_layout.
  const pullbackResults = [];
  const pullbackError = 'Pullback layout scan disabled — using LORP layout proxy';

  if (originalSymbol) {
    try {
      await chart.setSymbol({ symbol: originalSymbol });
      if (originalTimeframe)
        await chart.setTimeframe({ timeframe: originalTimeframe });
    } catch (_) {}
  }

  return {
    success: true,
    generated_at: new Date().toISOString(),
    rules_loaded_from: loadedFrom,
    rules: {
      bias_criteria: rules.bias_criteria || null,
      risk_rules: rules.risk_rules || null,
      notes: rules.notes || null,
    },
    symbols_scanned: results,
    pullback_results: pullbackError ? [{ layout_error: pullbackError }] : pullbackResults,
    instruction: [
      "For each symbol in symbols_scanned, apply the bias_criteria from rules to the indicator readings.",
      "Output one line per symbol: SYMBOL | BIAS: [bullish/bearish/neutral] | KEY LEVEL: [price] | WATCH: [what to monitor]",
      "End with a one-sentence overall market read.",
      "Be direct. No preamble.",
    ].join(" "),
  };
}

export function saveSession({ brief, date } = {}) {
  mkdirSync(SESSIONS_DIR, { recursive: true });

  const dateStr = date || new Date().toISOString().split("T")[0];
  const filePath = join(SESSIONS_DIR, `${dateStr}.json`);

  const existing = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, "utf8"))
    : {};
  const record = {
    ...existing,
    date: dateStr,
    saved_at: new Date().toISOString(),
    brief,
  };

  writeFileSync(filePath, JSON.stringify(record, null, 2));
  return { success: true, path: filePath, date: dateStr };
}

export function getSession({ date } = {}) {
  const dateStr = date || new Date().toISOString().split("T")[0];
  const filePath = join(SESSIONS_DIR, `${dateStr}.json`);

  if (existsSync(filePath)) {
    return { success: true, ...JSON.parse(readFileSync(filePath, "utf8")) };
  }

  // Fall back to yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const yesterdayPath = join(SESSIONS_DIR, `${yesterdayStr}.json`);

  if (existsSync(yesterdayPath)) {
    return {
      success: true,
      note: "No session for today — returning yesterday",
      ...JSON.parse(readFileSync(yesterdayPath, "utf8")),
    };
  }

  return {
    success: false,
    error: `No session found for ${dateStr} or ${yesterdayStr}`,
    sessions_dir: SESSIONS_DIR,
  };
}
