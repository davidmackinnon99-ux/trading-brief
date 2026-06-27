#!/usr/bin/env bash
# Daily backup of the brief working clone to YOUR GitHub (davidmackinnon99-ux/trading-brief).
# Commits any local changes and pushes to the 'personal' remote — NOT Lewis's 'origin'.
# Runs natively on your Mac (a sandbox can't write to .git). Safe to run repeatedly:
# it only commits when something changed, and never force-pushes.

set -uo pipefail

REPO="$HOME/tradingview-mcp-jackson"
LOG="$REPO/autocommit-brief.log"

exec >>"$LOG" 2>&1
echo "----- $(date '+%Y-%m-%d %H:%M:%S') -----"

cd "$REPO" || { echo "repo not found at $REPO"; exit 1; }

# clear any stale lock from an aborted run
[ -f .git/index.lock ] && rm -f .git/index.lock && echo "removed stale index.lock"

git add -A
if git diff --cached --quiet; then
  echo "no changes — nothing to commit"
else
  git -c user.name="David MacKinnon" -c user.email="david.mackinnon99@gmail.com" \
      commit -m "chore: brief snapshot $(date +%F)" && echo "committed"
  # push current branch to YOUR repo's main branch
  if git push personal HEAD:main; then
    echo "pushed to personal (trading-brief)"
  else
    echo "PUSH FAILED — check GitHub auth (token/credential helper) for the 'personal' remote"
  fi
fi
