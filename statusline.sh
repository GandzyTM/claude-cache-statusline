#!/bin/bash
# Claude Code status line: directory, git branch, model/effort, context bar, 5h/7d limits.

input=$(cat)

pct() { echo "$1" | cut -d. -f1; }

c() { printf '\033[%sm' "$1"; }   # color code -> actual ESC byte
RESET=$(c 0)

# --- directory ---
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // "?"')
DIR_NAME="${cwd##*/}"
[ -z "$DIR_NAME" ] && DIR_NAME="?"
DIR_C=$(c '38;5;117')

# --- git branch (no repo locks) ---
GIT_STR=""
if git -C "$cwd" --no-optional-locks rev-parse --git-dir > /dev/null 2>&1; then
    branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null \
        || git -C "$cwd" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
    status_mark=""
    [ -n "$(git -C "$cwd" --no-optional-locks status --porcelain 2>/dev/null)" ] && status_mark="$(c '38;5;226')✗${RESET}"
    GIT_STR=" $(c '38;5;240')git:($(c '38;5;204')${branch}$(c '38;5;240'))${RESET}${status_mark}"
fi

# --- model + effort ---
MODEL=$(echo "$input" | jq -r '.model.display_name // .model.id // "?"')
EFFORT=$(echo "$input" | jq -r '.effort.level // empty')
if [ -n "$EFFORT" ]; then
  MODEL_EFFORT="${MODEL} · ${EFFORT}"
else
  MODEL_EFFORT="$MODEL"
fi
MODEL_C=$(c '38;5;183')

# --- context: bar + % ---
CTX_PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
CTX_INT=$(pct "$CTX_PCT")

BAR_WIDTH=12
FILLED=$(( CTX_INT * BAR_WIDTH / 100 ))
[ "$FILLED" -gt "$BAR_WIDTH" ] && FILLED=$BAR_WIDTH
EMPTY=$(( BAR_WIDTH - FILLED ))

# Manual /compact early on doesn't save anything: auto-compact already fires
# near the limit, and an early /compact just resets the prompt cache. So the
# alert colors are pushed toward the auto-compact threshold, not toward some
# arbitrary "compact zone".
# 0-50% near-white (relax), 50-75% cyan (cache still paying off),
# 75-90% yellow (fine to wrap up the task, but no need to force a compact),
# 90-95% orange (auto-compact coming soon), 95%+ red (right at the edge)
if   [ "$CTX_INT" -ge 95 ]; then
  FILL_COLOR=$(c '38;5;196')
elif [ "$CTX_INT" -ge 90 ]; then
  FILL_COLOR=$(c '38;5;208')
elif [ "$CTX_INT" -ge 75 ]; then
  FILL_COLOR=$(c '38;5;226')
elif [ "$CTX_INT" -ge 50 ]; then
  FILL_COLOR=$(c '38;5;51')
else
  FILL_COLOR=$(c '38;5;255')
fi

BAR=""
for ((i = 0; i < FILLED; i++)); do BAR="${BAR}█"; done
for ((i = 0; i < EMPTY; i++)); do BAR="${BAR}░"; done
CONTEXT_BAR="${FILL_COLOR}${BAR}${RESET} ${CTX_INT}%"

# --- prompt cache freshness ---
# Cache TTL is a sliding ~1h window from the last request, not from session
# start. There's no "last API request" timestamp in the input, and the
# transcript's mtime alone isn't reliable (it can get touched by things other
# than a genuine new turn, so idle time never appears to grow). Instead, track
# transcript *size* ourselves in a small per-session state file: "last
# activity" only advances when the transcript actually grew since the last
# statusline call, which is the real proxy for a new request happening.
# If the optional cache-indicator mod is installed, it records the exact time
# of the last cache-touching request from turn events, and that wins.
TRANSCRIPT=$(echo "$input" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$input" | jq -r '.session_id // "unknown"')
CACHE_STR=""
STATE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/statusline-cache"
EVENT_FILE="${STATE_DIR}/${SESSION_ID}.last"
NOW=$(date +%s)
LAST_ACTIVITY=""

# Preferred source: the cache-indicator mod writes the exact epoch second of
# the last request that read/wrote the prompt cache (turn events).
if [ -f "$EVENT_FILE" ]; then
  read -r EVENT_TS < "$EVENT_FILE"
  case "$EVENT_TS" in ''|*[!0-9]*) ;; *) LAST_ACTIVITY=$EVENT_TS ;; esac
fi

# Fallback without the mod: guess from the transcript size.
if [ -z "$LAST_ACTIVITY" ] && [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  mkdir -p "$STATE_DIR"
  STATE_FILE="${STATE_DIR}/${SESSION_ID}.state"

  CUR_SIZE=$(stat -f %z "$TRANSCRIPT" 2>/dev/null || stat -c %s "$TRANSCRIPT" 2>/dev/null)

  LAST_SIZE=""
  if [ -f "$STATE_FILE" ]; then
    read -r LAST_SIZE LAST_ACTIVITY < "$STATE_FILE"
  fi

  if [ -z "$LAST_ACTIVITY" ] || [ "$CUR_SIZE" != "$LAST_SIZE" ]; then
    LAST_ACTIVITY=$NOW
    echo "${CUR_SIZE} ${LAST_ACTIVITY}" > "$STATE_FILE"
  fi
fi

if [ -n "$LAST_ACTIVITY" ]; then
  IDLE=$(( NOW - LAST_ACTIVITY ))
  if [ "$IDLE" -lt 3600 ]; then
    LEFT_MIN=$(( (3600 - IDLE) / 60 ))
    if [ "$LEFT_MIN" -le 10 ]; then
      # about to expire on its own: no rush, no need to force a compact either
      CACHE_STR="$(c '38;5;226')cache warm ~${LEFT_MIN}m${RESET}"
    else
      CACHE_STR="$(c '38;5;114')cache warm ~${LEFT_MIN}m${RESET}"
    fi
  else
    IDLE_H=$(( IDLE / 3600 ))
    CACHE_STR="$(c '38;5;244')cache cold (${IDLE_H}h)${RESET}"
  fi
fi

# --- 5h / 7d limits ---
format_reset() {
  local epoch=$1
  if [ -z "$epoch" ] || [ "$epoch" = "null" ]; then
    echo "?"
    return
  fi
  local now=$(date +%s)
  local diff=$(( epoch - now ))
  if [ $diff -le 0 ]; then
    echo "now"
  elif [ $diff -lt 3600 ]; then
    echo "$((diff/60))m"
  elif [ $diff -lt 86400 ]; then
    echo "$((diff/3600))h$((diff%3600/60))m"
  else
    echo "$((diff/86400))d$((diff%86400/3600))h"
  fi
}

FIVE_PCT=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
FIVE_RESET=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
SEVEN_PCT=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
SEVEN_RESET=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

LIMITS=""
if [ -n "$FIVE_PCT" ]; then
  FIVE_INT=$(pct "$FIVE_PCT")
  FIVE_TIME=$(format_reset "$FIVE_RESET")
  LIMITS="5h ${FIVE_INT}% (${FIVE_TIME})"
fi
if [ -n "$SEVEN_PCT" ]; then
  SEVEN_INT=$(pct "$SEVEN_PCT")
  SEVEN_TIME=$(format_reset "$SEVEN_RESET")
  [ -n "$LIMITS" ] && LIMITS="$LIMITS  ·  "
  LIMITS="${LIMITS}7d ${SEVEN_INT}% (${SEVEN_TIME})"
fi

# --- output ---
SEP="$(c '38;5;240')│${RESET}"

OUT="${DIR_C}${DIR_NAME}${RESET}${GIT_STR} ${SEP} ${MODEL_C}${MODEL_EFFORT}${RESET} ${SEP} ${CONTEXT_BAR}"
if [ -n "$CACHE_STR" ]; then
  OUT="${OUT} ${SEP} ${CACHE_STR}"
fi
if [ -n "$LIMITS" ]; then
  OUT="${OUT} ${SEP} $(c '38;5;250')${LIMITS}${RESET}"
fi

printf '%s' "$OUT"
