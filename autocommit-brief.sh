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
  echo "no working-tree changes to commit"
else
  git -c user.name="David MacKinnon" -c user.email="david.mackinnon99@gmail.com" \
      commit -m "chore: brief snapshot $(date +%F)" && echo "committed"
fi

# Claude (16 Sep 2026): push whenever local main is ahead of personal/main, even when
# THIS run had nothing new to commit — e.g. a commit already made earlier today by a
# Claude session working directly in the repo. The old version only pushed inside the
# "just committed something" branch, so an already-committed-but-unpushed commit from
# outside this script would sit local-only until the next time something changed here.
git fetch personal main --quiet 2>/dev/null
AHEAD=$(git rev-list --count personal/main..HEAD 2>/dev/null || echo 0)
if [ "$AHEAD" != "0" ]; then
  if git push personal HEAD:main; then
    echo "pushed to personal (trading-brief) — $AHEAD commit(s)"
  else
    echo "PUSH FAILED — check GitHub auth (token/credential helper) for the 'personal' remote"
  fi
else
  echo "up to date with personal/main — nothing to push"
fi
