#!/bin/bash
# Morning Brief — runs via launchd at 7:00 AM Tue–Sat (waits until 16:25 New York if the US close has not settled — see US-close guard)
# Launches TradingView if not running, then runs the full watchlist scan.

# Load Gmail credentials if present
[ -f "$HOME/.morning-brief.env" ] && set -a && source "$HOME/.morning-brief.env" && set +a

TV_DIR="/Users/davidmackinnon/tradingview-mcp-jackson"
BRIEFS_DIR="$HOME/.tradingview-mcp/briefs"
NODE="/usr/local/bin/node"
DATE=$(date +%Y-%m-%d)
OUTFILE_LORP="$BRIEFS_DIR/brief-$DATE-lorp.json"
OUTFILE_SID="$BRIEFS_DIR/brief-$DATE-sid.json"
OUTFILE_REGIME="$BRIEFS_DIR/brief-$DATE-regime.json"
OUTFILE="$BRIEFS_DIR/brief-$DATE.json"
LOGFILE="$BRIEFS_DIR/brief-$DATE.log"
TABLES_OUT="$BRIEFS_DIR/brief-$DATE-tables.md"

mkdir -p "$BRIEFS_DIR"

# ── Lock file — prevent double runs ──────────────────────────────
LOCKFILE="/tmp/morning-brief.lock"
if [ -f "$LOCKFILE" ]; then
    LOCK_PID=$(cat "$LOCKFILE")
    if kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "[$(date)] Another brief is already running (PID $LOCK_PID) — aborting." >> "$LOGFILE"
        osascript -e "display notification \"Brief already running (PID $LOCK_PID) — skipped\" with title \"Morning Brief\" sound name \"Basso\"" 2>/dev/null || true
        exit 0
    else
        echo "[$(date)] Stale lock file found (PID $LOCK_PID) — removing and continuing." >> "$LOGFILE"
        rm -f "$LOCKFILE"
    fi
fi
echo $$ > "$LOCKFILE"

# ── US-close guard (DST-proof) ───────────────────────────────────
# launchd fires at 7:00 AM Brisbane. During US daylight saving that is 17:00 New York
# (1 hr after the close); during US standard time (Nov–Mar) it is exactly 16:00, the close.
# If we are between 15:00 and 16:25 New York time, wait until 16:25 so the final daily
# bar is settled. Runs at any other time (manual runs etc.) are not delayed.
NY_NOW=$(( 10#$(TZ=America/New_York date +%H) * 60 + 10#$(TZ=America/New_York date +%M) ))
NY_READY=$(( 16 * 60 + 25 ))
if [ "$NY_NOW" -ge $(( 15 * 60 )) ] && [ "$NY_NOW" -lt "$NY_READY" ]; then
    WAIT_SECS=$(( (NY_READY - NY_NOW) * 60 ))
    echo "[$(date)] US close guard: New York time is $(TZ=America/New_York date +%H:%M) — waiting $((WAIT_SECS/60)) min for the final daily bar." >> "$LOGFILE"
    sleep "$WAIT_SECS"
fi

# Global watchdog — hard-stop the whole brief if it ever runs absurdly long.
# Defence-in-depth behind the per-call CDP timeouts in connection.js: guarantees a
# wedged scan can never hold the lock for hours and silently skip the next run.
MAX_TOTAL_SECS=14400  # 240 minutes — backstop only; per-call CDP timeouts catch real hangs.
                      # Sized for the current ~739-symbol universe: LORP + SID each scan the
                      # FULL watchlist. PULLBACK/ADX scans retired 26 Aug 2026 (see below) —
                      # this ceiling is now generous headroom, not a tight budget; revisit if
                      # the universe keeps growing and scan throughput becomes the bottleneck.
( sleep $MAX_TOTAL_SECS
  echo "[$(date)] GLOBAL WATCHDOG: brief exceeded ${MAX_TOTAL_SECS}s — killing pipeline" >> "$LOGFILE"
  osascript -e 'display notification "Brief exceeded time budget — killed" with title "Morning Brief Failed" sound name "Basso"' 2>/dev/null || true
  kill -KILL -$$ 2>/dev/null
) &
WATCHDOG_PID=$!
trap 'rm -f "$LOCKFILE"; kill "$WATCHDOG_PID" 2>/dev/null' EXIT INT TERM

echo "[$(date)] Starting morning brief" >> "$LOGFILE"

# Check if CDP is already available on port 9222 — if so, skip kill/relaunch entirely
# This preserves chart layouts when TradingView is already running in debug mode
if curl -s --max-time 3 "http://localhost:9222/json/version" > /dev/null 2>&1; then
    echo "[$(date)] TradingView already running with CDP — waiting 30s for charts to stabilise..." >> "$LOGFILE"
    sleep 30
else
    echo "[$(date)] TradingView not running with CDP — killing any stray instance then launching..." >> "$LOGFILE"
    # Kill any existing TV process (e.g. running without CDP after a manual open).
    # Must wait for it to fully exit before relaunching — hitting a dying TV with a
    # second launch triggers Electron's second-instance handler, causing white screen.
    killall TradingView 2>/dev/null || true
    sleep 5
    "$NODE" "$TV_DIR/src/cli/index.js" launch >> "$LOGFILE" 2>&1

    # Poll until TradingView API is fully ready (chart loaded, not just CDP port open)
    # Uses wall-clock time so slow status calls don't eat into the budget.
    # MAX_WAIT_SECS = total wall-clock seconds before giving up.
    echo "[$(date)] Waiting for TradingView to fully load..." >> "$LOGFILE"
    MAX_WAIT_SECS=180
    POLL_START=$(date +%s)
    TV_READY=false
    until "$NODE" "$TV_DIR/src/cli/index.js" status > /dev/null 2>&1; do
        ELAPSED=$(( $(date +%s) - POLL_START ))
        if [ $ELAPSED -ge $MAX_WAIT_SECS ]; then
            echo "[$(date)] WARNING: TradingView API not ready after ${MAX_WAIT_SECS}s wall-clock — killing TV and aborting brief" >> "$LOGFILE"
            killall -9 TradingView 2>/dev/null || true
            osascript -e "display notification \"TradingView did not start in time — brief skipped\" with title \"Morning Brief\" sound name \"Basso\"" 2>/dev/null || true
            exit 1
        fi
        sleep 5
    done
    ELAPSED=$(( $(date +%s) - POLL_START ))
    echo "[$(date)] TradingView ready after ${ELAPSED}s" >> "$LOGFILE"
    TV_READY=true
    # Extra buffer for cloud layout sync after API is ready
    sleep 90
fi

# Sync watchlist from TradingView sections before scanning
echo "[$(date)] Syncing watchlist from TradingView..." >> "$LOGFILE"
"$NODE" "$TV_DIR/scripts/sync-watchlist.cjs" >> "$LOGFILE" 2>&1
if [ $? -ne 0 ]; then
    echo "[$(date)] Watchlist sync failed — using existing rules.json watchlist" >> "$LOGFILE"
fi

# Each TradingView layout runs as a separate page in the Electron app.
# TRADINGVIEW_LAYOUT_ID pins each scan to an exact saved-chart layout by its URL slug
# (/chart/<ID>/). This is immune to indicator renames or the same indicator appearing
# on multiple layouts — far more reliable than matching by indicator name.
# Known layout IDs:
#   OWHfyWBq = LORP        XN1LuowU = SID         78yhKuUS = REGIME USA
# (PULLBACK 6Qpm8oT7 and ADX BREAKOUT 6hvBVx9e scans retired 26 Aug 2026 — David:
#  "delete all references to the old Pullback & ADX Continuation")

# ── PRE-WARM: the first real scan (LORP) always eats the cold-start (browser + heavy
# layout still rendering). Warm it with a tiny throwaway scan (9 symbols) so the full
# LORP/SID scans hit an already-responsive chart. Failure here is ignored.
echo "[$(date)] Pre-warming browser on LORP layout (tiny scan)..." >> "$LOGFILE"
TRADINGVIEW_LAYOUT_ID="OWHfyWBq" READY_REQUIRE_STUDY="Lorentzian" \
  "$NODE" "$TV_DIR/src/cli/index.js" brief --sections "PRE MARKET CHECKLIST,PREMARKET CHECKLIST" > /dev/null 2>> "$LOGFILE" || true
echo "[$(date)] Pre-warm complete — starting full scans" >> "$LOGFILE"

# ── SCAN 1: LORP layout ───────────────────────────────────────────────────────
# Scans the ENTIRE watchlist (no --sections) — the flat rules.json watchlist is the
# deduped union of every section the sync ingested, so a fired LC entry is captured
# wherever it sits, exactly like the alerts. The brief anchors on the fired entry and
# tags section-of-origin in the Also column; it does NOT gate on section membership.
echo "[$(date)] Scanning LORP layout (OWHfyWBq) — full watchlist..." >> "$LOGFILE"
# READY_REQUIRE_STUDY: wait for the ML Lorentzian indicator to actually populate before
# reading (it recalculates 2–7s after price loads — the slowest study on the layout).
# Without this the adaptive readiness check returns before LC data is present and every
# ticker is wrongly excluded as "No LC data".
TRADINGVIEW_LAYOUT_ID="OWHfyWBq" READY_REQUIRE_STUDY="Lorentzian" \
  "$NODE" "$TV_DIR/src/cli/index.js" brief > "$OUTFILE_LORP" 2>> "$LOGFILE"
BRIEF_EXIT=$?
if [ $BRIEF_EXIT -eq 0 ] && [ -s "$OUTFILE_LORP" ]; then
    echo "[$(date)] LORP scan complete" >> "$LOGFILE"
else
    echo "[$(date)] LORP scan failed or empty" >> "$LOGFILE"
fi

# ── SCAN 2: SID layout ────────────────────────────────────────────────────────
# Strategy-agnostic: scan the ENTIRE watchlist (no --sections) so SID signals are
# captured regardless of which section a ticker sits in. The brief filters by indicator
# data, not by section membership.
# NOTE: the SID scan can hang indefinitely on some symbols — the root cause is
# a per-symbol hang in the CDP scan (needs per-symbol timeout in the scan code).
echo "[$(date)] Scanning SID layout (XN1LuowU) — full watchlist..." >> "$LOGFILE"
TRADINGVIEW_LAYOUT_ID="XN1LuowU" READY_REQUIRE_STUDY="SID Trading Signals" \
  "$NODE" "$TV_DIR/src/cli/index.js" brief > "$OUTFILE_SID" 2>> "$LOGFILE"
SID_SCAN_EXIT=$?
# 24 Sep 2026: if the SID indicator wasn't computing (scan aborts with REQUIRED STUDY
# MISSING after 8 symbols), reload the SID tab once and retry the scan.
if [ $SID_SCAN_EXIT -ne 0 ] && tail -5 "$LOGFILE" | grep -q "REQUIRED STUDY MISSING"; then
    echo "[$(date)] SID indicator not computing — reloading SID tab and retrying once" >> "$LOGFILE"
    TRADINGVIEW_LAYOUT_ID="XN1LuowU" "$NODE" "$TV_DIR/src/cli/index.js" ui eval --code 'location.reload(); 1' >/dev/null 2>> "$LOGFILE" || true
    sleep 90
    TRADINGVIEW_LAYOUT_ID="XN1LuowU" READY_REQUIRE_STUDY="SID Trading Signals" \
      "$NODE" "$TV_DIR/src/cli/index.js" brief > "$OUTFILE_SID" 2>> "$LOGFILE"
    SID_SCAN_EXIT=$?
fi
if [ $SID_SCAN_EXIT -eq 0 ] && [ -s "$OUTFILE_SID" ]; then
    echo "[$(date)] SID scan complete" >> "$LOGFILE"
else
    echo "[$(date)] SID scan failed or empty" >> "$LOGFILE"
fi

# ── SCAN 3: REGIME USA layout (SPY EMA21 regime gate) ────────────────────────
echo "[$(date)] Scanning REGIME USA layout (78yhKuUS)..." >> "$LOGFILE"
TRADINGVIEW_LAYOUT_ID="78yhKuUS" \
  "$NODE" "$TV_DIR/src/cli/index.js" brief --sections "PRE MARKET CHECKLIST,PREMARKET CHECKLIST" > "$OUTFILE_REGIME" 2>> "$LOGFILE"
REGIME_EXIT=$?
if [ $REGIME_EXIT -eq 0 ] && [ -s "$OUTFILE_REGIME" ]; then
    echo "[$(date)] REGIME scan complete" >> "$LOGFILE"
else
    echo "[$(date)] REGIME scan failed or empty — Pullback regime gate will be unavailable" >> "$LOGFILE"
fi

# ── SCAN 4: SECTOR ETF ROTATION (vs SPY) ──────────────────────────────────────
# David (13 Sep 2026): tag each SID/LORP ticker Supported/Neutral/Unsupported by
# comparing its SPDR sector ETF's % move to SPY's over the same lookback window,
# direction-aware against the ticker's Long/Short signal (analyse-brief.cjs does the
# comparison — this step only gathers the raw numbers). Mechanism (tv symbol + tv
# ohlcv -s) manually validated on 13 Sep 2026: XLK -0.51% vs SPY -0.62% over 4 bars.
# Best-effort: any failure here just leaves sector tags showing 'n/a' in the brief —
# never blocks or fails the rest of the pipeline.
OUTFILE_SECTORS="$BRIEFS_DIR/brief-$DATE-sectors.json"
SECTOR_LOOKBACK_BARS=4
SECTOR_TICKERS="SPY XLC XLE XLK XLF XLV XLY XLP XLI XLB XLU XLRE"
echo "[$(date)] Scanning sector ETF rotation vs SPY..." >> "$LOGFILE"
SECTOR_TMP_DIR=$(mktemp -d)
for TICKER in $SECTOR_TICKERS; do
    "$NODE" "$TV_DIR/src/cli/index.js" symbol "AMEX:$TICKER" > /dev/null 2>> "$LOGFILE"
    sleep 2
    "$NODE" "$TV_DIR/src/cli/index.js" ohlcv -n "$SECTOR_LOOKBACK_BARS" -s > "$SECTOR_TMP_DIR/$TICKER.json" 2>> "$LOGFILE"
done
python3 - "$SECTOR_TMP_DIR" "$OUTFILE_SECTORS" "$SECTOR_LOOKBACK_BARS" <<'PYEOF2' >> "$LOGFILE" 2>&1
import json, os, sys, datetime
tmp_dir, out_file, lookback = sys.argv[1], sys.argv[2], int(sys.argv[3])
etfs = {}
spy = None
for fname in os.listdir(tmp_dir):
    if not fname.endswith('.json'):
        continue
    ticker = fname[:-5]
    try:
        with open(os.path.join(tmp_dir, fname)) as f:
            data = json.load(f)
        raw = data.get('change_pct')
        pct = float(str(raw).rstrip('%')) if raw is not None else None
    except Exception:
        pct = None
    if pct is None:
        print(f"[sector] {ticker}: no usable change_pct (skipped)")
        continue
    if ticker == 'SPY':
        spy = pct
    else:
        etfs[ticker] = pct
out = {
    'generated_at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'lookback_bars': lookback,
    'spy_change_pct': spy,
    'etfs': etfs,
}
with open(out_file, 'w') as f:
    json.dump(out, f, indent=2)
print(f"[sector] wrote {len(etfs)} ETFs + SPY={spy} to {out_file}")
PYEOF2
rm -rf "$SECTOR_TMP_DIR"
echo "[$(date)] Sector ETF rotation scan complete" >> "$LOGFILE"

# ── PULLBACK and ADX BREAKOUT scans retired 26 Aug 2026 (David: "delete all
# references to the old Pullback & ADX Continuation" — Pullback folded into LORP's
# native Trend/Pullback tables; ADX shown in the LORP table already per #8 Jul 2026).

# Sanity check LORP scan
if [ $BRIEF_EXIT -eq 0 ] && [ -s "$OUTFILE_LORP" ]; then
    SCANNED=$(python3 -c "import json; d=json.load(open('$OUTFILE_LORP')); print(sum(1 for s in d.get('symbols_scanned',[]) if 'error' not in s))" 2>/dev/null || echo "1")
    if [ "$SCANNED" = "0" ]; then
        echo "[$(date)] LORP scan produced 0 symbols — CDP not available. Aborting." >> "$LOGFILE"
        osascript -e "display notification \"CDP not available — brief aborted\" with title \"Morning Brief Failed\" sound name \"Basso\"" 2>/dev/null || true
        exit 1
    fi
fi

if [ $BRIEF_EXIT -eq 0 ] && [ -s "$OUTFILE_LORP" ]; then
    echo "[$(date)] Brief complete" >> "$LOGFILE"

    # Auto-analyse: pass both JSON files to produce combined tables
    CSV_OUT="$BRIEFS_DIR/brief-$DATE-data.csv"
    echo "[$(date)] Generating tables..." >> "$LOGFILE"
    "$NODE" "$TV_DIR/scripts/analyse-brief.cjs" "$OUTFILE_LORP" "$OUTFILE_SID" "$OUTFILE_REGIME" "" "" "$OUTFILE_SECTORS" > "$TABLES_OUT" 2>> "$LOGFILE"
    # ── LORP open-trade monitor removed 27 Aug 2026 (David) — open_trades.csv was a
    # manually-maintained file nobody was updating (AJG entry dated 6/7/2026, ~3 months
    # stale; YUM/AMGN dated 10/7/2026, a future date). David monitors positions directly
    # in TV and via SBT instead, so this was reporting on trades he wasn't actually in.
    # Copy CSV and tables to Downloads/Briefs for easy access
    mkdir -p "$HOME/Downloads/Briefs"
    [ -f "$CSV_OUT" ]    && cp "$CSV_OUT"    "$HOME/Downloads/Briefs/brief-$DATE-data.csv" 2>/dev/null || true
    [ -f "$TABLES_OUT" ] && cp "$TABLES_OUT" "$HOME/Downloads/Briefs/brief-$DATE.md"      2>/dev/null || true

    if [ $? -eq 0 ]; then
        echo "[$(date)] Tables saved to $TABLES_OUT" >> "$LOGFILE"

        # No SID scanner — removed. Use TV Screener for SID candidates.
        SID_OUT=""
        SID_OB=0
        SID_OS=0

        # Extract key counts for the notification
        LORP_COUNT=$(grep -o "LORP — [0-9]* candidates" "$TABLES_OUT" | grep -o "[0-9]*" | head -1 || echo "?")
        SID_COUNT=$(grep -o "SID — [0-9]* signals" "$TABLES_OUT" | grep -o "[0-9]*" | head -1 || echo "0")
        NOTIFY_MSG="LORP ${LORP_COUNT} · SID ${SID_COUNT}"

        # Send macOS notification — appears in Notification Centre, no approval needed
        osascript -e "display notification \"${NOTIFY_MSG}\" with title \"Morning Brief Ready\" subtitle \"$(date '+%a %d %b %Y')\" sound name \"Glass\"" 2>/dev/null || true

        # Also open the tables file in the default text viewer
        open "$TABLES_OUT" 2>/dev/null || true

        echo "[$(date)] Notification sent: $NOTIFY_MSG" >> "$LOGFILE"

        # Push BRIEF section updates to TradingView watchlist
        WATCHLIST_UPDATES="$BRIEFS_DIR/brief-$DATE-watchlist-updates.json"
        if [ -f "$WATCHLIST_UPDATES" ]; then
            echo "[$(date)] Pushing watchlist updates to TradingView..." >> "$LOGFILE"
            "$NODE" "$TV_DIR/scripts/push-watchlist.cjs" "$WATCHLIST_UPDATES" >> "$LOGFILE" 2>&1
            if [ $? -eq 0 ]; then
                echo "[$(date)] Watchlist updated successfully" >> "$LOGFILE"
            else
                echo "[$(date)] Watchlist update failed — check log above" >> "$LOGFILE"
            fi
        else
            echo "[$(date)] Watchlist updates sidecar not found — skipping watchlist push" >> "$LOGFILE"
        fi

        # Email the tables file via Gmail
        if [ -n "$GMAIL_USER" ] && [ -n "$GMAIL_APP_PASSWORD" ] && [ -n "$EMAIL_TO" ]; then
            echo "[$(date)] Sending email to $EMAIL_TO..." >> "$LOGFILE"
            export SID_OUTPUT="$SID_OUT"
            export CSV_OUT="$BRIEFS_DIR/brief-$DATE-lorp-brief-import.txt"
            python3 - <<PYEOF >> "$LOGFILE" 2>&1
import smtplib, ssl, os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

gmail_user     = os.environ["GMAIL_USER"]
gmail_password = os.environ["GMAIL_APP_PASSWORD"]
email_to       = os.environ["EMAIL_TO"]
tables_path    = "$TABLES_OUT"
csv_path       = os.environ.get("CSV_OUT", "")
notify_msg     = "$NOTIFY_MSG"
date_str       = "$DATE"

with open(tables_path, "r") as f:
    tables_body = f.read()

combined_body = tables_body

msg = MIMEMultipart()
msg["From"]    = gmail_user
msg["To"]      = email_to
msg["Subject"] = f"Morning Brief {date_str} — {notify_msg}"

msg.attach(MIMEText(combined_body, "plain"))

# Attach brief as text/plain — keeps .md extension but text/plain MIME avoids AV quarantine
part_md = MIMEText(combined_body, "plain", "utf-8")
part_md.add_header("Content-Disposition", f'attachment; filename="brief-{date_str}.md"')
msg.attach(part_md)

# Attach txt import file if it exists
if csv_path and os.path.exists(csv_path):
    with open(csv_path, "r") as f:
        txt_data = f.read()
    part_txt = MIMEText(txt_data, "plain", "utf-8")
    part_txt.add_header("Content-Disposition", f'attachment; filename="brief-import-{date_str}.txt"')
    msg.attach(part_txt)
    print(f"[ok] TXT attached: brief-import-{date_str}.txt")
else:
    print(f"[warn] TXT import file not found at {csv_path} — skipping attachment")

ctx = ssl.create_default_context()
with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as server:
    server.login(gmail_user, gmail_password)
    server.sendmail(gmail_user, email_to, msg.as_string())

print(f"[ok] Email sent to {email_to}")
PYEOF
            if [ $? -eq 0 ]; then
                echo "[$(date)] Email sent successfully" >> "$LOGFILE"
            else
                echo "[$(date)] Email send failed — check log above" >> "$LOGFILE"
            fi
        else
            echo "[$(date)] Skipping email — GMAIL_USER/GMAIL_APP_PASSWORD/EMAIL_TO not set in ~/.morning-brief.env" >> "$LOGFILE"
        fi
    else
        echo "[$(date)] Tables generation failed — check log above" >> "$LOGFILE"
        osascript -e "display notification \"Brief complete but analysis failed — check $LOGFILE\" with title \"Morning Brief\" sound name \"Basso\"" 2>/dev/null || true
    fi
else
    echo "[$(date)] Brief failed — check log above" >> "$LOGFILE"
    osascript -e "display notification \"Brief scan failed — check $LOGFILE\" with title \"Morning Brief\" sound name \"Basso\"" 2>/dev/null || true
fi
