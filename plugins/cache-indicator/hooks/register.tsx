import type { Register } from 'claude-code'

import { advice, parseStamp, parseThreshold, stampPath, touchesCache } from './cache'

const TICK_MS = 30_000

export const register: Register = on => {
  let tick: { cancel: () => void } | undefined

  on('session.start', ($, e, next) => {
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('session.end', ($, e, next) => {
    tick?.cancel()
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
    const threshold = parseThreshold(await $.env.get('CACHE_INDICATOR_CLEAR_PCT'))
    const v = advice(last, Math.floor((await $.clock.now()) / 1000), pct, threshold)
    if (v === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>Prompt cache </Text>
        <Text color={v.color}>{v.label}</Text>
      </Box>
    )
  })
}
