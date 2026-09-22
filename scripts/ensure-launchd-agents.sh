#!/bin/bash
# Ensures the trading-brief LaunchAgents are bootstrapped into the user's
# launchd GUI domain. Runs at login and hourly as a safety net, because
# macOS does not always reliably re-register ~/Library/LaunchAgents/*.plist
# after every reboot (observed 2026-09-22: 4 agents silently dropped after
# a reboot, causing the morning brief to not fire at its 07:00 trigger).

set -u
UID_NUM=$(id -u)
LOGFILE="$HOME/.tradingview-mcp/briefs/agent-watchdog.log"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LABELS=(
  "com.davidmackinnon.tradingview-morning-brief"
  "com.davidmackinnon.indicators-daily"
  "com.davidmackinnon.brief-backup"
  "com.davidmackinnon.lorp-monitor"
  "com.david.trading-brief-autocommit"
)

mkdir -p "$(dirname "$LOGFILE")"
ts() { date "+%Y-%m-%d %H:%M:%S"; }

for LABEL in "${LABELS[@]}"; do
  PLIST="$AGENTS_DIR/$LABEL.plist"
  if [ ! -f "$PLIST" ]; then
    echo "$(ts) MISSING PLIST: $PLIST" >> "$LOGFILE"
    continue
  fi
  if launchctl print "gui/$UID_NUM/$LABEL" >/dev/null 2>&1; then
    : # already loaded, nothing to do, stay quiet
  else
    if launchctl bootstrap "gui/$UID_NUM" "$PLIST" 2>>"$LOGFILE"; then
      echo "$(ts) RE-BOOTSTRAPPED: $LABEL" >> "$LOGFILE"
    else
      echo "$(ts) FAILED TO BOOTSTRAP: $LABEL" >> "$LOGFILE"
    fi
  fi
done
