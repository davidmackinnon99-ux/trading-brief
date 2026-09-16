#!/bin/zsh

# This app's bundle appears pinned to launch under Rosetta translation when
# opened via Finder/LaunchServices (double-click), even though the script runs
# natively from a normal shell. Under Rosetta, /usr/bin/python3 shells out to
# xcrun, which fails to load its arm64-only Command Line Tools dylib under x86_64
# emulation -- silently killing the merge step (files still got archived, but no
# merged output or usable log). Fix: detect translation and re-exec natively
# before doing anything else. (Diagnosed + fixed 15 Sep 2026.)
if [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" == "1" ]]; then
    exec arch -arm64 /bin/zsh "$0" "$@"
fi
# ============================================================
# SBT Nightly Merge
# Rebuilt 28 Aug 2026 (David is away for a week, needs this to run
# reliably every night over Chrome Remote Desktop).
#
# WHY THIS EXISTS: the original SBT_Merger Automator app used
# AppleScript "choose file" / "display dialog" — both are unreliable
# over remote desktop (dialogs can render on a session context that
# isn't being streamed, or fail silently with no error). This version
# has ZERO AppleScript GUI dependencies: no picker, no dialog. It
# auto-detects SBT scan CSVs by CONTENT (looks for a tradingview_symbol
# or symbol column), not by filename guessing, so it works regardless
# of what SBT names the export.
#
# Files are ARCHIVED after each run (moved to SBT_Archive/<date>/) so
# next run only sees genuinely fresh downloads — this also solves the
# "which numbered duplicate copy did I actually want" ambiguity from
# manual merges, since stale files never sit around to be re-picked-up.
#
# UPDATED 14 Sep 2026: SBT's own export/download flow now lands new
# CSVs straight into Downloads/SBT_Latest instead of bare Downloads
# (browsers default a new download to the last-used Save-As folder,
# and SBT_Latest was that last-used folder) — so this app was silently
# finding nothing and doing nothing for several days. Two changes:
#   1. Candidate CSVs are now scanned from BOTH Downloads/SBT_Latest
#      (primary — where SBT is actually saving now) AND bare Downloads
#      (kept as a fallback in case that ever reverts), instead of only
#      bare Downloads.
#   2. The "always-current copy of today's files" convenience folder
#      is renamed from SBT_Latest to SBT_Processed_Today, since
#      SBT_Latest is now the live inbox SBT saves into — reusing that
#      same name for a folder this script deletes and rebuilds every
#      run would wipe out real downloads mid-run.
# (David, 10 Sep 2026, original intent preserved by the rename above:
# a single, predictable, always-current folder for grabbing today's
# per-routine files, e.g. to send to Claude, without digging through
# dated archive subfolders.)
#
# Output:  ~/Downloads/SBT_Merged_<date>.txt
# Log:     ~/Downloads/SBT_Merge_Log_<date>.txt  (since there's no
#          dialog to confirm success — check this file instead)
# ============================================================

DOWNLOADS="$HOME/Downloads"
INBOX_DIRS=("$DOWNLOADS/SBT_Latest" "$DOWNLOADS")
TODAY=$(date +%Y-%m-%d)
ARCHIVE_DIR="$DOWNLOADS/SBT_Archive/$TODAY"
PROCESSED_DIR="$DOWNLOADS/SBT_Processed_Today"
OUTFILE="$DOWNLOADS/SBT_Merged_$TODAY.txt"
LOGFILE="$DOWNLOADS/SBT_Merge_Log_$TODAY.txt"

exec > "$LOGFILE" 2>&1
echo "SBT Nightly Merge — $(date)"
echo "============================================"

# ── Find candidate CSVs (content-based, not filename-based) ──
# A file counts as an SBT scan export if its header row contains
# "tradingview_symbol" or an exact "symbol" column. Scans SBT_Latest
# first (where SBT actually saves to now), then bare Downloads as a
# fallback, so this keeps working if the save location changes again.
candidates=()
for d in "${INBOX_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    for f in "$d"/*.csv(N); do
        [[ -f "$f" ]] || continue
        header=$(head -1 "$f")
        if echo "$header" | grep -qi "tradingview_symbol\|^symbol,\|,symbol,\|,symbol$"; then
            candidates+=("$f")
        fi
    done
done

if [[ ${#candidates[@]} -eq 0 ]]; then
    echo "No SBT scan CSVs found in Downloads/SBT_Latest or Downloads. Nothing to do."
    osascript -e 'display notification "No SBT CSVs found." with title "SBT Nightly Merge"' 2>/dev/null
    exit 0
fi

echo "Found ${#candidates[@]} candidate file(s):"
for f in "${candidates[@]}"; do echo "  - $f"; done
echo ""

# ── Filter + merge (Python — proven logic, handles quoted CSVs
#    correctly, matches the manual merge run 28 Aug 2026) ──
python3 - "$OUTFILE" "${candidates[@]}" << 'PYEOF'
import csv, re, sys, os

outfile = sys.argv[1]
files = sys.argv[2:]
pattern = re.compile(r'^[A-Z]+:[A-Z0-9.]+$')
tickers = []
summary = []

# Carry forward anything already in today's merged output -- if this app is
# run more than once in a day (e.g. an SBT batch earlier, a tvremix batch
# later), a second run used to overwrite the first run's result instead of
# adding to it. Seeding `tickers` with the existing output file's own
# contents before processing this run's inbox makes repeat runs on the same
# day cumulative rather than destructive. (Fixed 16 Sep 2026 after a
# same-day SBT-then-tvremix double-run clobbered the SBT half of the
# result.)
carried = 0
if os.path.exists(outfile):
    with open(outfile) as f:
        for line in f:
            line = line.strip()
            if pattern.match(line):
                tickers.append(line)
                carried += 1

for fp in files:
    try:
        with open(fp, newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            cols = reader.fieldnames or []
            col = 'tradingview_symbol' if 'tradingview_symbol' in cols else ('symbol' if 'symbol' in cols else None)
            if not col:
                summary.append((fp, 'SKIPPED - no symbol column', 0))
                continue
            count = 0
            for row in reader:
                val = (row.get(col) or '').strip().strip('"')
                if pattern.match(val):
                    tickers.append(val)
                    count += 1
            summary.append((fp, col, count))
    except Exception as e:
        summary.append((fp, f'ERROR: {e}', 0))

total_raw = sum(c for _, _, c in summary) + carried
unique = sorted(set(tickers))
dup_count = total_raw - len(unique)

with open(outfile, 'w') as f:
    f.write('\n'.join(unique) + ('\n' if unique else ''))

if carried:
    print(f"  (carried over {carried} ticker(s) already in today's merged output from an earlier run)")
for fp, col, count in summary:
    print(f"  {fp}: {count} tickers (col={col})")
print("")
print(f"Total raw: {total_raw}")
print(f"Unique: {len(unique)}")
print(f"Duplicates removed: {dup_count}")
print(f"Output: {outfile}")
PYEOF

# ── Refresh SBT_Processed_Today/ (always today's files only, easy to
#    find without digging through dated archive subfolders) ──
rm -rf "$PROCESSED_DIR"
mkdir -p "$PROCESSED_DIR"
for f in "${candidates[@]}"; do
    cp "$f" "$PROCESSED_DIR/" 2>/dev/null
done

# ── Archive processed inputs so tomorrow's run doesn't re-see them.
#    This also empties SBT_Latest of today's files, ready for the next
#    batch SBT saves there. ──
mkdir -p "$ARCHIVE_DIR"
for f in "${candidates[@]}"; do
    mv "$f" "$ARCHIVE_DIR/" 2>/dev/null
done
echo ""
echo "Copied ${#candidates[@]} file(s) to: $PROCESSED_DIR"
echo "Archived ${#candidates[@]} file(s) to: $ARCHIVE_DIR"
echo "============================================"
echo "DONE — $(date)"

# Non-blocking banner (best-effort — the log file above is the source
# of truth if this doesn't render over remote desktop).
unique_count=$(wc -l < "$OUTFILE" 2>/dev/null | tr -d ' ')
osascript -e "display notification \"${unique_count:-0} unique tickers merged.\" with title \"SBT Nightly Merge — Done\"" 2>/dev/null
