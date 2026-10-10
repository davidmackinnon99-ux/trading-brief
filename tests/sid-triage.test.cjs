// node --test tests/sid-triage.test.cjs   (spec §10 acceptance criterion 14)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../scripts/sid-triage.cjs');

// A clean long base case: price 100, ATR 2, supply 104–105 ahead, BB mid 103.
function longBase(over = {}) {
  return {
    sym: 'TEST', dir: 'long', close: 100, atr: 2, atrPct: 2, gatr: 2.1,
    bbMid: 103, sma50: 106, sma200: 90,
    cap: { supBot: 104, supTop: 105, demTop: 97, demBot: 96 },
    macd: { macd: -0.5, raw: 0.1, sep: 0.3, sepPrev: 0.2, rawPrev: 0.05, closingSpeed: 0.1, rawHist: [0.02, 0.04, 0.05] },
    diPlus: 18, diMinus: 26, adx: 28, rvol: 1.2,
    hist: { bars: 3, close: 98, sma50: 106.5, sma200: 89.8, bbMid: 103.2, diGap: -12, adxPrev: 29 },
    priorSignals: [], ...over,
  };
}
function shortBase(over = {}) {
  return {
    sym: 'TSHT', dir: 'short', close: 100, atr: 2, atrPct: 2,
    bbMid: 97, sma50: 94, sma200: 110,
    cap: { supBot: 104, supTop: 105, demTop: 96, demBot: 95 },
    macd: { macd: 0.5, raw: -0.1, sep: 0.3, sepPrev: 0.2, rawPrev: -0.05, closingSpeed: 0.1, rawHist: [-0.02, -0.04, -0.05] },
    diPlus: 26, diMinus: 18, adx: 28, rvol: 1.2,
    hist: { bars: 3, close: 102, sma50: 93.5, sma200: 110.2, bbMid: 96.8, diGap: 12, adxPrev: 29 },
    priorSignals: [], ...over,
  };
}

test('long below supply: room measured to BB mid first, CAP supply ahead', () => {
  const t = T.triageAlert(longBase());
  assert.equal(t.cap.opposing.state, 'ahead');
  assert.equal(t.cap.opposing.roomAtr, 2);           // (104-100)/2
  assert.equal(t.hurdle.label, 'BB mid + CAP supply'); // 1.5 & 2.0 ATR → cluster within 0.5
  assert.equal(t.hurdle.distAtr, 1.5);
  assert.equal(t.path, 'Open');
  assert.equal(t.status, T.STATUS.REVIEW);
});

test('long inside supply → Inside opposition → Exclude today', () => {
  const t = T.triageAlert(longBase({ close: 104.5 }));
  assert.equal(t.cap.opposing.state, 'inside');
  assert.equal(t.path, 'Inside opposition');
  assert.equal(t.status, T.STATUS.EXCL);
  assert.ok(t.reasons.includes('INSIDE_OPPOSING_ZONE'));
});

test('long above supply → Cleared, never described as blocked by supply below', () => {
  const t = T.triageAlert(longBase({ close: 101, cap: { supBot: 99, supTop: 100, demTop: 97, demBot: 96 }, bbMid: 104 }));
  assert.equal(t.cap.opposing.state, 'cleared');
  assert.equal(t.cells.cap, 'Above supply');
  assert.ok(!t.levelsAhead.some(l => l.name === 'CAP supply'));
  assert.equal(t.path, 'Cleared');
});

test('short above demand: room = (close − demandTop)/ATR', () => {
  const t = T.triageAlert(shortBase());
  assert.equal(t.cap.opposing.state, 'ahead');
  assert.equal(t.cap.opposing.roomAtr, 2);           // (100-96)/2
  assert.equal(t.hurdle.label, 'BB mid + CAP demand');
  assert.equal(t.status, T.STATUS.REVIEW);
});

test('short inside demand → Exclude today', () => {
  const t = T.triageAlert(shortBase({ close: 95.5, bbMid: 93 }));
  assert.equal(t.path, 'Inside opposition');
  assert.equal(t.status, T.STATUS.EXCL);
});

test('short below demand → Cleared; demand above price is not an obstacle', () => {
  const t = T.triageAlert(shortBase({ close: 94, bbMid: 91, sma50: 88 }));
  assert.equal(t.cap.opposing.state, 'cleared');
  assert.equal(t.cells.cap, 'Below demand');
  assert.ok(!t.levelsAhead.some(l => l.name === 'CAP demand'));
});

test('missing CAP never creates a pass (max Conditional)', () => {
  const t = T.triageAlert(longBase({ cap: {} }));
  assert.equal(t.cap.available, false);
  assert.equal(t.cells.cap, 'n/a');
  assert.notEqual(t.status, T.STATUS.REVIEW);
  assert.ok(t.reasons.includes('CAP_NA'));
});

test('missing CAP and BB mid → Data incomplete', () => {
  const t = T.triageAlert(longBase({ cap: {}, bbMid: null }));
  assert.equal(t.status, T.STATUS.DATA);
  assert.equal(t.path, 'No structural data');
});

test('missing MACD → Data incomplete; missing ATR → Data incomplete', () => {
  assert.equal(T.triageAlert(longBase({ macd: {} })).status, T.STATUS.DATA);
  assert.equal(T.triageAlert(longBase({ atr: null })).status, T.STATUS.DATA);
});

test('long MACD below signal is lower conviction, not a veto', () => {
  const slow = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.45, sepPrev: 0.5, rawPrev: -0.3, closingSpeed: 0.05, rawHist: [-0.4, -0.35, -0.3] } }));
  assert.equal(slow.status, T.STATUS.COND);
  assert.ok(slow.warnings.includes('LONG_MACD_LOWER_CONVICTION'));
  assert.equal(slow.macd.normPct, -0.2);
});

test('long MACD below signal: fast convergence is acceptable; expansion is lower conviction', () => {
  const conv = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, sepPrev: 0.5, rawPrev: -0.3, closingSpeed: 0.2, rawHist: [-0.4, -0.35, -0.3] } }));
  assert.equal(conv.status, T.STATUS.REVIEW);
  assert.match(conv.cells.macd, /below signal, converging \(fast\).*MACD0 −0.20%/);
  const exp = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.4, sep: 0.6, sepPrev: 0.4, rawPrev: -0.3, closingSpeed: 0.2, rawHist: [-0.1, -0.2, -0.3] } }));
  assert.equal(exp.status, T.STATUS.COND);
  assert.ok(exp.warnings.includes('LONG_MACD_LOWER_CONVICTION'));
});

test('MACD tags never use SPEED or SEP wording', () => {
  const t = T.triageAlert(longBase());
  assert.ok(!/SPEED|SEP/i.test(t.cells.macd));
});

test('DI control opposing alone is not a rejection; only the four tags are used', () => {
  const t = T.triageAlert(longBase()); // sellers control (18 vs 26), gap -8 vs -12 → buyer shift
  assert.equal(t.di.control, 'DI Control – Sellers');
  assert.equal(t.di.shift, 'DI Shift – Buyers');
  assert.equal(t.status, T.STATUS.REVIEW);
  const tags = new Set(['DI Control – Buyers', 'DI Control – Sellers', 'DI Shift – Buyers', 'DI Shift – Sellers', null]);
  assert.ok(tags.has(t.di.control) && tags.has(t.di.shift));
});

test('direct Table 3 DI shift works without ticker history and takes precedence over saved scans', () => {
  const t = T.triageAlert(longBase({ diGapShift3: 5, hist: { adxPrev: 29, diGap: 50 } }));
  assert.equal(t.di.gapChange3, 5);
  assert.equal(t.di.shift, 'DI Shift – Buyers');
  assert.equal(t.di.shiftSource, 'data-window');
  assert.ok(!t.dataGaps.includes('DI_HISTORY_NA'));
});

test('earnings within 14 days / after-hours move / missed entry → Exclude today', () => {
  assert.equal(T.triageAlert(longBase({ earnings: { tradingDays: 14, date: '2026-10-27' } })).status, T.STATUS.EXCL);
  assert.equal(T.triageAlert(longBase({ earnings: { tradingDays: 15, date: '2026-10-28' } })).status, T.STATUS.REVIEW);
  assert.equal(T.triageAlert(longBase({ ahMovePct: 3 })).status, T.STATUS.EXCL);     // 3% / 2% ATR = 1.5 ATR
  const m = T.triageAlert(longBase({ priorSignals: [{ tradingDaysAgo: 2, close: 97 }] }));   // +1.5 ATR since
  assert.equal(m.status, T.STATUS.EXCL);
  assert.ok(m.reasons.includes('ENTRY_MISSED'));
  assert.match(T.appendixLine(m), /Exclude today/);
});

test('near hurdle is priority context, not an automatic exclusion', () => {
  const limited = T.triageAlert(longBase({ bbMid: 100.3 }));                       // 0.15 ATR
  assert.equal(limited.status, T.STATUS.COND);
  assert.ok(limited.conditions.includes('LIMITED_INITIAL_ROOM'));
  const near = T.triageAlert(longBase({ bbMid: 101.2 }));                          // 0.6 ATR
  assert.equal(near.path, 'Hurdle near');
  assert.equal(near.status, T.STATUS.COND);
});

test('structural condition and MACD lower-conviction warning remain visible', () => {
  const t = T.triageAlert(longBase({ bbMid: 101.2, macd: { macd: -1, raw: -0.2, sep: 0.3, sepPrev: 0.5, rawPrev: -0.3, closingSpeed: 0.2, rawHist: [-0.4, -0.35, -0.3] } }));
  assert.equal(t.status, T.STATUS.COND);
  assert.ok(!t.reasons.includes('MULTIPLE_OPEN_CONDITIONS'));
  assert.ok(t.reasons.includes('HURDLE_NEAR'));
  assert.ok(!t.reasons.includes('MACD_OPPOSED'));
});

test('validated short DI/ADX and normalised MACD0 cautions lower priority', () => {
  const t = T.triageAlert(shortBase({ gatr: 0.65, adx: 45, diPlus: 42, diMinus: 18 }));
  assert.equal(t.status, T.STATUS.COND);
  assert.deepEqual(t.warnings, ['SHORT_ADX_RUNOVER', 'SHORT_DI_RUNOVER']);
  assert.match(T.whyLine(t), /validated short warning/);
});

test('short DI 10–20 and MACD0 at least +0.25% are direction-specific warnings', () => {
  const t = T.triageAlert(shortBase({ diPlus: 31, diMinus: 16, macd: { macd: 1, raw: 0.3, sep: 0.3, gapState: -1, fastSlow: 1 } }));
  assert.equal(t.status, T.STATUS.COND);
  assert.equal(t.macd.normPct, 0.3);
  assert.deepEqual(t.warnings, ['SHORT_DI_CAUTION', 'SHORT_MACD0_FAR_ABOVE']);
});

test('long ADX, DI spread and normalised MACD0 distance are not vetoes', () => {
  const t = T.triageAlert(longBase({ adx: 45, diPlus: 5, diMinus: 40, hist: { bars: 3, close: 98, sma50: 106.5, sma200: 89.8, bbMid: 103.2, diGap: -40, adxPrev: 44 }, macd: { macd: -1, raw: -0.8, sep: 0.8, gapState: -1, fastSlow: 1 } }));
  assert.equal(t.status, T.STATUS.REVIEW);
  assert.deepEqual(t.warnings, []);
  assert.equal(t.macd.normPct, -0.8);
});

test('long below both SMA50 and SMA200 with seller DI control gets countertrend warning', () => {
  const t = T.triageAlert(longBase({ sma50: 106, sma200: 104, diPlus: 18, diMinus: 26 }));
  assert.equal(t.status, T.STATUS.COND);
  assert.ok(t.warnings.includes('LONG_COUNTERTREND'));
  assert.match(T.whyLine(t), /countertrend long/);
});

test('long countertrend warning requires both averages overhead and seller control', () => {
  const oneAverage = T.triageAlert(longBase());
  assert.ok(!oneAverage.warnings.includes('LONG_COUNTERTREND'));
  const buyersControl = T.triageAlert(longBase({ sma50: 106, sma200: 104, diPlus: 30, diMinus: 20 }));
  assert.ok(!buyersControl.warnings.includes('LONG_COUNTERTREND'));
});

test('opposed sector rotation lowers SID priority without excluding the signal', () => {
  const t = T.triageAlert(longBase({ sectorRotation: 'Unsupported', sectorEtf: 'XLI', sectorName: 'Industrials' }));
  assert.equal(t.status, T.STATUS.COND);
  assert.ok(t.warnings.includes('SECTOR_ROTATION_OPPOSED'));
  assert.equal(t.cells.sector, 'Rot. opposed');
  assert.match(T.whyLine(t), /sector rotation is opposed/i);
});

test('supportive sector rotation is context and does not erase other warnings', () => {
  const clean = T.triageAlert(longBase({ sectorRotation: 'Supported', sectorEtf: 'XLV' }));
  assert.equal(clean.status, T.STATUS.REVIEW);
  assert.deepEqual(clean.warnings, []);
  const risky = T.triageAlert(shortBase({ sectorRotation: 'Supported', adx: 45 }));
  assert.equal(risky.status, T.STATUS.COND);
  assert.ok(risky.warnings.includes('SHORT_ADX_RUNOVER'));
});

test('sector rotation breaks otherwise equal ranking: supportive, neutral, n/a, opposed', () => {
  const rows = [
    T.triageAlert(longBase({ sym: 'OPP', sectorRotation: 'Unsupported' })),
    T.triageAlert(longBase({ sym: 'NA', sectorRotation: null })),
    T.triageAlert(longBase({ sym: 'NEU', sectorRotation: 'Neutral' })),
    T.triageAlert(longBase({ sym: 'SUP', sectorRotation: 'Supported' })),
  ];
  // Opposed becomes Conditional, while the remaining otherwise-equal Review
  // candidates are ordered supportive, neutral, then unavailable.
  assert.deepEqual(T.sortTriaged(rows).map(x => x.sym), ['SUP', 'NEU', 'NA', 'OPP']);
});

test('data gaps cap at Conditional but are not counted as open conditions', () => {
  const t = T.triageAlert(longBase({ cap: {}, hist: {} }));
  assert.equal(t.status, T.STATUS.COND);
  assert.deepEqual(t.conditions, []);
  assert.ok(t.dataGaps.includes('CAP_NA') && t.dataGaps.includes('DI_HISTORY_NA'));
  assert.match(T.whyLine(t), /Data gap/);
});

test('MA path reports SMA50 and SMA200 separately', () => {
  const t = T.triageAlert(longBase());
  assert.equal(t.ma.d50, -3);    // (100-106)/2
  assert.equal(t.ma.d200, 5);
  assert.equal(t.ma.order, '50>200');
  assert.equal(t.ma.gapTrend, 'closing'); // |16|/2=8 now vs |16.7|/2=8.35 3 bars ago
});

test('opposed MACD with no state available → Conditional with data gap, never Data incomplete', () => {
  const t = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, closingSpeed: 0.2 } }));
  assert.equal(t.status, T.STATUS.COND);
  assert.ok(t.dataGaps.includes('MACD_STATE_NA'));
});

test('v1.5 exports drive MACD state without turning signal-side into a veto', () => {
  const c = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, gapState: -1, fastSlow: 1, barsSinceCross: 12 } }));
  assert.equal(c.macd.trend, 'converging'); assert.equal(c.macd.pace, 'Fast'); assert.equal(c.macd.source, 'v1.5');
  assert.equal(c.status, T.STATUS.REVIEW);
  const slow = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, gapState: -1, fastSlow: 0, barsSinceCross: 12 } }));
  assert.equal(slow.status, T.STATUS.COND);
  const e = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, gapState: 1, fastSlow: 1, barsSinceCross: 12 } }));
  assert.equal(e.status, T.STATUS.COND);
  const f = T.triageAlert(longBase({ macd: { macd: 1, raw: 0.05, sep: 0.1, gapState: 1, fastSlow: 1, barsSinceCross: 1 } }));
  assert.equal(f.macd.trend, 'fresh cross');
});

test('instrument mismatch and not-scanned alerts → Data incomplete with reason', () => {
  const m = T.triageAlert(longBase({ instrumentMismatch: 'scan read EURONEXT_DLY:AIR, not NYSE:AIR', source: 'Alert only' }));
  assert.equal(m.status, T.STATUS.DATA);
  assert.ok(m.reasons.includes('INSTRUMENT_MISMATCH'));
  assert.match(T.appendixLine(m), /alert only/);
  const n = T.triageAlert({ sym: 'ZZZ', dir: 'long', notScanned: true, cap: {}, macd: {} });
  assert.equal(n.status, T.STATUS.DATA);
  assert.ok(n.reasons.includes('NOT_SCANNED'));
});

test('bond/cash ETF → Exclude with its own reason; equity ETF is reviewed normally', () => {
  const b = T.triageAlert(longBase({ isEtf: true, isBondEtf: true, etfName: 'iShares Core U.S. Aggregate Bond ETF' }));
  assert.equal(b.status, T.STATUS.EXCL); assert.ok(b.reasons.includes('BOND_CASH_ETF'));
  const e = T.triageAlert(longBase({ isEtf: true }));
  assert.equal(e.status, T.STATUS.REVIEW);
});
