# Setup Notes

## Bitdefender whitelist — tools Claude/Cowork invokes on this Mac

Every automated action runs as user `davidmackinnon` through `/bin/zsh`. To cut the
antivirus approval prompts, whitelist the **processes** below (not the folders — see note).

**Highest value (behind almost every prompt):**
- `git` — status / add / commit / push / ls-remote / log / diff (every commit & push)

**Interpreters:**
- `python3` — analysis scripts and data crunching (`/usr/bin/python3` and Homebrew python)
- `node` — brief syntax checks (`node --check`)

**Standard Unix utilities git and the scripts call:**
- `cp mv mkdir rm ls cat head tail grep find sed wc diff tr du cut tee mdfind`

**Paths touched:**
- `~/Indicators/` (iCloud-synced)
- `~/tradingview-mcp-jackson/`
- occasional reads from `~/Downloads/`

### Important: whitelist processes, not folders
Excluding a *folder* in Bitdefender disables real-time scanning for everything in it —
risky for the iCloud-synced Indicators repo, which also holds files pulled from the web.
Excluding the *processes* (git/python3/node) keeps file scanning on. If only folder-level
exclusions are possible, prefer to keep approving prompts over broadly excluding an iCloud folder.

Note: some "Operation not permitted" failures are the iCloud sync layer locking a file
mid-operation, not Bitdefender — those are handled with a quick retry and won't be fully
silenced by the whitelist.
