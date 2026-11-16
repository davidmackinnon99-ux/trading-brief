# SBT merge apps

One script (run.sh), three app bundles in /Applications:
- SBT Nightly Merge.app: everything (incl. tvremix) -> SBT_Merged_<date>.txt
- SBT Merge LORP.app -> SBT_Merged_LORP_<date>.txt (skips tvremix files)
- SBT Merge SID.app  -> SBT_Merged_SID_<date>.txt (skips tvremix files)
Mode is taken from the app name. Workflow: download LORP routine CSVs, run LORP; download SID CSVs, run SID.
All outputs and logs go in ~/Downloads/SBT_Processed_Today (reset when the date changes; old day -> SBT_Archive/<date>/processed).
To update the apps, copy run.sh into each bundle at Contents/MacOS/run.sh.
