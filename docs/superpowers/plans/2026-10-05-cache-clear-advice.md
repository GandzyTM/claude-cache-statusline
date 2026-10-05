# Cache indicator `/clear` advice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `cold (Nh) · /clear?` when the prompt cache is cold and context fill is at least 30%, in both the desktop band and `statusline.sh`.

**Architecture:** Pure logic (stamp format, percent, threshold, advice) lives in `plugins/cache-indicator/hooks/cache.ts` and is unit-tested. `register.tsx` writes the percent into the stamp file and renders the band from `advice`. `statusline.sh` applies the same rule using its own exact context percent.

**Tech Stack:** TypeScript mod (`claude-code` hooks API, `claude-code/testing`), bash + jq.

**Spec:** `docs/superpowers/specs/2026-10-05-cache-clear-advice-design.md`

## Global Constraints

- Advice only when idle >= 3600 s AND pct >= threshold; threshold default 30, env `CACHE_INDICATOR_CLEAR_PCT`.
- Label text exactly `cold (Nh) · /clear?`; desktop colour `red`, terminal colour `38;5;208`.
- Stamp file `<config dir>/statusline-cache/<session id>.last`: new format `<epoch> <pct>`, old `<epoch>` stays valid.
- Window size: mod API if available, else env `CACHE_INDICATOR_CTX_WINDOW`, else `pct = null` and no advice. No silent default window.
- Commit messages and README text must not mention AI/agents/tools used to write them.

## Review Focus

- Stamp `1700000000 abc` (junk second field): timestamp kept, `pct = null`.
- Computed pct above 100 (window env set too small): clamped to 100.
- Window env `0`, negative, or non-numeric: treated as unset (`pct = null`).
- Threshold env `abc`, `0`, `101`, `-5`: falls back to 30.
- After the user runs `/clear` the stamp still holds the old pct until the next request: the band must not keep nagging if the session id is unchanged (verify manually in Task 2; report the result, do not invent a fix).
- Bash: `used_percentage` may be a float or missing; threshold env non-numeric; stamp file without second field.

---

## Precondition

The working tree holds uncommitted desktop-band changes (`register.tsx`, `cache.ts`, `cache.test.ts`, `hooks.json`, `plugin.json`, `README.md`). Ask the user to commit them first. Do not commit them on their behalf; every commit below uses explicit paths.

### Task 1: Advice logic in `cache.ts`

**Files:**
- Modify: `plugins/cache-indicator/hooks/cache.ts`
- Test: `plugins/cache-indicator/hooks/cache.test.ts`

**Interfaces:**
- Produces:
  - `type Stamp = { ts: number; pct: number | null }`
  - `parseStamp(text: string): Stamp | null` (replaces the `number | null` version)
  - `formatStamp(ts: number, pct: number | null): string` -> `"<ts> <pct>\n"` or `"<ts>\n"`
  - `parseWindow(raw: string | undefined): number | null`
  - `ctxPct(u: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }, windowTokens: number | null): number | null` (floor, clamped 0..100)
  - `DEFAULT_CLEAR_PCT = 30`; `parseThreshold(raw: string | undefined): number` (integer 1..100, else 30)
  - `advice(lastS: number | null, nowS: number, pct: number | null, thresholdPct: number): CacheView | null`

- [ ] **Step 1: Find the test command.** Read the `plugin-authoring` skill (and the usage-field names of the stop chunk, in particular whether the input count is `input_tokens`) and record the command that runs `cache.test.ts`. Run it once on the current tests; expected: PASS.

- [ ] **Step 2: Write failing tests** in `cache.test.ts`:
  - `parseStamp`: `'1700000000\n'` -> `{ts:1700000000,pct:null}`; `'1700000000 42\n'` -> `{...,pct:42}`; `'1700000000 abc'` -> `{...,pct:null}`; `'junk'` -> `null`. Update the existing `parseStamp` test accordingly.
  - `formatStamp(5, 42)` = `'5 42\n'`; `formatStamp(5, null)` = `'5\n'`.
  - `parseWindow`: `'200000'` -> 200000; `undefined`, `'0'`, `'-1'`, `'abc'` -> `null`.
  - `ctxPct`: 60000 total tokens of 200000 -> 30; of 1000000 -> 6; window `null` -> `null`; total above window -> 100.
  - `parseThreshold`: `undefined` -> 30; `'45'` -> 45; `'abc'`, `'0'`, `'101'`, `'-5'` -> 30.
  - `advice`: idle 3599 s, pct 90 -> same as `view` (warm); idle 3600, pct 29 -> `{label:'cold (1h)',color:'gray'}`; idle 3600, pct 30 -> `{label:'cold (1h) · /clear?',color:'red'}`; idle 7300, pct 50 -> label `'cold (2h) · /clear?'`; idle 3600, pct `null` -> plain cold; `lastS` null -> `null`.

- [ ] **Step 3: Run tests; expected: FAIL** (missing exports / changed `parseStamp`).

- [ ] **Step 4: Implement** the signatures above in `cache.ts`. `parseStamp` uses `/^(\d+)(?:\s+(\S+))?$/` (pct only when the second field is all digits). `advice` delegates to `view` and only rewrites the cold case.

- [ ] **Step 5: Run tests; expected: PASS.** (`register.tsx` still calls the old `parseStamp` and is fixed in Task 2; do not run the whole mod between tasks.)

- [ ] **Step 6: Commit** `cache.ts` and `cache.test.ts` with message `Add /clear advice logic for cold cache with large context`.

### Task 2: Mod writes percent and renders advice

**Files:**
- Modify: `plugins/cache-indicator/hooks/register.tsx`

**Interfaces:**
- Consumes: `formatStamp`, `parseStamp`, `parseWindow`, `ctxPct`, `parseThreshold`, `advice` from Task 1.

- [ ] **Step 1: Find the window source.** In the mod API docs (`plugin-authoring` skill) look for the model context window. Write the finding (found / not found, with the exact field) in the commit message body of this task. If not found, use only `$.env.get('CACHE_INDICATOR_CTX_WINDOW')`.

- [ ] **Step 2: In the `turn.step` handler**, compute `pct = ctxPct(chunk.usage, window)` and write `formatStamp(nowS, pct)` instead of the bare epoch.

- [ ] **Step 3: In the `ui.render` handler**, use `parseStamp` result `{ts, pct}`, read threshold via `parseThreshold(await $.env.get('CACHE_INDICATOR_CLEAR_PCT'))` and render `advice(ts, nowS, pct, threshold)`; `null` or an unreadable file still falls through as today.

- [ ] **Step 4: Run the whole mod test suite**; expected: PASS.

- [ ] **Step 5: Manual check in a desktop session.** Write a stamp by hand (`<epoch 2h ago> 40`) and confirm the band shows `cold (2h) · /clear?` in red; with pct 20 it shows plain `cold (2h)`; old-format stamp shows plain cold. Then run `/clear` and report whether the band disappears (Review Focus).

- [ ] **Step 6: Commit** `register.tsx` with message `Write context percent to stamp and show /clear advice in band`.

### Task 3: `statusline.sh` advice

**Files:**
- Modify: `statusline.sh` (cold branch, around the `IDLE_H` lines)

- [ ] **Step 1: Read the threshold** next to the cache block: `CLEAR_PCT=${CACHE_INDICATOR_CLEAR_PCT:-30}`; accept only an integer 1..100 (a `case`/arithmetic guard), else 30.

- [ ] **Step 2: In the cold branch** print `cache cold (${IDLE_H}h) · /clear?` in `38;5;208` when `CTX_INT -ge CLEAR_PCT`, otherwise the existing gray text. Warm branch unchanged.

- [ ] **Step 3: Verify manually** with crafted stdin JSON (`context_window.used_percentage` 29 / 30 / 45.7 / missing, `session_id` of a test session) and a stamp file `<epoch 2h ago>` and `<epoch 2h ago> 40` in a temporary `CLAUDE_CONFIG_DIR`. Expected: advice at 30, 45.7; none at 29 and missing; same result for both stamp formats; non-numeric `CACHE_INDICATOR_CLEAR_PCT` behaves as 30.

- [ ] **Step 4: Commit** `statusline.sh` with message `Show /clear advice in statusline when cache is cold and context is large`.

### Task 4: Docs and version

**Files:**
- Modify: `README.md`, `plugins/cache-indicator/.claude-plugin/plugin.json`

- [ ] **Step 1: README**: describe the rule (cold >= 1h and context >= 30%), what it does not know (whether the context is still needed), the two env variables, and the new stamp format; add the manual check from Task 3 as an example command.

- [ ] **Step 2: Bump** the plugin version (minor) and mention the advice in its description.

- [ ] **Step 3: Commit** both files with message `Document /clear advice and bump cache-indicator version`.
