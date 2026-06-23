#!/bin/bash
# Morning Brief — runs via launchd at 7:00 AM Tue–Sat
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
OUTFILE_PULLBACK="$BRIEFS_DIR/brief-$DATE-pullback.json"
OUTFILE_ADX="$BRIEFS_DIR/brief-$DATE-adx.json"
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

# Global watchdog — hard-stop the whole brief if it ever runs absurdly long.
# Defence-in-depth behind the per-call CDP timeouts in connection.js: guarantees a
# wedged scan can never hold the lock for hours and silently skip the next run.
MAX_TOTAL_SECS=14400  # 240 minutes — backstop only; per-call CDP timeouts catch real hangs.
                      # Sized for the current ~406-symbol universe: LORP + SID each scan the
                      # FULL watchlist (~66 min each at ~10s/symbol) + REGIME/PULLBACK/ADX ≈ 160
                      # min total. Raised 150→240 after the 406-symbol run tripped the old budget.
                      # If the universe keeps growing, address scan throughput rather than just
                      # raising this further (see scan_delay_ms / waitForChartReady).
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
#   6Qpm8oT7 = PULLBACK    6hvBVx9e = ADX BREAKOUT

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

# ── SCAN 4: PULLBACK layout ───────────────────────────────────────────────────
echo "[$(date)] Scanning PULLBACK layout (6Qpm8oT7)..." >> "$LOGFILE"
TRADINGVIEW_LAYOUT_ID="6Qpm8oT7" READY_REQUIRE_STUDY="EMA21 Trend Setup" \
  "$NODE" "$TV_DIR/src/cli/index.js" brief --sections "PULLBACK SCREENER,PULLBACK BRIEF" > "$OUTFILE_PULLBACK" 2>> "$LOGFILE"
PULLBACK_EXIT=$?
if [ $PULLBACK_EXIT -eq 0 ] && [ -s "$OUTFILE_PULLBACK" ]; then
    echo "[$(date)] PULLBACK scan complete" >> "$LOGFILE"
else
    echo "[$(date)] PULLBACK scan failed or empty — Pullback signals will be unavailable" >> "$LOGFILE"
fi

# ── SCAN 5: ADX BREAKOUT layout ───────────────────────────────────────────────
echo "[$(date)] Scanning ADX BREAKOUT layout (6hvBVx9e)..." >> "$LOGFILE"
TRADINGVIEW_LAYOUT_ID="6hvBVx9e" READY_REQUIRE_STUDY="ADX Breakout" \
  "$NODE" "$TV_DIR/src/cli/index.js" brief --sections "ADX BREAKOUT SCREENER,ADX BREAKOUT BRIEF" > "$OUTFILE_ADX" 2>> "$LOGFILE"
ADX_EXIT=$?
if [ $ADX_EXIT -eq 0 ] && [ -s "$OUTFILE_ADX" ]; then
    echo "[$(date)] ADX BREAKOUT scan complete" >> "$LOGFILE"
else
    echo "[$(date)] ADX BREAKOUT scan failed or empty — ADX Breakout section will be unavailable" >> "$LOGFILE"
fi

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
    "$NODE" "$TV_DIR/scripts/analyse-brief.cjs" "$OUTFILE_LORP" "$OUTFILE_SID" "$OUTFILE_REGIME" "$OUTFILE_PULLBACK" "$OUTFILE_ADX" > "$TABLES_OUT" 2>> "$LOGFILE"
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
        PB_COUNT=$(grep -o "PULLBACK SCREENER  —  [0-9]* tickers" "$TABLES_OUT" | grep -o "[0-9]*" | head -1 || echo "0")
        NOTIFY_MSG="LORP ${LORP_COUNT} · SID ${SID_COUNT} · PB ${PB_COUNT}"

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
