import type { Register } from 'claude-code'

import { stampPath, touchesCache } from './cache'

export const register: Register = on => {
  // Each model request of the main loop ends with a stop chunk carrying the
  // API's usage. A request that read or wrote the cache refreshes its TTL, so
  // its completion time (epoch seconds) is written for statusline.sh.
  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (chunk.kind === 'stop' && e.agentId === undefined && touchesCache(chunk.usage)) {
        try {
          const path = stampPath(
            await $.env.get('CLAUDE_CONFIG_DIR'),
            await $.env.get('HOME'),
            await $.session.id(),
          )
          await $.fs.write(path, `${Math.floor((await $.clock.now()) / 1000)}\n`)
        } catch {
          // the indicator must never break a turn
        }
      }
      yield chunk
    }
  })
}
