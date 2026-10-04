# Madimack Elite V4 / Tuya Local failure synopsis

**Prepared:** 4 October 2026  
**Purpose:** Independent technical review and second opinion  
**Scope:** Home Assistant, `make-all/tuya-local`, the Madimack embedded Tuya communications module, and Tuya cloud connectivity

## Executive summary

A Madimack Elite V4 pool heat pump intermittently loses its usable Tuya communications session while the physical heat pump can continue operating. The failure has appeared in several forms:

- climate-critical datapoints disappear while some other datapoints remain available;
- full-status polls return empty or incomplete responses;
- Tuya Local reports errors 914 and later 902;
- the Tuya Local receive loop terminates;
- reloading the Home Assistant configuration entry sometimes restores a complete DP session, but did not restore the prolonged incident on 4 October;
- during the 4 October incident, Tuya Developer Platform also showed this particular device offline while the wider Tuya project/hub MQTT connection remained healthy;
- the device later recovered at the same IP without changing its local key, protocol, address or Home Assistant configuration.

The strongest working hypothesis is an interaction between Tuya Local's connection/session handling and the Madimack module's firmware. A local-session failure may leave the embedded module refusing or mishandling further sessions and, in the severe 4 October event, may also have disrupted its cloud/MQTT client. The exact firmware-level trigger is not proven.

## Hardware and software

- Device: Madimack Elite V4 inverter pool heat pump
- Tuya product ID: `kwrvh8zwvbbyp086` (already public in upstream issue #1420)
- Home Assistant integration: `make-all/tuya-local`
- Installed Tuya Local version during the incident: `2026.9.1`
- Configured local protocol: `3.42`
- Poll-only mode: enabled
- Local address: unchanged throughout the incident (private address omitted from this document)
- Official Tuya integration is also present, but it does not expose an equivalent usable climate-control entity
- Tuya Local profile currently selected: `madimack_elitev4_heatpump`
- Upstream maintainer states that this product ID is already supported by `madimack_elitev3_heatpump_updated.yaml`, an Elite V3 variant whose DP layout became the V4 layout before the branding changed

## Relevant Home Assistant entities

- `climate.spa_madimack_inverter_pool_heat_pump`
- `sensor.madimack_status`
- Native Tuya Local diagnostic temperature, power and EEV entities
- `automation.madimack_recover_tuya_local_connection`

The recovery automation triggers only after the climate entity remains `unknown` or `unavailable` continuously for ten minutes, then reloads only the Madimack Tuya Local configuration entry.

The dashboard's “Current Pool Temperature” is a separate Template entity sourced from the pool thermometer. It must not be used as evidence that the heat pump's Tuya connection is healthy.

## Earlier controlled diagnostic evidence

A prior Tuya Local debug trace captured the following sequence:

1. Tuya Local began returning error **914** (`Check device key or version`).
2. The receive loop terminated.
3. Subsequent attempts continued returning 914 and later error **902** (`timeout waiting for device`).
4. A full-status request returned an empty response; climate-critical DPs, particularly DP101 and DP102, disappeared.
5. The pump could continue operating physically while Home Assistant lost the climate state.
6. Destroying the old connection and creating a fresh protocol 3.42 session succeeded immediately.
7. The unchanged local key successfully decrypted the response.
8. The complete DP set returned, including operating state, mode, target, preset, power level and power consumption.

This prior trace established that, in that occurrence:

- the stored local key was correct;
- protocol 3.42 was correct;
- the configured IP and route were correct;
- the profile's DP definitions were capable of representing the returned data;
- a stale or failed Tuya session was not being recovered reliably;
- recreating the connection/session restored communication.

## Incident timeline — 4 October 2026 (Australia/Brisbane, UTC+10)

- **12:47:59 pm:** The climate entity and related Tuya Local diagnostics became unavailable.
- Tuya Local reported `receive loop has terminated` and `Failed setup, will retry: tuya-local device offline`.
- **12:57:59 pm:** The ten-minute recovery automation reloaded only the Madimack configuration entry. It did not restore communication.
- Official Tuya and Tuya Developer Platform both showed the Madimack device offline, while the wider Tuya project/hub MQTT connection remained healthy.
- A read-only test during the failure could not establish a usable local connection. This is an observed symptom, not proof of an IP change, Wi-Fi disassociation or power loss.
- The network continued to associate the device with its established IP address.
- The physical pump was reported operating during at least part of the communications outage.
- **6:35:48 pm:** The complete Home Assistant climate and diagnostic entity set returned without changing the address, local key, protocol or HA configuration.
- **6:40:50 pm:** The pump was turned off in the official app. Home Assistant immediately changed the climate state to `off`.
- **6:41:20 pm:** Tuya Local power fell to `0.0 kW`.
- Diagnostic temperatures continued updating afterward, confirming that the recovered local session remained active.

## Important interpretation of Tuya Developer “offline”

The Developer Platform's offline state confirms that Tuya cloud did not have an active connection from this specific device. It does not, by itself, distinguish among:

- Wi-Fi association loss;
- a stalled embedded Tuya network stack;
- a failed cloud/MQTT client;
- a firmware deadlock or watchdog event;
- exhaustion/corruption caused or aggravated by repeated local session negotiations.

Because the broader Tuya project/hub connection remained healthy, the cloud outage was specific to the Madimack device. Because the device later returned at the same IP without reconfiguration, an incorrect Home Assistant address is not a credible root cause.

One plausible combined explanation is that repeated or overlapping local Tuya session activity wedges the Madimack module's communications subsystem badly enough to affect both its LAN protocol server and its cloud/MQTT client. This remains a hypothesis, not a proven firmware-level cause.

## Evidence from related upstream reports

### `make-all/tuya-local` issue #6054

Another Tuya water-heater user captured protocol 3.4 failures caused by overlapping communication against the same TinyTuya device object. Two connection/session negotiations occurred milliseconds apart. The device accepted one, returned an empty read for the other, then began returning 914 and refused later sessions. The reporter measured thousands of unnecessary session negotiations.

Tuya Local 2026.9.1 includes a change associated with #6054/#5347 to reopen closed persistent connections after errors. Despite using 2026.9.1, the Madimack failure recurred.

### Tuya Local 2026.9.2

Release 2026.9.2 adds a further communication change described as synchronizing all device communication, not only the receive loop. This appears directly relevant to preventing concurrent or overlapping operations against the same device object, but it has not yet been tested on this installation.

### Issue #5848 and proposed receive-loop restart

Issue #5848 documents a receive loop that can terminate unexpectedly and has no watchdog/restart path. A proposed workaround restarts the receive loop, but it does not necessarily discard the stale TinyTuya device/session object. The Madimack trace shows that full teardown and fresh session creation can be necessary, so restarting only the existing loop may be insufficient.

## Profile and temperature-mapping issue

This is related configuration debt but should be separated from the connection failure.

The selected `madimack_elitev4_heatpump` profile applies `scale: 10` to:

- DP114 — outlet/effluent water temperature
- DP117 — inflow temperature

The device returns whole-degree values such as `30` and `28`; the selected profile incorrectly mapped those to `3.0 °C` and `2.8 °C`. Local corrections changed both scales from 10 to 1.

The maintainer has since stated that product ID `kwrvh8zwvbbyp086` should use `madimack_elitev3_heatpump_updated.yaml`. This likely explains the product-ID warning and mapping mismatch. It is not yet established whether selecting the wrong device profile affects only entity/mapping behaviour or can influence the communication lifecycle.

Any Tuya Local/HACS update may overwrite the two local scale corrections, so they must be backed up and rechecked.

## Causes substantially ruled out by existing evidence

- A mistyped local key
- A permanently changed local key
- An incorrect fixed IP address
- A DHCP address change during the incident
- Protocol 3.4/3.42 selection being wholly incorrect (3.42 successfully negotiates and returns full data)
- Meross power interruption as the cause of selective DP disappearance
- A general Home Assistant outage
- A general Tuya project/hub MQTT outage
- Tuya cloud “DP Instructions versus Standard Instructions” causing the LAN DP loss
- The separate pool-temperature Template entity proving Tuya connectivity

## Factors still capable of contributing

- Tuya Local 2026.9.1 connection concurrency/session handling
- Poll-only mode repeatedly creating or stressing connections
- Madimack firmware accepting only one local session and recovering poorly from collisions
- The official mobile app creating a competing local connection when open on the same LAN
- Another unidentified local Tuya client
- The wrong Tuya Local device profile being selected
- An embedded Tuya module firmware defect affecting both local and cloud connectivity

The official Home Assistant Tuya integration uses the cloud path and should not be assumed to create a competing LAN socket without evidence.

## Existing mitigation and its limitation

The ten-minute recovery automation performs a supported config-entry reload. It successfully approximates a full connection teardown in some failures. During the 4 October incident, one reload was insufficient because setup continued to report the device offline.

No reliable priority phone alert was received for the outage. Recovery and alerting therefore need to be treated as separate mechanisms.

## Proposed controlled next steps

1. Wait for the upstream maintainer's response to the 4 October report.
2. Back up the locally modified DP114/DP117 mappings.
3. Confirm how to migrate/reselect the existing entry to `madimack_elitev3_heatpump_updated.yaml` without losing entity IDs or dependent automations.
4. Update Tuya Local from 2026.9.1 to 2026.9.2 and verify whether local profile changes were overwritten.
5. Test stability without making any other simultaneous change.
6. If failures recur, test poll-only disabled as the next single controlled variable, provided the maintainer agrees that persistent mode is appropriate for this device.
7. Independently repair priority notifications: alert after ten continuous minutes of `unknown`/`unavailable`, report failed recovery, and send a recovery message with outage duration.
8. Consider bounded recovery retries rather than an unlimited reload loop.

## Questions for independent review

1. Does the #6054 concurrent-session mechanism plausibly explain both local protocol failure and the Madimack cloud/MQTT client going offline?
2. Is Tuya Local 2026.9.2's “synchronize all communication” change likely to prevent the observed 914/902/empty-response chain?
3. Could poll-only mode materially increase session churn or collision risk for a protocol 3.42 device?
4. Can selecting the wrong Tuya Local device profile influence connection behaviour, or only entity matching and DP mapping?
5. Would `madimack_elitev3_heatpump_updated.yaml` produce correct whole-degree DP114/DP117 temperatures without local patches?
6. Should recovery recreate the entire TinyTuya device/session object after repeated 914/902 errors or an empty full poll, rather than only restart the receive loop?
7. What mechanism could allow the heat pump to continue operating while both its Tuya LAN server and cloud client are unavailable for several hours, then recover without a power cycle?
8. What is the safest way to migrate profiles and update Tuya Local while preserving entity IDs and all dependent automations?

## Public references

- Madimack support/profile report: <https://github.com/make-all/tuya-local/issues/1420>
- Protocol/session error 914 report: <https://github.com/make-all/tuya-local/issues/5347>
- Captured concurrent communication/session failure: <https://github.com/make-all/tuya-local/issues/6054>
- Receive-loop termination/recovery gap: <https://github.com/make-all/tuya-local/issues/5848>
- Tuya Local releases: <https://github.com/make-all/tuya-local/releases>

## Privacy note

This synopsis intentionally omits the local key, device ID, precise private IP address and raw private diagnostic logs.
