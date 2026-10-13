#!/bin/bash
# Import the newest rich cloud sector report from Apple Mail into Downloads/Briefs.
# Prints the installed path, or exits non-zero so the caller can generate its
# compact local fallback.
set -u

TV_DIR="/Users/davidmackinnon/tradingview-mcp-jackson"
DEST_DIR="${1:-$HOME/Downloads/Briefs}"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

SAVED=$(osascript "$TV_DIR/scripts/import-sector-report.applescript" "$TMP_DIR") || exit 1
[ -n "$SAVED" ] && [ -s "$SAVED" ] || exit 1

NAME=$(basename "$SAVED")
case "$NAME" in
  sector_rotation_????-??-??.md) ;;
  *) echo "Unexpected sector report attachment name: $NAME" >&2; exit 1 ;;
esac

mkdir -p "$DEST_DIR"
mv -f "$SAVED" "$DEST_DIR/$NAME"
echo "$DEST_DIR/$NAME"

