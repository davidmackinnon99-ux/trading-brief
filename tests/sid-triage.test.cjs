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

test('MACD opposed converging slowly → Exclude (material exclusion)', () => {
  const slow = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.45, sepPrev: 0.5, rawPrev: -0.3, closingSpeed: 0.05, rawHist: [-0.4, -0.35, -0.3] } }));
  assert.equal(slow.status, T.STATUS.EXCL);
  assert.match(T.appendixLine(slow), /converging slowly/);
});

test('MACD opposed but converging fast → Conditional; opposed and expanding → Exclude', () => {
  const conv = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, sepPrev: 0.5, rawPrev: -0.3, closingSpeed: 0.2, rawHist: [-0.4, -0.35, -0.3] } }));
  assert.equal(conv.status, T.STATUS.COND);
  assert.deepEqual(conv.conditions, ['MACD_OPPOSED']);
  assert.match(conv.cells.macd, /Opposed, converging \(fast\)/);
  const exp = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.4, sep: 0.6, sepPrev: 0.4, rawPrev: -0.3, closingSpeed: 0.2, rawHist: [-0.1, -0.2, -0.3] } }));
  assert.equal(exp.status, T.STATUS.EXCL);
  assert.ok(exp.reasons.includes('MACD_OPPOSED'));
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

test('earnings / after-hours move / missed entry → Learning only without erasing the signal', () => {
  assert.equal(T.triageAlert(longBase({ earnings: { tradingDays: 2, date: '2026-10-09' } })).status, T.STATUS.LEARN);
  assert.equal(T.triageAlert(longBase({ ahMovePct: 3 })).status, T.STATUS.LEARN);     // 3% / 2% ATR = 1.5 ATR
  const m = T.triageAlert(longBase({ priorSignals: [{ tradingDaysAgo: 2, close: 97 }] }));   // +1.5 ATR since
  assert.equal(m.status, T.STATUS.LEARN);
  assert.ok(m.reasons.includes('ENTRY_MISSED'));
  assert.match(T.appendixLine(m), /Learning only/);
});

test('hurdle closer than ROOM_MIN → Exclude; between MIN and OPEN → Conditional', () => {
  assert.equal(T.triageAlert(longBase({ bbMid: 100.3 })).status, T.STATUS.EXCL);   // 0.15 ATR
  const near = T.triageAlert(longBase({ bbMid: 101.2 }));                          // 0.6 ATR
  assert.equal(near.path, 'Hurdle near');
  assert.equal(near.status, T.STATUS.COND);
});

test('two open conditions → Exclude today with both reasons visible', () => {
  const t = T.triageAlert(longBase({ bbMid: 101.2, macd: { macd: -1, raw: -0.2, sep: 0.3, sepPrev: 0.5, rawPrev: -0.3, closingSpeed: 0.2, rawHist: [-0.4, -0.35, -0.3] } }));
  assert.equal(t.status, T.STATUS.EXCL);
  assert.ok(t.reasons.includes('MULTIPLE_OPEN_CONDITIONS'));
  assert.ok(t.reasons.includes('MACD_OPPOSED') && t.reasons.includes('HURDLE_NEAR'));
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

test('v1.5 exports drive MACD state: Gap State -1 + Fast → Conditional; Gap State 1 → Exclude', () => {
  const c = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, gapState: -1, fastSlow: 1, barsSinceCross: 12 } }));
  assert.equal(c.macd.trend, 'converging'); assert.equal(c.macd.pace, 'Fast'); assert.equal(c.macd.source, 'v1.5');
  assert.equal(c.status, T.STATUS.COND);
  const slow = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, gapState: -1, fastSlow: 0, barsSinceCross: 12 } }));
  assert.equal(slow.status, T.STATUS.EXCL);
  const e = T.triageAlert(longBase({ macd: { macd: -1, raw: -0.2, sep: 0.3, gapState: 1, fastSlow: 1, barsSinceCross: 12 } }));
  assert.equal(e.status, T.STATUS.EXCL);
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
