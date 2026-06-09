# MACD Bullish Signal Line Cross - Scan Watchlist (2-day, FILTERED)

**Source:** SBT scan export | **Window:** 2026-06-05 -> 2026-06-08 (2 trading days) | **Members:** 35

## Filters applied in the scan (David, 2026-06-09)
- **ETFs removed** at source (KBE / SHV / TBIL gone vs the unfiltered 2-day list)
- **Min price raised $5 -> $10** to cut low-priced noise
- **Class A only** on transcription - dropped secondary share classes: NWS

## LORP cross-check
Three names on this list also fired a **LORP entry**: **SPG, EQR** (both present), and
**TOI** - but TOI ($5.07) was **removed by the new $10 floor.** So the $10 filter has a
cost: it drops a sub-$10 name LORP liked. Trade-off to weigh - sub-$10 names are noisier
(and where SID bled), but LORP's profitable and it signalled TOI. Your call whether $10
is worth losing the occasional low-priced LORP entry.

## Scan definition
MACD line crossed ABOVE signal (12/26 EMA) = bullish crossover. Same condition as the
validated LORP **MACD0** gate. `date` column = scan run date, not per-ticker cross day.

## Members - snapshot 2026-06-08 (2-day, ETFs out, >=$10, Class A)
| Symbol | Name | Close | %Chg | ADX | +DI | -DI | Grade | Sector | LORP |
|--------|------|------:|-----:|----:|----:|----:|------:|--------|:----:|

| NYSE:OSCR | Oscar Health Inc | 27.39 | 11.75 | 41.9 | 41.6 | 14.4 | 100.0 | Healthcare |  |
| NYSE:PBI | Pitney Bowes Inc. | 16.94 | 0.50 | 39.0 | 37.3 | 15.5 | 99.9 | Industrials |  |
| NASDAQ:EXEL | Exelixis, Inc. | 51.74 | -1.80 | 36.5 | 29.4 | 16.6 | 99.6 | Healthcare |  |
| NYSE:VOYA | ING U.S. Inc. | 88.48 | 2.08 | 21.6 | 41.7 | 12.6 | 99.5 | Financial Services |  |
| NYSE:UNM | Unum Group | 87.02 | 0.23 | 38.8 | 32.4 | 9.6 | 99.4 | Financial Services |  |
| NASDAQ:ZVRA | Zevra Therapeutics, Inc. | 12.09 | 14.00 | 26.7 | 36.5 | 18.1 | 99.1 | Healthcare |  |
| NASDAQ:CSX | CSX Corporation | 47.11 | 0.23 | 23.7 | 23.6 | 14.1 | 99.1 | Industrials |  |
| NYSE:MAC | Macerich Company (The) | 23.39 | -1.06 | 20.5 | 30.5 | 11.5 | 98.9 | Real Estate |  |
| NYSE:FBP | First BanCorp. | 24.49 | 0.74 | 20.2 | 29.0 | 14.2 | 98.4 | Financial Services |  |
| NASDAQ:MRX | Marex Group plc | 57.99 | 5.23 | 15.0 | 25.9 | 16.9 | 98.4 | Financial Services |  |
| NASDAQ:NWBI | Northwest Bancshares, Inc. | 14.28 | 0.63 | 26.4 | 24.9 | 14.7 | 98.1 | Financial Services |  |
| NYSE:BRX | Brixmor Property Group Inc. | 30.93 | -0.15 | 21.4 | 28.7 | 18.2 | 97.3 | Real Estate |  |
| NYSE:EQR | Equity Residential | 67.34 | -1.26 | 23.9 | 29.4 | 16.7 | 97.2 | Real Estate | entry |
| NYSE:KIM | Kimco Realty Corporation | 24.24 | 0.04 | 19.2 | 28.9 | 16.8 | 97.2 | Real Estate |  |
| NYSE:KRG | Kite Realty Group Trust | 27.88 | 0.69 | 21.7 | 29.1 | 14.2 | 97.2 | Real Estate |  |
| NYSE:UDR | UDR, Inc. | 38.61 | -1.54 | 28.1 | 32.5 | 15.0 | 97.1 | Real Estate |  |
| NYSE:NOV | National Oilwell Varco, Inc. | 21.12 | 4.87 | 12.7 | 22.1 | 18.4 | 97.0 | Energy |  |
| NYSE:BNL | Broadstone Net Lease, Inc. | 20.63 | 0.15 | 17.6 | 26.7 | 14.5 | 96.7 | Real Estate |  |
| NASDAQ:FHB | First Hawaiian, Inc. | 27.54 | 0.73 | 17.8 | 24.8 | 15.7 | 96.3 | Financial Services |  |
| NASDAQ:TNGX | Tango Therapeutics | 30.93 | 52.97 | 20.8 | 45.5 | 14.6 | 95.6 | Healthcare |  |
| NYSE:SPG | Simon Property Group, Inc. | 207.34 | -1.42 | 12.2 | 25.2 | 13.5 | 95.5 | Real Estate | entry |
| NYSE:MFC | Manulife Financial Corporati | 38.89 | 0.41 | 14.1 | 21.2 | 26.7 | 93.4 | Financial Services |  |
| NASDAQ:SFNC | Simmons First National Corpo | 21.60 | 0.09 | 12.8 | 20.6 | 17.2 | 93.1 | Financial Services |  |
| NASDAQ:COLB | Columbia Banking System, Inc | 29.68 | 0.07 | 12.0 | 26.7 | 17.9 | 92.8 | Financial Services |  |
| NASDAQ:ORKA | Oruka Therapeutics, Inc. | 64.06 | 6.52 | 17.5 | 26.8 | 18.4 | 89.8 | Healthcare |  |
| NYSE:CI | Cigna Corporation | 289.61 | 0.04 | 14.2 | 28.4 | 19.0 | 88.9 | Healthcare |  |
| NYSE:JNJ | Johnson & Johnson | 232.16 | -0.27 | 15.5 | 27.9 | 21.7 | 88.8 | Healthcare |  |
| NASDAQ:CVBF | CVB Financial Corporation | 20.50 | 0.05 | 11.5 | 22.3 | 19.1 | 88.2 | Financial Services |  |
| NYSE:AMH | American Homes 4 Rent | 32.77 | -1.49 | 27.6 | 24.8 | 11.9 | 87.8 | Real Estate |  |
| NYSE:SSL | Sasol Ltd. | 13.45 | -0.15 | 10.7 | 31.5 | 29.2 | 87.8 | Energy |  |
| NYSE:NVRI | Enviri Corporation | 19.88 | 3.01 | 18.3 | 26.6 | 13.8 | 87.0 | Basic Materials |  |
| NASDAQ:TROW | T. Rowe Price Group, Inc. | 105.45 | -0.50 | 22.4 | 28.6 | 16.2 | 85.0 | Financial Services |  |
| NYSE:DEI | Douglas Emmett, Inc. | 12.26 | 0.57 | 24.6 | 27.8 | 13.8 | 84.9 | Real Estate |  |
| NYSE:FHN | First Horizon National Corpo | 24.27 | 0.41 | 12.6 | 20.5 | 21.1 | 83.3 | Financial Services |  |
| NASDAQ:NWSA | News Corporation - Class A | 27.06 | -0.73 | 24.3 | 26.9 | 16.4 | 80.5 | Consumer Cyclical |  |
