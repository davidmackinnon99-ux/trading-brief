#!/usr/bin/env zsh
# Shell helpers for the tradingview-mcp-jackson pipeline.
# Install once — add this line to ~/.zshrc:
#   source "$HOME/tradingview-mcp-jackson/scripts/shell-aliases.sh"

# cf <ticker|csv|path> — run confluence_check.py on a CSV.
#   cf AAL              → ~/Downloads/AAL.csv
#   cf AAL.csv          → ~/Downloads/AAL.csv
#   cf ~/some/where.csv → that exact file
# Runs from the repo dir (in a subshell, so your current directory is unchanged).
cf() {
  if [[ -z "$1" ]]; then
    echo "usage: cf <ticker>     e.g.  cf AAL     (reads ~/Downloads/<ticker>.csv)"
    return 1
  fi
  local f="$1"
  [[ "$f" != *.csv ]] && f="${f}.csv"                       # add .csv if omitted
  [[ "$f" != /* && "$f" != \~* ]] && f="$HOME/Downloads/$f" # bare name → ~/Downloads
  f="${f/#\~/$HOME}"                                         # expand a leading ~
  if [[ ! -f "$f" ]]; then
    echo "cf: file not found: $f"
    return 1
  fi
  ( cd "$HOME/tradingview-mcp-jackson" && python3 scripts/confluence_check.py "$f" )
}
