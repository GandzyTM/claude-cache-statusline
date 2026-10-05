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

// The desktop band end to end: stamp file + live context percent -> drawn text.
const NOW_MS = 1_800_000_000_000
const NOW_S = NOW_MS / 1000

async function drawBand(
  $: any,
  on: any,
  opts: { idleS: number; percent: number | undefined; env?: Record<string, string> },
) {
  mock.clock(on, { now: NOW_MS })
  mock.env(on, { CLAUDE_CONFIG_DIR: '/cfg', ...opts.env })
  on('session.id', () => ({ value: 'sid' }) as never)
  on('fs.read', (_$: unknown, e: { path: string }) => {
    if (e.path !== '/cfg/statusline-cache/sid.last') throw new Error(`unexpected read ${e.path}`)
    return { value: `${NOW_S - opts.idleS}\n` } as never
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, percent: opts.percent }, rateLimits: [] },
  }) as never)
  const band = await $.ui.mount({
    plugin: 'cache-indicator',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false } as never,
  })
  return band
}

test('band: cold cache + 40% context advises /clear in red', async ($, on) => {
  const band = await drawBand($, on, { idleS: 7300, percent: 40 })
  const el = await band.find({ type: 'Text', text: 'cold (2h) · /clear?' })
  expect(el?.props.color).toBe('red')
})

test('band: cold cache + 29% context shows plain cold', async ($, on) => {
  const band = await drawBand($, on, { idleS: 7300, percent: 29 })
  expect(await band.find({ type: 'Text', text: 'cold (2h)' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: '/clear?' })).toBeUndefined()
})

test('band: no context reading means no advice', async ($, on) => {
  const band = await drawBand($, on, { idleS: 7300, percent: undefined })
  expect(await band.find({ type: 'Text', text: '/clear?' })).toBeUndefined()
})

test('band: warm cache never advises, even at 90%', async ($, on) => {
  const band = await drawBand($, on, { idleS: 600, percent: 90 })
  expect(await band.find({ type: 'Text', text: 'warm ~50m' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: '/clear?' })).toBeUndefined()
})

test('band: CACHE_INDICATOR_CLEAR_PCT lowers the threshold', async ($, on) => {
  const band = await drawBand($, on, {
    idleS: 7300,
    percent: 5,
    env: { CACHE_INDICATOR_CLEAR_PCT: '1' },
  })
  expect(await band.find({ type: 'Text', text: '/clear?' })).toBeDefined()
})
