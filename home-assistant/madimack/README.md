# Madimack heat pump — Home Assistant config

Versioned copy of the HA automations and helper for the Madimack Elite V4 / Tuya Local
connection problem. The live copies are in HA; these are exports for history and rebuild.
Full background: `MADIMACK_TUYA_FAILURE_SYNOPSIS.md`.

## Files
- `automations.json` — the 7 Madimack automations (HA automation config format)
- `input_boolean.json` — the `madimack_overnight_isolation` helper

## Diagnostic test (started 4 Oct 2026)
Question: is HA's local Tuya connection knocking the pump's Wi-Fi module over, or does the
module drop by itself?

- 23:05 — if the pump is confirmed off (after the 11pm pool shutdown), the Madimack
  Tuya Local entry is disabled and `input_boolean.madimack_overnight_isolation` turns on.
  Skipped on nights the pump is manually overridden on.
- Sunrise (or HA restart in daylight) — entry re-enabled; priority alert if not reconnected
  within 15 min; helper turns off.
- Official Tuya (cloud) climate entity re-enabled as a cloud-status recorder.
- "Tuya cloud offline" alert reports whether HA was silent at the time.

Reading the result:
- Cloud drops while isolation is ON → module/firmware fault, not HA.
- Cloud drops only while HA is connected → HA local session is the trigger; next single
  variable to test is poll-only mode.

## Alerting (daytime)
- 10 min unavailable → time-sensitive alert (recovery reload runs at the same point)
- 20 min unavailable → "recovery FAILED" alert
- Recovery → message with outage duration
- Existing recovery automation now skips while the overnight test is running.

## Not changed
Tuya Local stays on 2026.9.1 (2026.9.2 not a published release). Profile migration to
`madimack_elitev3_heatpump_updated.yaml` deferred until after the test.

## Results to 10 Oct 2026
- Overnight isolation ran 4, 5, 6 and 8 Oct (about 6 h each). Tuya cloud did NOT drop on any of those nights.
- Cloud blips since 4 Oct were all brief (0-6 min) and in daytime.
- Local (Tuya Local) outages kept happening in daytime with cloud online: 8 Oct 09:24 (41 min),
  9 Oct 08:45-10:51 (several), 10 Oct from 11:06 (2.5 h+, pump running throughout).
- Tuya Local now on 2026.9.2 (installed by David); failure persists on 9.2.
- 10 Oct debug log: TCP connect succeeds, then the pump closes the socket on session-key step 1
  (914, empty reply) on every attempt. Pattern = the pump's single local-connection slot is
  occupied (stale HA socket or another LAN client such as the Smart Life app), not a wrong key,
  wrong IP or a dead module.
- Conclusion: the fault is in the local LAN session, not the pump's Wi-Fi/cloud side.
