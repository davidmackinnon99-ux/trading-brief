#!/bin/zsh
# Mirror the continuity docs from the repo to the iCloud Continuity folder (Finder-visible copy).
# Run by launchd (com.davidmackinnon.continuity-icloud-mirror, every 15 min) - NOT by a git hook,
# because the Claude app is not allowed to write into iCloud Drive (28 Nov 2026).
SRC="$HOME/tradingview-mcp-jackson"
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Working Files/Trading/Shell Scripts, Reports & Continuity Files/Continuity/Project md Files"
LOG="$HOME/Library/Logs/continuity-icloud-mirror.log"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
[ -d "$DEST" ] || { echo "$(ts) ERROR destination folder missing" >> "$LOG"; exit 0; }
for f in SID_Project_Continuity.md LORP_Project_Continuity.md STRATEGIES.md; do
  [ -f "$SRC/$f" ] || continue
  # skip if unchanged
  if [ -f "$DEST/$f" ] && cmp -s "$SRC/$f" "$DEST/$f" 2>/dev/null; then continue; fi
  # make sure an evicted (optimised-storage) copy is downloaded before overwriting
  [ -f "$DEST/$f" ] && brctl download "$DEST/$f" >/dev/null 2>&1
  if cat "$SRC/$f" > "$DEST/$f.tmp" 2>>"$LOG" && mv -f "$DEST/$f.tmp" "$DEST/$f" 2>>"$LOG"; then
    echo "$(ts) copied $f" >> "$LOG"
  else
    rm -f "$DEST/$f.tmp" 2>/dev/null
    echo "$(ts) FAILED $f" >> "$LOG"
  fi
done
exit 0
