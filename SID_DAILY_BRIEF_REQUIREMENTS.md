# SID Daily Brief — Triage and Review Requirements

## 1. Purpose

The SID section of the daily brief must reduce a large set of valid SID entry alerts to a manageable, evidence-led review list.

It must answer two different questions in sequence:

1. **First pass — is there a credible price path for the SID objective?**
2. **Second pass — do momentum, participation and market context support taking that path now?**

The SID objective is an RSI move through RSI 50. The brief must therefore assess whether price has a plausible route to the price structure normally associated with that move. It must not assume that reaching an SMA is the objective, or that every statistically valid SID signal is a practical trade.

The operational aim is to reduce days with 40 or more alerts to roughly 8–12 worthwhile second reviews when the evidence permits. This is a target, not a quota: the brief must not promote weak candidates merely to fill a list or silently discard candidates using unvalidated rules.

## 2. Scope

This specification applies to the **SID section only** of the existing daily brief generator:

`/Users/davidmackinnon/tradingview-mcp-jackson/scripts/analyse-brief.cjs`

The LORP, ADX and Pullback sections are outside scope and must remain unchanged unless separately requested.

There is one SID daily brief and one morning run. This specification changes that brief's analysis and ordering. It must **not** create separate phase-specific briefs, change SID's TradingView entry logic, suppress alerts upstream, or start a second scan for every alert. Alert suppression may be considered later, after the new fields have been tested against outcomes.

### 2.1 Runtime constraint

The morning run already scans the full watchlist on the SID layout. The revised brief may read additional values that are already returned in that same Data Window payload, because this adds little processing time. It must not navigate to another chart or launch another TradingView scan for each candidate.

If a required value is not already available from the SID scan, the brief must display `n/a` or defer that feature. Any later sector-structure scan must scan each of the 11 sector ETFs only once and cache the result for every constituent; it must never rescan an ETF separately for each alert.

## 3. Governing principles

### 3.1 Separate signal, context and decision

- A SID entry signal is an observed event.
- Indicator and structural readings are context.
- A brief status is a workload aid, not a new entry signal.
- Missing data is `n/a`; it must never be converted into a pass.
- The brief must retain the raw inputs used to produce every derived label.

### 3.2 Direction matters

Every distance, obstacle and momentum reading must be interpreted in the intended trade direction.

- For a **long**, overhead supply, the BB midpoint, pivots and moving averages may obstruct the path; demand below may provide support.
- For a **short**, underlying demand, the BB midpoint, pivots and moving averages may obstruct the path; supply above may provide resistance.

A candidate being above a supply zone is materially different from being inside it or immediately below it. The brief must report that distinction rather than treating the mere existence of a nearby zone as a rejection.

### 3.3 Do not treat all moving averages equally

The EMA/SMA 50 is often the operational baseline for a swing, while the SMA 200 may describe only the broader regime. Their relevance must be inferred from recent price behaviour, not from their names alone.

Example: if price repeatedly reacts around the 50-period average while the SMA 200 is remote, the SMA 50 is the likely trade-path reference and the SMA 200 is broader countertrend context.

### 3.4 Confluence changes the importance of a level

A single nearby level is information. A cluster of the BB midpoint, pivot, moving average, CAP zone boundary or confirmed pattern target is a more substantial hurdle or destination. The brief must expose the components of a cluster rather than hide them behind a single unexplained score.

## 4. Required source data

Use exact study and plot identifiers wherever possible. Fuzzy matching must be tightly constrained because similarly named TradingView outputs can collide.

### 4.1 Existing SID and market fields

Retain the existing SID entry signal, price, ATR/ATR%, SMA50, SMA200, RVOL, volume delta, ADX, DI+, DI−, GP Zone, MACD values, sector mapping and market context inputs already read by the generator.

### 4.2 CAP Tools data

Read the following Data Window outputs from **CAP Tools Supplement v1.7**:

- `Near Supply Bot`
- `Near Supply Top`
- `Near Demand Top`
- `Near Demand Bot`

These are zone boundaries, not ATR-derived prices. CAP uses ATR to decide which retained pivot-price zones are relevant enough to display. The brief must not reconstruct the zones from ATR.

For each candidate, retain all four raw values and derive:

- nearest supply zone range;
- nearest demand zone range;
- price relation to each zone: `above`, `inside`, `below` or `n/a`;
- direction-relevant forward distance in price and ATR;
- whether a zone has already been cleared;
- whether the candidate starts inside a zone.

Recommended calculations, using `close` as price and the same current ATR used elsewhere in the brief:

```text
Long room to supply:
  if close < supplyBot: (supplyBot - close) / ATR
  if supplyBot <= close <= supplyTop: 0 ATR, inside supply
  if close > supplyTop: cleared / above supply

Short room to demand:
  if close > demandTop: (close - demandTop) / ATR
  if demandBot <= close <= demandTop: 0 ATR, inside demand
  if close < demandBot: cleared / below demand
```

Do not describe a long as blocked by a supply zone that is already below price. Do not describe a short as blocked by a demand zone that is already above price.

### 4.3 Bollinger Band midpoint

Capture the BB midpoint used on the review chart and derive:

- price above/below midpoint;
- distance to midpoint in price and ATR;
- midpoint slope over the selected short lookback;
- whether the midpoint lies in the intended trade direction;
- whether it clusters with an MA, pivot, CAP boundary or pattern target.

The BB midpoint is the preferred first structural proxy for the RSI 50 objective. Historical analysis of EFX found strong agreement between price above the BB midpoint and RSI at or above 50, and the BB midpoint generally crossed before RSI 50. This supports using it as a path marker, not as a guaranteed target or universal rule.

### 4.4 Pivots and pattern targets

Capture the nearest direction-relevant current pivot levels. Older pivot `P` lines are secondary unless price is currently reacting to them or they form part of a cluster.

Double-top, double-bottom, head-and-shoulders and inverse-head-and-shoulders targets must be identified separately from established supply/demand:

- an untested measured-move target is a projected objective or magnet;
- it becomes stronger structural evidence only after a reaction, retest or confluence;
- a target already reached must be labelled `reached`, not presented as a fresh destination.

### 4.5 Sector ETF context

Retain the existing sector-versus-SPY rotation measure and label it explicitly as `Sector rotation`, not the broader term `Sector support`. Rotation alone does not prove that the ETF has cleared structural resistance.

Do not add a new sector-chart scan to the initial implementation. If sector structural data is later added, scan each sector ETF once, cache it, and distinguish:

- `Rotation supportive/opposed/neutral`
- `Structure supportive/opposed/neutral/n/a`
- `Turn confirmed/not confirmed/n/a`

Until that data exists, display structure and turn as `n/a`; do not infer them from rotation.

### 4.6 Event and execution risk

Capture where reliable:

- earnings date and trading-day distance;
- overnight or pre-market gap/split from the prior close;
- whether the original SID entry was missed.

A missed entry, imminent earnings or an excessive overnight move may make a candidate unsuitable for a live trade even when it remains useful for the learning watchlist. Thresholds must be configurable and shown in the output, not buried in code.

## 5. Derived states

### 5.1 Price-path state

For each candidate, derive a concise path assessment:

- **Open** — useful room to the first meaningful hurdle.
- **Hurdle near** — a relevant midpoint, pivot, MA, pattern target or CAP boundary is close, but price is not inside a blocking zone.
- **Inside opposition** — long inside supply or short inside demand.
- **Cleared** — the nearest quoted opposing CAP zone is already behind price.
- **No structural data** — required structural fields are unavailable.

Show the first hurdle, its price, distance in ATR and the evidence forming it. Never reduce this to colour alone.

### 5.2 MA-path state

Report separately:

- price-to-SMA50 distance and 3-bar movement;
- price-to-SMA200 distance and 3-bar movement;
- distance between the MAs and whether that gap is closing, stable or expanding;
- MA order;
- likely operational baseline: `BB midpoint`, `SMA50`, `SMA200`, `cluster`, or `unclear`.

The operational baseline should be evidence-led. If it cannot be determined reliably from available history, use `unclear`; do not infer it solely from proximity.

### 5.3 DI and ADX state

Control and shift answer different questions and must remain separate.

Use only these four directional DI tags:

- `DI Control – Buyers`
- `DI Control – Sellers`
- `DI Shift – Buyers`
- `DI Shift – Sellers`

Also show the signed DI gap, 3-bar gap change, and ADX value/direction. A reversal candidate may have control still opposing the trade while the 3-bar shift supports it. Therefore current control must not be an automatic rejection by itself.

### 5.4 MACD state

Use the direct Data Window exports from **MACD Separation & Convergence v1.5**:

- `MACD Fast Slow State` — `1 = FAST`, `0 = SLOW`
- `MACD Gap State` — `-1 = CLOSING`, `0 = STABLE`, `1 = EXPANDING`

These are the only new MACD exports required. Existing MACD line, signal line, normalised separation and cross-quality outputs remain unchanged. Do not classify a ticker as `Data incomplete` merely because an earlier saved scan is unavailable.

Report:

- MACD side of signal;
- Fast/Slow result using the revised MACD tags;
- separation ratio;
- converging, stable or expanding;
- side of zero line;
- repeated recent crossing/chop warning.

Do not use the words `SPEED` or `SEP` in displayed tags. An opposing MACD is a material practical exclusion for the user's live review, but the raw state and reason must remain visible.

### 5.5 Participation state

Report RVOL, volume direction/delta and whether participation is aligned with the proposed trade. Low or conflicting participation is cautionary unless a validated hard rule is later adopted.

### 5.6 Weekly MACD

Include reliable weekly MACD alignment only if it is already available programmatically. Weekly MACD is an important SID confirmation; if the data source is not reliable, display `n/a` rather than fabricating an interpretation.

WT3D and OBV-MACD are visual review tools and are explicitly excluded from the automated brief.

## 6. Review workflow

### 6.1 First pass — structural viability

The first pass should be quick enough to use across all alerts and should answer:

1. Is price moving away from, back toward, or through its historically relevant baseline?
2. Is the BB midpoint in the intended direction, and how far away is it?
3. What is the first meaningful hurdle or destination?
4. Is the nearest opposing CAP zone ahead, currently occupied, or already cleared?
5. Are the MAs converging or expanding, and is that helpful for this direction?
6. Do current pivots or active pattern targets create a useful destination or a congested path?
7. Does the sector ETF have a viable path, not merely favourable relative rotation?

Candidates with no credible path go to the compact review appendix with the reason. Candidates with a viable or uncertain-but-interesting path proceed to the second pass.

### 6.2 Second pass — timing and confirmation

For surviving candidates, assess:

1. MACD alignment, separation and chop.
2. DI Control and DI Shift separately, with ADX direction.
3. RVOL and volume alignment.
4. Weekly MACD alignment where reliably available.
5. Market context and sector rotation. Sector structure remains a manual check until a cached ETF scan is deliberately added.
6. Earnings, overnight gap and missed-entry risk.

### 6.3 Brief status

These labels organise the morning workload; they are **not trade grades** and do not replace the second visual review. Use plain-language statuses rather than A/B/C classifications:

- **Review now:** the automated data shows a credible path and no immediate contradiction. Open the full chart for the second review.
- **Conditional:** the path may be credible, but one named condition still needs confirmation, such as MACD alignment or clearing a nearby hurdle.
- **Learning only:** the setup is analytically useful, but it is not a live candidate because of earnings, a large overnight move, a missed entry or another execution issue.
- **Exclude today:** the available evidence shows no credible path or a clear practical conflict. Always show the primary reason.
- **Data incomplete:** the brief lacks enough reliable values to classify it.

For example, EFX could be `Learning only` if its path is interesting but its overnight move and approaching earnings make it unsuitable to trade. OZK before entry might have been `Review now` if it had already cleared supply; that status would not have predicted the later reversal or replaced the chart check.

If the existing numeric score is retained temporarily, it must be subordinate to these statuses and its components must be shown. It must not override a clear structural or execution issue.

## 7. Daily brief presentation

### 7.1 Summary

Begin the SID section with:

```text
SID alerts: 44
Review now: 6
Conditional: 5
Learning only: 3
Excluded today: 27
Data incomplete: 3
```

### 7.2 Primary review table

Keep the table readable. Use compact values in the table and put explanatory evidence in a short note beneath each `Review now` or `Conditional` candidate.

Recommended columns:

```text
Ticker | Side | Price | Path | First hurdle | Room ATR | CAP | BB mid | MA path | MACD | DI | ADX | RVOL | Sector | Event | Class
```

Example:

```text
XYZ | Long | 42.10 | Hurdle near | BB mid + pivot 43.05 | 0.8 | Above supply | Below/rising | 50 closing | Aligned, converging | Shift–Buyers; Control–Sellers | 24 rising | 1.6 | Rotation supportive | Earnings 12d | Conditional
```

Candidate note:

```text
Why conditional: Price has cleared the nearest CAP supply zone and has a plausible 0.8 ATR path to a BB-midpoint/pivot cluster. Buyer shift is developing, but sellers still control DI.
```

### 7.3 Compact appendix

Preserve every non-promoted signal in an appendix:

```text
ABC — Exclude today: long begins inside supply; first hurdle 0.1 ATR.
DEF — Learning only: structure viable, but earnings in 2 trading days.
GHI — Data incomplete: CAP and BB midpoint unavailable.
```

This keeps the process auditable and permits later testing of whether a rejected group contained successful trades.

## 8. Audit and outcome data

For every SID alert, write a machine-readable record containing:

- date/time and symbol;
- direction and original SID signal fields;
- every raw indicator value used;
- all derived states and calculation versions;
- first hurdle and distance;
- brief status and explicit reason codes;
- whether it appeared in detailed review;
- later outcome fields when available.

Minimum later outcomes should include:

- RSI 50 reached and bars-to-reach;
- BB midpoint reached and bars-to-reach;
- SMA50/SMA200 reached where relevant;
- maximum favourable and adverse excursion before outcome/expiry;
- CAP/pivot reaction encountered;
- earnings or gap exclusion status.

Reason codes should be stable, for example:

```text
PATH_OPEN
HURDLE_NEAR
INSIDE_OPPOSING_ZONE
SECTOR_STRUCTURE_OPPOSED
MACD_OPPOSED
MACD_CHOP
EARNINGS_NEAR
OVERNIGHT_MOVE_LARGE
ENTRY_MISSED
DATA_INCOMPLETE
```

## 9. Implementation boundary and later validation

### 9.1 What Claude should implement now

Claude should produce one revised SID section within the existing daily brief. Every morning it should have the same format and contain the summary, primary review table and compact appendix described above.

The implementation must:

- reuse the existing SID scan and add no per-alert chart scans;
- read CAP and BB-midpoint values only if they are already present in the SID Data Window payload;
- add direction-aware path, first-hurdle and plain-language status fields;
- keep the existing sector-rotation result without adding a new sector structural scan;
- exclude WT3D and OBV-MACD;
- preserve every alert in the main table or compact appendix;
- leave TradingView alert generation unchanged; and
- avoid new silent hard gates.

Expected runtime effect: small, because the added work is arithmetic and formatting after the existing full-watchlist scan has finished. The scan itself, rather than these calculations, is the dominant cost.

### 9.2 What happens after implementation

The same brief can accumulate outcome records in the background. This does not create another brief or another morning workflow. The stored results can later be reviewed to determine whether CAP room, BB-midpoint distance, MACD opposition/chop, DI shift and event risk genuinely improve selection.

Only after sufficient results exist should a separate decision be made about changing SID's upstream TradingView alert logic. That possible future work is not part of the current implementation.

## 10. Acceptance criteria

The implementation is acceptable when:

1. CAP's four exact Data Window values are captured for the stock from the existing SID scan; sector values are used only if already available or added later through one cached ETF scan.
2. The brief correctly distinguishes above, inside and below a CAP zone.
3. Forward room is direction-aware and expressed in ATR.
4. BB midpoint is shown as a path proxy rather than treated as identical to SMA50 or RSI 50.
5. SMA50 and SMA200 are reported separately and are not automatically given equal importance.
6. DI Control and DI Shift remain separate and use only the four agreed tags.
7. MACD output uses the revised tags and omits `SPEED` and `SEP` wording.
8. Sector rotation is labelled accurately; unavailable sector structure is shown as `n/a`, not inferred.
9. Pattern targets are distinguished from established supply/demand and show reached status.
10. Earnings, overnight move and missed-entry exclusions can produce a `Learning only` status without erasing the signal.
11. Missing data displays as `n/a` and cannot create a pass.
12. Every alert is retained with raw values, brief status and reason codes.
13. Existing LORP, ADX and Pullback output is unchanged.
14. Tests cover long and short cases for price below, inside and above CAP zones, plus missing-value cases.

## 11. Current implementation gaps for Claude

The current generator already reads the SID signal, SMA50/SMA200, RVOL, volume delta, ATR%, ADX/DI, GP Zone, MACD Cross Zero and sector rotation. Its SID table currently emphasises raw values and an opaque score.

The next implementation should therefore focus on:

1. ingesting the four existing CAP zone exports;
2. ingesting or calculating the BB midpoint;
3. deriving direction-aware first-hurdle and room-to-hurdle fields;
4. labelling the existing sector result as rotation rather than full structural support;
5. replacing score-led ordering with the documented plain-language statuses and reason codes;
6. writing the audit/outcome record;
7. preserving all current strategy signals and non-SID brief sections.

Before coding, Claude should inspect the actual TradingView scan payload keys for CAP and BB outputs and add fixtures from real long, short and missing-data rows. Display labels and thresholds should be constants so that later validation can change them without rewriting the analysis logic.
