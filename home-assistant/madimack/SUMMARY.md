# Madimack heat pump in Home Assistant: consolidated summary (10 Oct 2026)

Full downloadable version sent to David as MADIMACK_HA_SUMMARY_2026-10-10.md; this is the repo copy.

## Root cause
The heat pump's Wi-Fi module jams and refuses new local connections while cloud and the pump keep working.
A real power cycle of the heat pump (Outside Heat Pump Plug, Meross, switch.outside_heat_pump_plug_outlet,
60 s, pump drawing <20 W) clears it. The pool plug powers the circulation pump, not the heat pump.
Likely trigger: connection churn (poll-only mode, plus Pool Day Controller re-sending commands 5-7x/hour at set temp).

## Recovery
- Automatic: automation "Madimack - Power-cycle recovery" (automation_power_cycle_recovery.json): 25 min offline,
  <20 W draw, plug off 60 s, on, reload, verify, notify. Max once per 2 h. If >=20 W: urgent alert, no power cut.
- Manual: pump off in app, wait 2-3 min (6-7 W), Outside Heat Pump Plug off 60 s, on, wait 2 min, reload if needed.

## Changes
- Tuya Local Madimack: poll-only OFF; protocol 3.42 unchanged; Tuya Local 2026.9.2.
- script.madimack_set_hvac_mode + input_datetime.madimack_last_command (guarded commands; heat 10-min gap; off never delayed).
- Pool Day Controller: 5 climate calls routed via the script (old version: commit ef25ac8).
- Alerts: offline 10/20 min, recovered, Tuya cloud offline. Reload recovery at 10 min unchanged.
- Overnight isolation start/end automations: OFF (test finished).
- Official Tuya climate entity re-enabled as cloud-status recorder.

## Open items
- Profile migration to madimack_elitev3_heatpump_updated.yaml still pending; recheck DP114/DP117 scale edits after updates.
- Pool plug controlled by both HA and HomeKit.
- "Test" in logs = Tuya Local connection test during settings saves (14:13-14:54), not a real device.
