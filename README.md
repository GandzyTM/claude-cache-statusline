# claude-cache-statusline

A drop-in status line for [Claude Code](https://claude.com/product/claude-code) that adds:

- a **context-usage bar** whose color thresholds are tuned around when auto-compact
  actually fires, instead of nudging you to run `/compact` early (which just resets
  your prompt cache for no benefit)
- a **prompt-cache freshness indicator** (`cache warm ~42m` / `cache cold (2h)`)
  so you can tell at a glance whether the ~1h prompt-cache window is still alive,
  based on real session activity rather than a naive file-mtime check
- git branch + dirty marker, model/effort, and 5h/7d rate-limit usage

![screenshot](https://raw.githubusercontent.com/GandzyTM/claude-cache-statusline/main/screenshot.png)

## Why

Claude Code's prompt cache has a sliding ~1 hour TTL from your *last request*, not
from session start. Running `/compact` manually while that cache is still warm
throws it away for nothing — auto-compact already fires on its own near the
context limit. This status line makes both facts visible instead of guessing:
the context bar's alert colors are pushed toward the auto-compact threshold, and
a separate indicator tells you whether the cache is still warm or has already
gone cold on its own (in which case `/compact` is effectively free).

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/GandzyTM/claude-cache-statusline/main/install.sh | bash
```

This will:
1. Download `statusline.sh` into your Claude config dir (`$CLAUDE_CONFIG_DIR` if
   set, otherwise `~/.claude/`) and make it executable.
2. Merge a `statusLine` entry into `settings.json` in that same directory
   (`type: command`, pointing at the installed script, with `refreshInterval: 30`
   so the cache countdown ticks even while you're idle). Every other setting in
   `settings.json` is left untouched.
3. Back up any existing `statusline.sh` / `settings.json` before overwriting
   (`*.bak.<unix-timestamp>`).

Restart Claude Code (or start a new session) afterwards to see it.

### Requirements

`bash`, `jq`, `curl`. `git` is optional — the branch segment is simply omitted
outside a git repo.

## Manual install

```bash
curl -fsSL https://raw.githubusercontent.com/GandzyTM/claude-cache-statusline/main/statusline.sh \
  -o ~/.claude/statusline.sh
chmod +x ~/.claude/statusline.sh
```

Then add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "refreshInterval": 30
  }
}
```

## Uninstall

Remove the `statusLine` key from `settings.json` (or restore it from a
`.bak.*` backup) and delete `~/.claude/statusline.sh` and
`~/.claude/statusline-cache/`.

## Customizing

Everything lives in one readable `statusline.sh` — no build step. In particular:

- **Context bar thresholds/colors**: edit the `if [ "$CTX_INT" -ge ... ]` chain.
- **Cache TTL assumption**: the script assumes a 1-hour (`3600`s) sliding
  window; change the `3600` constants if your plan's cache TTL differs.
- **Refresh cadence**: `refreshInterval` in `settings.json`, in seconds
  (minimum 1). Lower values tick more smoothly but re-run the script more
  often.

## How the cache indicator works

There's no "time since last API request" field in the status line's JSON
input, and the transcript file's mtime alone isn't a reliable proxy (it can
get touched by things other than a genuine new turn). Instead, the script
tracks the transcript's **byte size** across invocations in a small per-session
state file (`~/.claude/statusline-cache/<session_id>.state`) and only advances
"last activity" when the transcript actually grew — the real signal that a new
turn (and therefore a new request that refreshes the cache) happened.

## License

MIT
