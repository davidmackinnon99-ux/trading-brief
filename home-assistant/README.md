
## Changes 5–13 Nov 2026
- Curtains: Study/Flop Room device names and areas were swapped vs physical motors; fixed and each automation now targets the right cover
  (Study = cover.aqara_roller_shade_driver_e1_2, Flop Room = cover.aqara_roller_shade_driver_e1).
- Study curtain auto-close window: 12:30–17:30 (was open-ended "before 17:30", which closed it at midnight on 6 Nov).
- New template sensors sensor.<room>_ac_power (kW, measurement) mirroring the AC estimate input_numbers so long-term stats are kept.
- New Integral (kWh) helpers for 5 smart plugs and 5 ACs.
- House Power dashboard: "Grid Import by Tariff" section — daily kWh (statistics-graph), monthly kWh bars + $ lines (apexcharts),
  daily $ (apexcharts). Rates from input_number.grid_rate_{peak,shoulder,off_peak} (c/kWh); cost uses the current rate for all history.
- Full export: ha_export_2026-11-13.json
- 13 Nov: grid rates set to 25.431 c/kWh (temporary, all tariffs); monthly chart labels costs per month, tooltip shows full breakdown; cost charts no longer cache. Current dashboard: dashboard_house_power.json
