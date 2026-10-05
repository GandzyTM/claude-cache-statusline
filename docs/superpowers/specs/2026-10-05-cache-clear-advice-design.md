# Cache indicator: `/clear` advice

## Goal

Extend the `cache-indicator` mod and `statusline.sh` so the indicator says not
only how warm the prompt cache is, but also when continuing the session is
likely to cost more than starting over with `/clear`.

Success: by looking at the indicator, the user sees whether the cache has gone
cold while the context is still large.

## Rule

Show the advice when **both** hold:

- idle time since the last cache-touching request is at least 3600 s (the
  client's estimate of the 1h window, not a server-side fact);
- context fill is at least 30% of the model window.

While the cache is warm the advice is never shown: continuing is cheap and
`/clear` would discard the cache.

What the rule does not know: whether the user still needs the context for the
task. It judges resume cost only, so the label is a question (`/clear?`), not a
command.

## Components

### 1. Stamp file

`<config dir>/statusline-cache/<session id>.last`

- New format: `<epoch> <pct>`, `pct` an integer percent of the window used at
  the moment of the last cache-touching request.
- Old format `<epoch>` stays valid. `parseStamp` returns
  `{ ts: number, pct: number | null } | null`; a single number gives
  `pct: null`.
- `statusline.sh` already reads the first field with `read -r`, so an old
  script with a new mod keeps working. A new script with an old file sees no
  second field and uses its own context percent.

### 2. Context percent in the mod (`register.tsx`)

In the `turn.step` stop chunk: tokens = `input + cache_read + cache_creation`
from `usage`; `pct = floor(tokens * 100 / window)`.

Window size source, in order:

1. the mod API, if it exposes the model window (to be verified against the mod
   API docs as the first implementation step; not confirmed yet);
2. env `CACHE_INDICATOR_CTX_WINDOW`;
3. otherwise `pct = null` and no advice. No silent default: a wrong window
   (200k vs 1M) would skew the percent up to 5x.

### 3. Advice logic (`cache.ts`)

Pure `advice(idleS, pct, thresholdPct)`:

- `idleS >= TTL_S && pct !== null && pct >= thresholdPct` ->
  `{ label: 'cold (Nh) · /clear?', color: 'red' }`;
- otherwise the existing `view` output.

Threshold: env `CACHE_INDICATOR_CLEAR_PCT`, default 30; invalid values fall
back to 30.

### 4. Terminal (`statusline.sh`)

Uses its own exact `CTX_INT` and the same threshold from
`CACHE_INDICATOR_CLEAR_PCT` (default 30). Cold branch with
`IDLE >= 3600 && CTX_INT >= threshold` prints
`cache cold (Nh) · /clear?` in orange (`38;5;208`). Works with or without the
mod, since it needs only idle time and context percent.

### 5. Desktop band (`register.tsx`)

Reads `{ts, pct}` from the stamp and calls `advice`. `pct: null` renders as
today.

## Tests

`cache.test.ts`: both stamp formats; threshold boundary 29/30; idle boundary
3599/3600; `pct: null`; invalid env threshold. Manual check of the bash branch
with crafted stdin JSON and a stamp file with a chosen epoch (command added to
README).

## Out of scope

Colour gradation by size, token-cost estimates, running `/clear`
automatically.

## Open item

Window size from the mod API (see component 2). If unavailable, the desktop
band needs `CACHE_INDICATOR_CTX_WINDOW`; the terminal is unaffected.
