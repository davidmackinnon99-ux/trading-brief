#!/bin/bash
# Pull-only pickup for the evening cloud tasks (added 2026-11-10).
#
# The cloud scheduled tasks (sector rotation report, TV MCP test copy,
# SID/LORP nightly pull) no longer write onto this Mac. They upload their
# files to the Google Drive folder "Trading Inbox"; Google Drive for Desktop
# syncs it here, and this job copies recognised files into place:
#   sector_rotation_YYYY-MM-DD.md|json        -> ~/Downloads/Briefs/
#   sector_rotation_YYYY-MM-DD_tvmcp.md|json  -> ~/Downloads/Briefs/tvmcp_test/
#   tvremix_sid_lorp_YYYY-MM-DD.csv           -> ~/Downloads/SBT_Latest/
# Anything else in the folder is ignored. Files are only ever copied as data
# (never executed), never overwrite an existing file, and each name is copied
# once (ledger), so the SBT merge app archiving SBT_Latest does not cause a
# re-copy. Runs every 5 minutes via com.davidmackinnon.drive-inbox-pickup.

set -u
INBOX="$HOME/Library/CloudStorage/GoogleDrive-david.mackinnon99@gmail.com/My Drive/Trading Inbox"
BRIEFS="$HOME/Downloads/Briefs"
SBT="$HOME/Downloads/SBT_Latest"
STATE_DIR="$HOME/.tradingview-mcp"
LEDGER="$STATE_DIR/drive-inbox-copied.txt"
LOG="$STATE_DIR/briefs/drive-inbox.log"

mkdir -p "$STATE_DIR/briefs"
touch "$LEDGER"
ts() { date "+%Y-%m-%d %H:%M:%S"; }

[ -d "$INBOX" ] || { echo "$(ts) inbox not found (Drive not syncing?): $INBOX" >> "$LOG"; exit 0; }

shopt -s nullglob
for SRC in "$INBOX"/*; do
  [ -f "$SRC" ] || continue
  NAME=$(basename "$SRC")
  grep -qxF "$NAME" "$LEDGER" && continue

  case "$NAME" in
    sector_rotation_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_tvmcp.md|\
    sector_rotation_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_tvmcp.json)
      DEST="$BRIEFS/tvmcp_test" ;;
    sector_rotation_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md|\
    sector_rotation_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json)
      DEST="$BRIEFS" ;;
    tvremix_sid_lorp_[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].csv)
      DEST="$SBT" ;;
    pickup_test_*.txt)
      echo "$(ts) test file seen: $NAME" >> "$LOG"; echo "$NAME" >> "$LEDGER"; continue ;;
    *)
      continue ;;   # not ours — leave it alone
  esac

  mkdir -p "$DEST"
  if [ -e "$DEST/$NAME" ]; then
    echo "$(ts) already present, not overwritten: $DEST/$NAME" >> "$LOG"
    echo "$NAME" >> "$LEDGER"; continue
  fi
  # Copy to a temp name first so readers never see a half-written file
  # (Drive may still be downloading an online-only file).
  # Python helper lets this launchd job download online-only Drive files itself
  # (plain cp/cat get "Resource deadlock avoided" when run from launchd).
  if /usr/bin/python3 "$(dirname "$0")/drive-inbox-copy.py" "$SRC" "$DEST/.$NAME.part" 2>>"$LOG" && [ -s "$DEST/.$NAME.part" ]; then
    mv "$DEST/.$NAME.part" "$DEST/$NAME"
    echo "$NAME" >> "$LEDGER"
    echo "$(ts) copied $NAME -> $DEST/" >> "$LOG"
  else
    rm -f "$DEST/.$NAME.part"
    echo "$(ts) copy failed (will retry next run): $NAME" >> "$LOG"
  fi
done
