#!/bin/bash
# Installer for claude-cache-statusline.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/GandzyTM/claude-cache-statusline/main/install.sh | bash
set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/GandzyTM/claude-cache-statusline/main"
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SCRIPT_PATH="${CONFIG_DIR}/statusline.sh"
SETTINGS_PATH="${CONFIG_DIR}/settings.json"
REFRESH_INTERVAL="${REFRESH_INTERVAL:-30}"

info()  { printf '\033[38;5;114m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[38;5;226m!!\033[0m %s\n' "$1"; }
err()   { printf '\033[38;5;196mxx\033[0m %s\n' "$1" >&2; }

command -v jq >/dev/null 2>&1 || { err "jq is required but not found. Install it first (e.g. 'brew install jq' or 'apt install jq')."; exit 1; }
command -v curl >/dev/null 2>&1 || { err "curl is required but not found."; exit 1; }

mkdir -p "$CONFIG_DIR"

info "Installing statusline script to ${SCRIPT_PATH}"
if [ -f "$SCRIPT_PATH" ]; then
  BACKUP="${SCRIPT_PATH}.bak.$(date +%s)"
  cp "$SCRIPT_PATH" "$BACKUP"
  warn "Existing statusline.sh backed up to ${BACKUP}"
fi
curl -fsSL "${REPO_RAW_BASE}/statusline.sh" -o "$SCRIPT_PATH"
chmod +x "$SCRIPT_PATH"

info "Updating ${SETTINGS_PATH}"
if [ -f "$SETTINGS_PATH" ]; then
  BACKUP="${SETTINGS_PATH}.bak.$(date +%s)"
  cp "$SETTINGS_PATH" "$BACKUP"
  warn "Existing settings.json backed up to ${BACKUP}"
else
  echo '{}' > "$SETTINGS_PATH"
fi

TMP_SETTINGS=$(mktemp)
jq \
  --arg cmd "$SCRIPT_PATH" \
  --argjson refresh "$REFRESH_INTERVAL" \
  '.statusLine = {"type": "command", "command": $cmd, "refreshInterval": $refresh}' \
  "$SETTINGS_PATH" > "$TMP_SETTINGS"
mv "$TMP_SETTINGS" "$SETTINGS_PATH"

info "Done. Restart Claude Code (or start a new session) to see the new status line."
info "Colors, thresholds and the cache TTL assumption can be tweaked directly in ${SCRIPT_PATH}."
