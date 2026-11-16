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
# Nightly Merge (named "SBT Nightly Merge" until 16 Nov 2026)
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
# UPDATED 16 Nov 2026 (evening, David): named source files.
#   TS_SID_LONG_<date>.csv / TS_SID_SHORT_<date>.csv  (TrendSpider scanner exports)
#   SBT_SID_<date>.csv / SBT_LORP_<date>.csv          (SwingTradeBot exports)
#   TVX_SID_<date>.csv / TVX_LORP_<date>.csv          (cloud nightly pull, ex-tvremix)
#   -> SID files merge into  ~/Downloads/SID_Merged_<date>.txt
#   -> LORP files merge into ~/Downloads/LORP_Merged_<date>.txt
#   The source is taken from the file name and reported per file in the log, with an
#   SID overlap count (TS only / SBT only / both). The symbol column is matched
#   case-insensitively ("Symbol", "symbol", "tradingview_symbol"). Bare tickers (TS exports
#   have no exchange) are qualified to EXCHANGE:TICKER from rules.json's watchlist map,
#   then TradingView's public US scanner; anything unresolved is listed in the log and
#   left out (a bare ticker can land on a foreign listing, e.g. AIR -> Airbus).
#   Unnamed files keep the old behaviour (mode app -> its strategy file; combined app ->
#   SBT_Merged_<date>.txt in SBT_Processed_Today). SID app skips LORP-named files and
#   vice versa.
#
# Output:  ~/Downloads/SBT_Merged_<date>.txt
# Log:     ~/Downloads/SBT_Merge_Log_<date>.txt  (since there's no
#          dialog to confirm success — check this file instead)
# ============================================================

DOWNLOADS="$HOME/Downloads"
# ── 16 Nov 2026: mode comes from the app's name. "SBT Merge LORP.app" / "SBT Merge SID.app"
#    write SBT_Merged_LORP_<date>.txt / SBT_Merged_SID_<date>.txt and skip tvremix files
#    (those mix SID and LORP, so they stay with the original combined app).
case "$0" in
  *LORP*) MODE=LORP ;;
  *SID*)  MODE=SID ;;
  *)      MODE=ALL ;;
esac
TAG=""; [[ "$MODE" != ALL ]] && TAG="${MODE}_"
INBOX_DIRS=("$DOWNLOADS/SBT_Latest" "$DOWNLOADS")
TODAY=$(date +%Y-%m-%d)
ARCHIVE_DIR="$DOWNLOADS/SBT_Archive/$TODAY"
PROCESSED_DIR="$DOWNLOADS/SBT_Processed_Today"
OUTFILE="$PROCESSED_DIR/SBT_Merged_${TAG}$TODAY.txt"
LOGFILE="$PROCESSED_DIR/SBT_Merge_Log_${TAG}$TODAY.txt"

# ── 16 Nov 2026: everything for today now lives in SBT_Processed_Today
#    (merged txt + log + copies of the CSVs). The folder is reset only
#    when the date changes, so a second run on the same day adds to it.
#    Yesterday's contents (and any old merged/log files left loose in
#    Downloads by earlier versions) are moved into SBT_Archive/<their date>/.
mkdir -p "$PROCESSED_DIR"
stamp="$PROCESSED_DIR/.date"
if [[ "$(cat "$stamp" 2>/dev/null)" != "$TODAY" ]]; then
    prev=$(cat "$stamp" 2>/dev/null); [[ -z "$prev" ]] && prev="undated"
    for f in "$PROCESSED_DIR"/*(N); do
        mkdir -p "$DOWNLOADS/SBT_Archive/$prev/processed"
        mv "$f" "$DOWNLOADS/SBT_Archive/$prev/processed/" 2>/dev/null
    done
    echo "$TODAY" > "$stamp"
fi
for f in "$DOWNLOADS"/(SID|LORP)_Merged_*.txt(N); do
    d=$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
    [[ "$d" == "$TODAY" ]] && continue
    mkdir -p "$DOWNLOADS/SBT_Archive/$d"; mv "$f" "$DOWNLOADS/SBT_Archive/$d/" 2>/dev/null
done
for f in "$DOWNLOADS"/SBT_Merged_*.txt(N) "$DOWNLOADS"/SBT_Merge_Log_*.txt(N); do
    d=$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
    [[ "$d" == "$TODAY" ]] && { mv "$f" "$PROCESSED_DIR/" 2>/dev/null; continue; }
    mkdir -p "$DOWNLOADS/SBT_Archive/$d"; mv "$f" "$DOWNLOADS/SBT_Archive/$d/" 2>/dev/null
done

exec > "$LOGFILE" 2>&1
echo "Nightly Merge ($MODE) — $(date)"
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
        bn=${(L)$(basename "$f")}
        [[ "$MODE" != ALL && "$bn" == tvremix* ]] && continue
        [[ "$MODE" == SID  && "$bn" == (ts|sbt|tvx)_lorp_* ]] && continue
        [[ "$MODE" == LORP && "$bn" == (ts|sbt|tvx)_sid_* ]] && continue
        header=$(head -1 "$f" | tr -d '\r\357\273\277')
        if echo "$header" | grep -Eqi '(^|,)[[:space:]]*"?(tradingview_)?symbol"?[[:space:]]*(,|$)'; then
            candidates+=("$f")
        fi
    done
done

if [[ ${#candidates[@]} -eq 0 ]]; then
    echo "No SBT scan CSVs found in Downloads/SBT_Latest or Downloads. Nothing to do."
    osascript -e 'display notification "No CSVs found." with title "Nightly Merge"' 2>/dev/null
    exit 0
fi

echo "Found ${#candidates[@]} candidate file(s):"
for f in "${candidates[@]}"; do echo "  - $f"; done
echo ""

# ── Filter + merge (Python — proven logic, handles quoted CSVs
#    correctly, matches the manual merge run 28 Aug 2026) ──
python3 - "$MODE" "$TODAY" "$DOWNLOADS" "$OUTFILE" "${candidates[@]}" << 'PYEOF'
import csv, re, sys, os, json, urllib.request

mode, today, downloads, legacy_out = sys.argv[1:5]
files = sys.argv[5:]
QUAL = re.compile(r'^[A-Z]+:[A-Z0-9.\-]+$')
BARE = re.compile(r'^[A-Z][A-Z0-9.\-]{0,9}$')
NAMED = re.compile(r'^(TS|SBT|TVX)_(SID|LORP)(?:_(LONG|SHORT))?_', re.I)
outs = {"SID": os.path.join(downloads, f"SID_Merged_{today}.txt"),
        "LORP": os.path.join(downloads, f"LORP_Merged_{today}.txt"),
        "LEGACY": legacy_out}

def target(fp):
    """(output key, source label) for a file, from its name; unnamed files keep the old routing."""
    m = NAMED.match(os.path.basename(fp))
    if m:
        src = m.group(1).upper() + " " + m.group(2).upper() + (" " + m.group(3).upper() if m.group(3) else "")
        return m.group(2).upper(), src
    return (mode if mode in ("SID", "LORP") else "LEGACY"), "unlabelled"

# --- read every file ---------------------------------------------------------------
per_file, raw = [], {}            # raw[out_key] = list of (symbol, source)
for fp in files:
    key, src = target(fp)
    try:
        with open(fp, newline='', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            cols = {(c or '').strip().strip('"').lower(): c for c in (reader.fieldnames or [])}
            col = cols.get('tradingview_symbol') or cols.get('symbol')
            if not col:
                per_file.append((fp, src, key, 'SKIPPED - no symbol column', 0)); continue
            n = 0
            for row in reader:
                v = (row.get(col) or '').strip().strip('"').upper().replace('/', '.')
                if QUAL.match(v) or BARE.match(v):
                    raw.setdefault(key, []).append((v, src)); n += 1
            per_file.append((fp, src, key, col, n))
    except Exception as e:
        per_file.append((fp, src, key, f'ERROR: {e}', 0))

# --- qualify bare tickers: rules.json map, then TradingView's public US scanner ----
bare = sorted({s for lst in raw.values() for s, _ in lst if not QUAL.match(s)})
qmap = {}
try:
    rules = json.load(open(os.path.expanduser('~/tradingview-mcp-jackson/rules.json')))
    for k, v in (rules.get('watchlist_qualified') or {}).items():
        if k.upper() in bare and QUAL.match(str(v).upper()): qmap[k.upper()] = str(v).upper()
except Exception as e:
    print(f"  (rules.json map not read: {e})")
need = [s for s in bare if s not in qmap]
pref = ["NYSE", "NASDAQ", "AMEX", "NYSE ARCA", "CBOE", "OTC"]
for i in range(0, len(need), 400):
    chunk = need[i:i + 400]
    body = json.dumps({"filter": [{"left": "name", "operation": "in_range", "right": chunk}],
                       "columns": ["name", "exchange", "is_primary"], "range": [0, 2000]}).encode()
    try:
        req = urllib.request.Request("https://scanner.tradingview.com/america/scan", data=body,
                                     headers={"Content-Type": "application/json"})
        data = json.load(urllib.request.urlopen(req, timeout=30)).get("data", [])
        best = {}
        for r in data:
            name, exch, prim = r["d"][0].upper(), r["d"][1], bool(r["d"][2])
            rank = (0 if prim else 1, pref.index(exch) if exch in pref else 9)
            if name not in best or rank < best[name][0]: best[name] = (rank, r["s"].upper())
        for name, (_, s) in best.items(): qmap.setdefault(name, s)
    except Exception as e:
        print(f"  (TradingView scanner lookup failed: {e})")
unresolved = sorted(s for s in bare if s not in qmap)

# --- write each output (cumulative within the day) ----------------------------------
result = {}
for key, lst in raw.items():
    out = outs[key]
    carried = []
    if os.path.exists(out):
        carried = [l.strip() for l in open(out) if QUAL.match(l.strip())]
    syms = {}
    for s, src in lst:
        q = s if QUAL.match(s) else qmap.get(s)
        if q: syms.setdefault(q, set()).add(src.split()[0])
    unique = sorted(set(carried) | set(syms))
    with open(out, 'w') as f: f.write('\n'.join(unique) + ('\n' if unique else ''))
    result[key] = (out, len(lst), len(carried), len(unique), syms)

# --- log ---------------------------------------------------------------------------
for fp, src, key, col, n in per_file:
    print(f"  [{src}] -> {key}: {os.path.basename(fp)}: {n} tickers (col={col})")
print("")
for key, (out, nraw, ncar, nuni, syms) in result.items():
    print(f"{key}: {nraw} raw" + (f" + {ncar} already in today's file" if ncar else "") + f" -> {nuni} unique -> {out}")
    if key == "SID":
        srcs = sorted({x for v in syms.values() for x in v} - {"unlabelled"})
        if srcs:
            from collections import Counter
            combo = Counter(" + ".join(sorted(v - {"unlabelled"})) or "unlabelled" for v in syms.values())
            print("   SID sources: " + ", ".join(f"{k} {n}" for k, n in sorted(combo.items(), key=lambda kv: -kv[1])))
if bare:
    print(f"\nBare tickers qualified: {len(bare) - len(unresolved)} of {len(bare)}")
if unresolved:
    print(f"NOT RESOLVED (left out): {', '.join(unresolved)}")
with open(os.path.join(os.path.dirname(legacy_out), ".last_summary"), "w") as f:
    f.write(", ".join(f"{k} {v[3]}" for k, v in result.items()) + (f", {len(unresolved)} unresolved" if unresolved else ""))
PYEOF

# ── Refresh SBT_Processed_Today/ (always today's files only, easy to
#    find without digging through dated archive subfolders) ──
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
summary=$(cat "$PROCESSED_DIR/.last_summary" 2>/dev/null)
osascript -e "display notification \"${summary:-done}\" with title \"Nightly Merge $MODE — Done\"" 2>/dev/null
