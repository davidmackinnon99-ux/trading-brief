# Optimizer Diagnostic — CIFR / OUST vs IBM

Three Optuna studies (100 trials each, Sortino objective, **full-history in-sample** → optimistic).
Sortino here is the optimizer's per-BAR basis (≈1/√holding of the adapter's per-TRADE Sortino).

| Ticker | Best Sortino | Negative trials | Regime/vol explored? | Basin verdict |
|---|---|---|---|---|
| CIFR | **0.084** | 0 / 14 | regimethreshold varied | genuine positive edge |
| OUST | **0.065** | 2 / 25 | regimethreshold varied | genuine positive edge |
| IBM  | 0.016 | 25 / 55 | regime+vol FIXED OFF, adx fixed | marginal / edge-less |

## Read

1. **CIFR and OUST are not edge-less names.** Their basins clear zero comfortably (4–5× IBM's
   Sortino, almost no negative trials). So the live losses on them are **not** the IBM problem
   ("this ticker has no edge"). By elimination that points at **entry quality (extension) and/or
   management (stops/breakeven)** — consistent with `REPORT.md`.
2. **Per-ticker optima are unstable → don't adopt them live.** The two winners' parameter sets
   disagree sharply: CIFR wants maxbarsback 7652 / relWt 28 / regr 49 / sma 29; OUST wants
   maxbarsback 1314 / relWt 6 / regr 9 / sma 61. No shared optimum — fitting each ticker's history
   is fitting its noise. Use the optimizer as an **edge diagnostic** (does a basin exist?), not as
   a per-ticker parameter source.
3. **maxbarsback is uninformative on both.** CIFR's optimal 7652 exceeds the symbol's actual
   history — it just means "use all data," the same non-edge lean seen on IBM.
4. **In-sample, not out-of-sample.** These Sortinos are fitted to full history and are optimistic;
   validate against the v2.11 adapter's OOS bucket before trusting any number.

## Caveat on the regime dimension
CIFR/OUST explored regime via a continuous `regimethreshold`, but neither varied the on/off
`useregimefilter`/`usevolatilityfilter` toggles. IBM had those toggles fixed OFF and never tried
them. So "does turning the regime filter ON help?" is still not directly tested by any of the three.

Inputs: `optimizer/CIFR_63fa6651.json`, `optimizer/OUST_04e11073.json`, `optimizer/IBM_3cb1ce2f.json`.
