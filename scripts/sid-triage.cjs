'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SID Daily Brief — triage and review (David, 7 Oct 2026)
// Spec: SID_DAILY_BRIEF_REQUIREMENTS.md (built with Sid & ChatGPT).
//
// Pure functions only: analyse-brief.cjs extracts the raw values from the existing
// SID-layout scan (no extra chart scans) and calls triageAlert() per SID alert.
//
// Principles carried from the spec:
//   • A SID entry signal is an observed event; everything here is CONTEXT.
//   • Status is a workload aid, NOT a trade grade and NOT a new entry signal.
//   • Missing data is n/a and can never create a pass (worst-case it blocks Review now).
//   • Every distance is read in the trade direction.
//   • Every threshold lives in CFG so later outcome testing can change it without
//     touching the logic. All of them are printed in the brief footer.
// ─────────────────────────────────────────────────────────────────────────────

const CFG = {
  VERSION: 'sid-triage-1.0 (7 Oct 2026)',
  ROOM_OPEN_ATR: 1.0,        // room to first hurdle >= this → path "Open"/"Cleared"; below → "Hurdle near"
  ROOM_MIN_ATR: 0.25,        // room below this → no useful path today → Exclude
  CLUSTER_ATR: 0.5,          // levels within this of the first hurdle form a cluster
  MA_FLAT_ATR: 0.05,         // 3-bar MA move smaller than this (in ATR) = flat
  MA_GAP_STABLE_ATR: 0.10,   // 3-bar change in SMA50–SMA200 gap smaller than this = stable
  MACD_FAST: 0.15,           // MACD Sep v1.4 "Closing Speed" (1-bar change in separation) >= this → Fast
  MACD_STABLE: 0.02,         // 1-bar separation change smaller than this = stable
  MACD_CHOP_FLIPS: 2,        // >= this many MACD/signal side flips ...
  MACD_CHOP_LOOKBACK: 6,     // ... across this many daily snapshots (incl. today) = chop
  DI_SHIFT_PTS: 1.0,         // 3-bar change in DI gap beyond ±this = a shift
  EARNINGS_TRADING_DAYS: 5,  // earnings within this many trading days → Learning only
  OVERNIGHT_MOVE_ATR: 1.0,   // after-hours move >= this many ATR → Learning only
  ENTRY_MISSED_LOOKBACK: 3,  // same-direction SID alert within this many trading days earlier ...
  ENTRY_MISSED_ATR: 1.0,     // ... and price already moved this far in the trade direction since → missed
  MAX_OPEN_CONDITIONS: 1,    // Conditional = at most one named open condition (plus any data gaps); more → Exclude today
  RVOL_LOW: 0.8,             // participation caution only (not a gate)
};

const STATUS = {
  REVIEW: 'Review now',
  COND: 'Conditional',
  LEARN: 'Learning only',
  EXCL: 'Exclude today',
  DATA: 'Data incomplete',
};
const STATUS_ORDER = [STATUS.REVIEW, STATUS.COND, STATUS.LEARN, STATUS.EXCL, STATUS.DATA];

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const r2 = (x) => (isNum(x) ? Math.round(x * 100) / 100 : null);
const fmtP = (x) => (isNum(x) ? x.toFixed(2) : 'n/a');
const fmtA = (x) => (isNum(x) ? x.toFixed(1) : 'n/a');
const signed = (x, d = 1) => (isNum(x) ? (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d) : 'n/a');

// ── CAP zone helpers ─────────────────────────────────────────────────────────
// CAP Tools Supplement v1.7 exports four zone boundaries. CAP uses ATR only to choose
// which retained pivot-price zones to show — we never rebuild zones from ATR.
function zone(a, b) {
  if (!isNum(a) || !isNum(b)) return null;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}
function relation(close, z) {
  if (!z || !isNum(close)) return 'n/a';
  if (close < z.lo) return 'below';
  if (close > z.hi) return 'above';
  return 'inside';
}

// Direction-aware room to the opposing CAP zone (spec §4.2).
//   long  → supply is opposing:  below → (supplyBot − close)/ATR; inside → 0; above → cleared
//   short → demand is opposing:  above → (close − demandTop)/ATR; inside → 0; below → cleared
function capOpposition(dir, close, atr, supply, demand) {
  const z = dir === 'long' ? supply : demand;
  const rel = relation(close, z);
  if (rel === 'n/a') return { state: 'n/a', rel, roomAtr: null, zone: null };
  if (dir === 'long') {
    if (rel === 'below') return { state: 'ahead', rel, zone: z, roomAtr: isNum(atr) && atr > 0 ? (z.lo - close) / atr : null };
    if (rel === 'inside') return { state: 'inside', rel, zone: z, roomAtr: 0 };
    return { state: 'cleared', rel, zone: z, roomAtr: null };
  }
  if (rel === 'above') return { state: 'ahead', rel, zone: z, roomAtr: isNum(atr) && atr > 0 ? (close - z.hi) / atr : null };
  if (rel === 'inside') return { state: 'inside', rel, zone: z, roomAtr: 0 };
  return { state: 'cleared', rel, zone: z, roomAtr: null };
}

function capCell(dir, opp) {
  const zname = dir === 'long' ? 'supply' : 'demand';
  if (opp.state === 'n/a') return 'n/a';
  if (opp.state === 'inside') return `Inside ${zname}`;
  if (opp.state === 'cleared') return dir === 'long' ? 'Above supply' : 'Below demand';
  return `${zname[0].toUpperCase() + zname.slice(1)} ahead ${fmtA(opp.roomAtr)}`;
}

// ── Path / first hurdle (spec §5.1) ─────────────────────────────────────────
function levelsAhead(dir, close, atr, lv) {
  const out = [];
  const add = (name, price) => {
    if (!isNum(price) || !isNum(close)) return;
    const ahead = dir === 'long' ? price > close : price < close;
    if (!ahead) return;
    out.push({ name, price, distAtr: isNum(atr) && atr > 0 ? Math.abs(price - close) / atr : null });
  };
  add('BB mid', lv.bbMid);
  add('SMA50', lv.sma50);
  add('SMA200', lv.sma200);
  if (dir === 'long' && lv.supply) add('CAP supply', lv.supply.lo);
  if (dir === 'short' && lv.demand) add('CAP demand', lv.demand.hi);
  // Pivots and pattern targets: not exported to the SID Data Window today (see notes) → not used.
  return out.sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close));
}

function firstHurdle(dir, close, atr, lv) {
  const ahead = levelsAhead(dir, close, atr, lv);
  if (!ahead.length) return { hurdle: null, ahead };
  const first = ahead[0];
  const cluster = ahead.filter((x) => isNum(x.distAtr) && isNum(first.distAtr) && x.distAtr - first.distAtr <= CFG.CLUSTER_ATR);
  const parts = (cluster.length ? cluster : [first]).map((x) => x.name);
  return {
    hurdle: { label: parts.join(' + '), price: first.price, distAtr: first.distAtr, components: (cluster.length ? cluster : [first]) },
    ahead,
  };
}

// ── MA path (spec §5.2) ─────────────────────────────────────────────────────
function maPath(dir, close, atr, sma50, sma200, h) {
  const out = { d50: null, d200: null, sma50Move: 'n/a', sma200Move: 'n/a', gapAtr: null, gapTrend: 'n/a', order: 'n/a', baseline: 'unclear', d50Move: null, d200Move: null };
  if (!isNum(close) || !isNum(atr) || atr <= 0) return out;
  const mv = (now, then) => {
    if (!isNum(now) || !isNum(then)) return 'n/a';
    const d = (now - then) / atr;
    return Math.abs(d) < CFG.MA_FLAT_ATR ? 'flat' : d > 0 ? 'rising' : 'falling';
  };
  if (isNum(sma50)) out.d50 = (close - sma50) / atr;
  if (isNum(sma200)) out.d200 = (close - sma200) / atr;
  out.sma50Move = mv(sma50, h.sma50);
  out.sma200Move = mv(sma200, h.sma200);
  if (isNum(h.close) && isNum(h.sma50) && isNum(out.d50)) out.d50Move = out.d50 - (h.close - h.sma50) / atr;
  if (isNum(h.close) && isNum(h.sma200) && isNum(out.d200)) out.d200Move = out.d200 - (h.close - h.sma200) / atr;
  if (isNum(sma50) && isNum(sma200)) {
    out.order = sma50 > sma200 ? '50>200' : '50<200';
    out.gapAtr = (sma50 - sma200) / atr;
    if (isNum(h.sma50) && isNum(h.sma200)) {
      const gThen = Math.abs(h.sma50 - h.sma200) / atr;
      const d = Math.abs(out.gapAtr) - gThen;
      out.gapTrend = Math.abs(d) < CFG.MA_GAP_STABLE_ATR ? 'stable' : d < 0 ? 'closing' : 'expanding';
    }
  }
  // Operational baseline must be evidence-led (repeated reactions in price history). The
  // scan carries no bar history, so we only say "cluster" when BB mid and SMA50 sit within
  // CLUSTER_ATR of each other (a factual co-location); otherwise "unclear".
  return out;
}

function maCell(m) {
  const one = (lab, d, mv) => (isNum(d) ? `${lab} ${signed(d)}${mv === 'rising' ? '↑' : mv === 'falling' ? '↓' : mv === 'flat' ? '→' : ''}` : `${lab} n/a`);
  const gap = m.gapTrend !== 'n/a' ? ` · gap ${m.gapTrend}` : '';
  return `${one('50', m.d50, m.sma50Move)} · ${one('200', m.d200, m.sma200Move)}${gap}`;
}

// ── DI / ADX (spec §5.3) — only the four agreed tags ────────────────────────
function diState(diPlus, diMinus, diGap3, adx, adxPrev) {
  const out = { gap: null, gapChange3: null, control: null, shift: null, adxDir: 'n/a' };
  if (isNum(diPlus) && isNum(diMinus)) {
    out.gap = diPlus - diMinus;
    out.control = out.gap > 0 ? 'DI Control – Buyers' : out.gap < 0 ? 'DI Control – Sellers' : null;
    if (isNum(diGap3)) {
      out.gapChange3 = out.gap - diGap3;
      out.shift = out.gapChange3 > CFG.DI_SHIFT_PTS ? 'DI Shift – Buyers' : out.gapChange3 < -CFG.DI_SHIFT_PTS ? 'DI Shift – Sellers' : null;
    }
  }
  if (isNum(adx) && isNum(adxPrev)) out.adxDir = adx > adxPrev + 0.05 ? 'rising' : adx < adxPrev - 0.05 ? 'falling' : 'flat';
  return out;
}
function diCell(d) {
  const c = d.control ? d.control.replace('DI Control – ', 'Control–') : 'Control n/a';
  const s = d.shift ? d.shift.replace('DI Shift – ', 'Shift–') : isNum(d.gapChange3) ? 'No shift' : 'Shift n/a';
  return `${s}; ${c}`;
}

// ── MACD (spec §5.4) — no "SPEED"/"SEP" wording in output ──────────────────
function macdState(dir, m) {
  const out = { side: 'n/a', aligned: null, trend: 'n/a', pace: null, zero: 'n/a', chop: false, flips: null, sep: m.sep ?? null };
  if (!isNum(m.raw)) return out;
  out.side = m.raw >= 0 ? 'above signal' : 'below signal';
  out.aligned = dir === 'long' ? m.raw >= 0 : m.raw < 0;
  if (isNum(m.macd)) out.zero = m.macd >= 0 ? 'above zero' : 'below zero';
  if (isNum(m.rawPrev) && Math.sign(m.rawPrev) !== Math.sign(m.raw) && m.rawPrev !== 0) out.trend = 'fresh cross';
  else if (isNum(m.sep) && isNum(m.sepPrev)) {
    const d = m.sep - m.sepPrev;
    out.trend = Math.abs(d) < CFG.MACD_STABLE ? 'stable' : d < 0 ? 'converging' : 'expanding';
  }
  if (isNum(m.closingSpeed)) out.pace = m.closingSpeed >= CFG.MACD_FAST ? 'Fast' : 'Slow';
  const series = [...(m.rawHist || []), m.raw].filter(isNum).slice(-CFG.MACD_CHOP_LOOKBACK);
  if (series.length >= 3) {
    let flips = 0;
    for (let i = 1; i < series.length; i++) if (Math.sign(series[i]) !== Math.sign(series[i - 1])) flips++;
    out.flips = flips;
    out.chop = flips >= CFG.MACD_CHOP_FLIPS;
  }
  return out;
}
function macdCell(s) {
  if (s.aligned == null) return 'n/a';
  const t = s.trend !== 'n/a' ? `, ${s.trend}` : '';
  const p = s.pace && (s.trend === 'converging' || s.trend === 'expanding') ? ` (${s.pace.toLowerCase()})` : '';
  return `${s.aligned ? 'Aligned' : 'Opposed'}${t}${p}${s.chop ? ' · chop' : ''}`;
}

// ── Participation (spec §5.5) ───────────────────────────────────────────────
function participation(dir, rvol, vd) {
  const vdAligned = isNum(vd) ? (dir === 'long' ? vd > 0 : vd < 0) : null;
  let label = 'n/a';
  if (isNum(rvol)) {
    label = rvol < CFG.RVOL_LOW ? 'low' : 'normal+';
    if (vdAligned === false) label += ', vol opposed';
    if (vdAligned === true) label += ', vol aligned';
  }
  return { rvol, vdAligned, label, caution: (isNum(rvol) && rvol < CFG.RVOL_LOW) || vdAligned === false };
}

// ── Main per-alert triage ───────────────────────────────────────────────────
// a = {
//   sym, dir, close, open, atr, atrPct, gatr, rsi,
//   bbMid, bbUp, bbLo, sma50, sma200,
//   cap: { supBot, supTop, demTop, demBot },
//   macd: { macd, sig, raw, sep, closingSpeed, barsSinceCross, rawPrev, sepPrev, rawHist[] },
//   diPlus, diMinus, adx, rvol, vd,
//   sectorRotation: 'Supported'|'Neutral'|'Unsupported'|null, sectorEtf, sectorName,
//   earnings: { tradingDays, date } | null, ahMovePct, gapPct,
//   hist: { bars, close, sma50, sma200, bbMid, diGap, adxPrev },
//   priorSignals: [{ tradingDaysAgo, close }],
//   isFund
// }
function triageAlert(a) {
  const dir = a.dir;
  const close = a.close;
  const atr = a.atr;
  const reasons = [];        // stable reason codes
  const conditions = [];     // named open conditions (for Conditional)
  const dataGaps = [];       // missing inputs — block Review now, not counted as conditions
  const notes = [];          // short human evidence lines

  const supply = zone(a.cap?.supBot, a.cap?.supTop);
  const demand = zone(a.cap?.demBot, a.cap?.demTop);
  const capAvailable = !!(supply || demand);
  const opp = capOpposition(dir, close, atr, supply, demand);
  const support = dir === 'long' ? relation(close, demand) : relation(close, supply);

  const bb = {
    mid: a.bbMid ?? null,
    side: isNum(a.bbMid) && isNum(close) ? (close >= a.bbMid ? 'above' : 'below') : 'n/a',
    distAtr: isNum(a.bbMid) && isNum(close) && isNum(atr) && atr > 0 ? (a.bbMid - close) / atr : null,
    slope: isNum(a.bbMid) && isNum(a.hist?.bbMid) ? (a.bbMid > a.hist.bbMid ? 'rising' : a.bbMid < a.hist.bbMid ? 'falling' : 'flat') : 'n/a',
  };
  bb.inDirection = bb.side === 'n/a' ? null : dir === 'long' ? bb.side === 'below' : bb.side === 'above';

  const fh = firstHurdle(dir, close, atr, { bbMid: a.bbMid, sma50: a.sma50, sma200: a.sma200, supply, demand });
  const ma = maPath(dir, close, atr, a.sma50, a.sma200, a.hist || {});
  if (fh.hurdle && fh.hurdle.components.some((c) => c.name === 'BB mid') && fh.hurdle.components.some((c) => c.name === 'SMA50')) ma.baseline = 'cluster';
  const di = diState(a.diPlus, a.diMinus, a.hist?.diGap, a.adx, a.hist?.adxPrev);
  const mc = macdState(dir, a.macd || {});
  const part = participation(dir, a.rvol, a.vd);

  // ── Path state ──
  let path;
  const roomAtr = fh.hurdle ? fh.hurdle.distAtr : null;
  if (!isNum(close) || !isNum(atr) || atr <= 0 || (!capAvailable && !isNum(a.bbMid))) path = 'No structural data';
  else if (opp.state === 'inside') path = 'Inside opposition';
  else if (!fh.hurdle) path = opp.state === 'cleared' ? 'Cleared' : 'Open';
  else if (roomAtr < CFG.ROOM_OPEN_ATR) path = 'Hurdle near';
  else path = opp.state === 'cleared' ? 'Cleared' : 'Open';

  // ── Event / execution risk ──
  const events = [];
  if (a.earnings && isNum(a.earnings.tradingDays) && a.earnings.tradingDays >= 0 && a.earnings.tradingDays <= CFG.EARNINGS_TRADING_DAYS) {
    events.push('EARNINGS_NEAR');
  }
  const ahAtr = isNum(a.ahMovePct) && isNum(a.atrPct) && a.atrPct > 0 ? a.ahMovePct / a.atrPct : null;
  if (isNum(ahAtr) && Math.abs(ahAtr) >= CFG.OVERNIGHT_MOVE_ATR) events.push('OVERNIGHT_MOVE_LARGE');
  let entryMissed = null;
  const prior = (a.priorSignals || []).filter((p) => p.tradingDaysAgo >= 1 && p.tradingDaysAgo <= CFG.ENTRY_MISSED_LOOKBACK);
  if (prior.length && isNum(close) && isNum(atr) && atr > 0) {
    const first = prior.sort((x, y) => y.tradingDaysAgo - x.tradingDaysAgo)[0];
    if (isNum(first.close)) {
      const moved = (dir === 'long' ? close - first.close : first.close - close) / atr;
      entryMissed = { tradingDaysAgo: first.tradingDaysAgo, movedAtr: moved };
      if (moved >= CFG.ENTRY_MISSED_ATR) events.push('ENTRY_MISSED');
    }
  }

  // ── Status ──
  let status;
  const missingCore = [];
  if (!isNum(close)) missingCore.push('price');
  if (!isNum(atr)) missingCore.push('ATR');
  if (mc.aligned == null) missingCore.push('MACD');
  if (!capAvailable && !isNum(a.bbMid)) missingCore.push('CAP + BB mid');

  if (a.notScanned) {
    status = STATUS.DATA; reasons.push('DATA_INCOMPLETE', 'NOT_SCANNED');
    notes.push('TradingView alert received but ticker not in today\'s scan (not on the synced watchlist?)');
  } else if (a.instrumentMismatch) {
    status = STATUS.DATA; reasons.push('DATA_INCOMPLETE', 'INSTRUMENT_MISMATCH');
    notes.push(a.instrumentMismatch);
  } else if (a.isFund) {
    status = STATUS.EXCL; reasons.push('FUND_OR_TRUST');
    notes.push('fund/trust (TradingView sector "Miscellaneous") — existing SID rule');
  } else if (missingCore.length) {
    status = STATUS.DATA; reasons.push('DATA_INCOMPLETE');
    notes.push(`${missingCore.join(', ')} unavailable`);
  } else if (path === 'Inside opposition') {
    status = STATUS.EXCL; reasons.push('INSIDE_OPPOSING_ZONE');
    notes.push(`${dir} begins inside ${dir === 'long' ? 'supply' : 'demand'} ${fmtP(opp.zone.lo)}–${fmtP(opp.zone.hi)}`);
  } else if (isNum(roomAtr) && roomAtr < CFG.ROOM_MIN_ATR) {
    status = STATUS.EXCL; reasons.push('HURDLE_NEAR');
    notes.push(`first hurdle ${fh.hurdle.label} ${fmtP(fh.hurdle.price)} only ${roomAtr.toFixed(2)} ATR away`);
  } else if (mc.aligned === false && mc.trend === 'n/a') {
    // Opposed MACD but no prior-day reading to judge convergence (e.g. ticker new to the
    // watchlist) — not enough to classify; never silently excluded or passed.
    status = STATUS.DATA; reasons.push('DATA_INCOMPLETE', 'MACD_HISTORY_NA');
    notes.push(`MACD ${mc.side}; no prior-day MACD reading to judge convergence (ticker not in earlier scans)`);
  } else if (mc.aligned === false && !(mc.trend === 'converging' && mc.pace === 'Fast')) {
    // Opposing MACD is a material practical exclusion (spec §5.4). Only an opposed MACD that is
    // converging FAST toward its signal line is treated as a single open condition (Conditional).
    status = STATUS.EXCL; reasons.push('MACD_OPPOSED');
    const how = mc.trend === 'converging' ? 'converging slowly' : mc.trend;
    notes.push(`MACD ${mc.side} (${how}) — against the ${dir}`);
  } else if (events.length) {
    status = STATUS.LEARN; reasons.push(...events);
  } else {
    // second-pass open conditions
    if (path === 'Hurdle near') { conditions.push('HURDLE_NEAR'); }
    if (mc.aligned === false) conditions.push('MACD_OPPOSED');
    if (mc.chop) conditions.push('MACD_CHOP');
    const wantShift = dir === 'long' ? 'DI Shift – Sellers' : 'DI Shift – Buyers';
    if (di.shift === wantShift) conditions.push('DI_SHIFT_OPPOSED');
    if (bb.inDirection === false) conditions.push('BB_MID_BEHIND');
    // Data gaps are not trade conditions, but missing data can never create a pass:
    // any gap caps the status at Conditional (and is named in the note).
    if (!capAvailable) dataGaps.push('CAP_NA');
    if (di.gapChange3 == null) dataGaps.push('DI_HISTORY_NA');
    if (mc.trend === 'n/a') dataGaps.push('MACD_HISTORY_NA');

    if (conditions.length > CFG.MAX_OPEN_CONDITIONS) { status = STATUS.EXCL; reasons.push('MULTIPLE_OPEN_CONDITIONS', ...conditions, ...dataGaps); }
    else if (conditions.length || dataGaps.length) { status = STATUS.COND; reasons.push(...conditions, ...dataGaps); }
    else { status = STATUS.REVIEW; reasons.push(path === 'Cleared' ? 'PATH_CLEARED' : 'PATH_OPEN'); }
  }

  // ── Event text ──
  const evParts = [];
  if (a.earnings && isNum(a.earnings.tradingDays) && a.earnings.tradingDays >= 0) evParts.push(`Earnings ${a.earnings.tradingDays}d`);
  if (isNum(ahAtr) && Math.abs(ahAtr) >= 0.3) evParts.push(`AH ${signed(ahAtr)} ATR`);
  if (entryMissed) evParts.push(`Repeat (${entryMissed.tradingDaysAgo}d ago, ${signed(entryMissed.movedAtr)} ATR)`);
  const eventCell = evParts.length ? evParts.join('; ') : '—';

  const rotation = a.sectorRotation === 'Supported' ? 'Rotation supportive'
    : a.sectorRotation === 'Unsupported' ? 'Rotation opposed'
    : a.sectorRotation === 'Neutral' ? 'Rotation neutral' : 'Rotation n/a';

  return {
    sym: a.sym, dir, status, reasons, conditions, dataGaps, notes, isFund: !!a.isFund, source: a.source || 'Scan',
    path, roomAtr,
    hurdle: fh.hurdle ? { label: fh.hurdle.label, price: r2(fh.hurdle.price), distAtr: r2(fh.hurdle.distAtr) } : null,
    levelsAhead: fh.ahead.map((x) => ({ name: x.name, price: r2(x.price), distAtr: r2(x.distAtr) })),
    cap: { available: capAvailable, supply, demand, opposing: { state: opp.state, relation: opp.rel, roomAtr: r2(opp.roomAtr) }, supportingRelation: support },
    bb: { ...bb, distAtr: r2(bb.distAtr) },
    ma: { ...ma, d50: r2(ma.d50), d200: r2(ma.d200), gapAtr: r2(ma.gapAtr), d50Move: r2(ma.d50Move), d200Move: r2(ma.d200Move) },
    di: { ...di, gap: r2(di.gap), gapChange3: r2(di.gapChange3) },
    macd: mc,
    participation: part,
    sector: { rotation, structure: 'n/a', turn: 'n/a', etf: a.sectorEtf || null, name: a.sectorName || null },
    weeklyMacd: 'n/a',
    events: { earnings: a.earnings || null, ahMovePct: r2(a.ahMovePct), ahMoveAtr: r2(ahAtr), gapPct: r2(a.gapPct), entryMissed },
    cells: {
      cap: capCell(dir, opp),
      bb: bb.side === 'n/a' ? 'n/a' : [`${bb.side[0].toUpperCase() + bb.side.slice(1)}`, isNum(bb.distAtr) ? `${Math.abs(bb.distAtr).toFixed(1)} ATR` : null, bb.slope !== 'n/a' ? bb.slope : null].filter(Boolean).join(' · '),
      ma: maCell(ma),
      macd: macdCell(mc),
      di: diCell(di),
      adx: isNum(a.adx) ? `${a.adx.toFixed(0)}${di.adxDir !== 'n/a' ? ' ' + di.adxDir : ''}` : 'n/a',
      rvol: isNum(a.rvol) ? a.rvol.toFixed(1) + (part.vdAligned === false ? ' (vol opp)' : '') : 'n/a',
      sector: rotation.replace('Rotation ', 'Rot. '),
      event: eventCell,
    },
  };
}

// ── Plain-language explanations ─────────────────────────────────────────────
const REASON_TEXT = {
  HURDLE_NEAR: 'first hurdle is close — needs to clear it',
  MACD_OPPOSED: 'MACD still on the wrong side of signal — needs the cross',
  MACD_CHOP: 'MACD has flipped sides repeatedly — chop risk',
  DI_SHIFT_OPPOSED: 'DI shift is still moving against the trade',
  CAP_NA: 'CAP zones not captured — check supply/demand on chart',
  BB_MID_BEHIND: 'price already beyond BB mid (RSI-50 proxy behind it)',
  DI_HISTORY_NA: 'no 3-bar DI history',
  MACD_HISTORY_NA: 'no prior-day MACD reading',
  EARNINGS_NEAR: 'earnings soon',
  OVERNIGHT_MOVE_LARGE: 'large after-hours move',
  ENTRY_MISSED: 'original entry was an earlier alert and price has already moved',
};

function whyLine(t) {
  const h = t.hurdle ? `${t.hurdle.label} ${fmtP(t.hurdle.price)} (${fmtA(t.hurdle.distAtr)} ATR)` : 'no hurdle in scan data before the BB mid';
  const capTxt = t.cap.available
    ? (t.cap.opposing.state === 'cleared' ? `price has cleared the nearest CAP ${t.dir === 'long' ? 'supply' : 'demand'} zone`
      : t.cap.opposing.state === 'ahead' ? `nearest CAP ${t.dir === 'long' ? 'supply' : 'demand'} ${fmtA(t.cap.opposing.roomAtr)} ATR ahead`
      : 'CAP n/a')
    : 'CAP zones not captured';
  const diTxt = [t.di.shift, t.di.control].filter(Boolean).join(', ') || 'DI n/a';
  const base = `Path ${t.path.toLowerCase()} to ${h}; ${capTxt}. MACD ${t.cells.macd.toLowerCase()}; ${diTxt}.`;
  if (t.status === STATUS.REVIEW) return `Why review now: ${base}`;
  const open = t.conditions.map((c) => REASON_TEXT[c] || c).join('; ');
  const gaps = (t.dataGaps || []).map((c) => REASON_TEXT[c] || c).join('; ');
  return `Why conditional: ${base}${open ? ` Open condition: ${open}.` : ''}${gaps ? ` Data gap (blocks Review now): ${gaps}.` : ''}`;
}

function appendixLine(t) {
  const parts = [];
  if (t.status === STATUS.LEARN) {
    const ev = [];
    if (t.reasons.includes('EARNINGS_NEAR')) ev.push(`earnings in ${t.events.earnings.tradingDays} trading days`);
    if (t.reasons.includes('OVERNIGHT_MOVE_LARGE')) ev.push(`after-hours move ${signed(t.events.ahMoveAtr)} ATR`);
    if (t.reasons.includes('ENTRY_MISSED')) ev.push(`first alerted ${t.events.entryMissed.tradingDaysAgo}d ago, already ${signed(t.events.entryMissed.movedAtr)} ATR in favour`);
    parts.push(`path ${t.path.toLowerCase()}${t.hurdle ? ` (${t.hurdle.label} ${fmtA(t.hurdle.distAtr)} ATR)` : ''}, but ${ev.join('; ')}`);
  } else if (t.reasons.includes('MULTIPLE_OPEN_CONDITIONS')) {
    parts.push(`${t.conditions.length} open conditions — ${t.conditions.map((c) => REASON_TEXT[c] || c).join('; ')}`);
    if (t.hurdle) parts.push(`first hurdle ${t.hurdle.label} ${fmtA(t.hurdle.distAtr)} ATR`);
  } else {
    parts.push(...t.notes);
  }
  const src = t.source === 'Alert only' ? ' [alert only]' : t.source === 'Scan only' ? ' [scan only — no TV alert]' : '';
  return `${bare(t.sym)} (${t.dir === 'long' ? 'L' : 'S'})${src} — ${t.status}: ${parts.join('; ')}.`;
}

function bare(sym) { return sym.includes(':') ? sym.split(':')[1] : sym; }

function sortTriaged(list) {
  const rank = (s) => STATUS_ORDER.indexOf(s);
  return [...list].sort((a, b) => rank(a.status) - rank(b.status)
    || (a.isFund ? 1 : 0) - (b.isFund ? 1 : 0)
    || (isNum(b.roomAtr) ? b.roomAtr : -1) - (isNum(a.roomAtr) ? a.roomAtr : -1)
    || a.sym.localeCompare(b.sym));
}

module.exports = { CFG, STATUS, STATUS_ORDER, triageAlert, whyLine, appendixLine, sortTriaged, capOpposition, relation, zone, REASON_TEXT, bare };
