import { test, expect, mock } from 'claude-code/testing'

// session.start does not fire after /clear, so session.end must not stop the
// band's redraw tick for good when the session ends because of /clear.
test('redraw tick keeps running after /clear', async ($, on) => {
  const clock = mock.clock(on)
  let invalidations = 0
  on('ui.invalidate', ($, e, next) => {
    invalidations++
    return next(e)
  })
  // stand for the engine's own steps beneath the plugin
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 's' }) as never)
  await $.session.start({ cwd: '/' } as never)
  await clock.advance(30_000)
  expect(invalidations).toBeGreaterThan(0)

  await $.session.end({ reason: 'clear' } as never)
  const before = invalidations
  await clock.advance(30_000)
  expect(invalidations).toBeGreaterThan(before)
})
