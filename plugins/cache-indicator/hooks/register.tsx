import type { Engine, Register } from 'claude-code'

import { advice, parseStamp, resolveThreshold, stampPath, thresholdPath, touchesCache } from './cache'

const TICK_MS = 30_000

// CACHE_INDICATOR_CLEAR_PCT overrides the clear_pct userConfig option.
async function clearThreshold($: Engine, option: unknown): Promise<number> {
  return resolveThreshold(
    await $.env.get('CACHE_INDICATOR_CLEAR_PCT'),
    typeof option === 'number' ? option : undefined,
  )
}

export const register: Register = (on, options) => {
  let tick: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    // statusline.sh cannot read userConfig, so it reads the threshold from here.
    try {
      await $.fs.write(
        thresholdPath(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME')),
        `${await clearThreshold($, options.clear_pct)}\n`,
      )
    } catch {
      // the indicator must never break a session
    }
    return next(e)
  })

  // session.start does not fire after /clear, so the tick must outlive it.
  on('session.end', ($, e, next) => {
    if (e.reason !== 'clear') tick?.cancel()
    return next(e)
  })

  // Each model request of the main loop ends with a stop chunk carrying the
  // API's usage. A request that read or wrote the cache refreshes its TTL, so
  // its completion time (epoch seconds) is written for statusline.sh and for
  // the band below.
  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (chunk.kind === 'stop' && e.agentId === undefined && touchesCache(chunk.usage)) {
        try {
          await $.fs.write(
            stampPath(
              await $.env.get('CLAUDE_CONFIG_DIR'),
              await $.env.get('HOME'),
              await $.session.id(),
            ),
            `${Math.floor((await $.clock.now()) / 1000)}\n`)
          $.ui.invalidate('ui.render')
        } catch {
          // the indicator must never break a turn
        }
      }
      yield chunk
    }
  })

  // The Desktop app shows no status line, so it gets a band; the terminal's
  // statusline.sh reads the same file.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)

    let last: number | null = null
    try {
      last = parseStamp(
        await $.fs.read(
          stampPath(
            await $.env.get('CLAUDE_CONFIG_DIR'),
            await $.env.get('HOME'),
            await $.session.id(),
          ),
        ),
      )
    } catch {
      return next(e)
    }
    // Live context fill, as the status line reads it; absent right after /clear
    // or a compaction, in which case no advice is given.
    let pct: number | null = null
    try {
      pct = (await $.session.usage()).context.percent ?? null
    } catch {
      // no advice without a reading
    }
    const threshold = await clearThreshold($, options.clear_pct)
    const v = advice(last, Math.floor((await $.clock.now()) / 1000), pct, threshold)
    if (v === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    // Puts /clear in the prompt for the person to confirm with Enter; never
    // submits it, and never overwrites a draft they have typed.
    const putClearInPrompt = async () => {
      try {
        if ((await $.prompt.read()).text.trim() !== '') {
          $.ui.toast('The prompt is not empty: clear it, then press /clear again')
          return
        }
        await $.prompt.fill({ text: '/clear' })
      } catch {
        // a button press must never break the session
      }
    }

    return (
      <Box columnGap={1}>
        <Text dimColor>Prompt cache </Text>
        <Text color={v.color}>{v.label}</Text>
        {v.isClearAdvised ? <Button key="clear" label="/clear" onPress={putClearInPrompt} /> : null}
      </Box>
    )
  })
}
