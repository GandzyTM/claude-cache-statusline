import { test, expect } from 'claude-code/testing'
import { stampPath, touchesCache } from './cache'

test('touchesCache', async () => {
  const u = { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  expect(touchesCache(null)).toBe(false)
  expect(touchesCache(u)).toBe(false)
  expect(touchesCache({ ...u, cache_read_input_tokens: 5 })).toBe(true)
  expect(touchesCache({ ...u, cache_creation_input_tokens: 5 })).toBe(true)
})
test('stampPath', async () => {
  expect(stampPath('/c', '/h', 's1')).toBe('/c/statusline-cache/s1.last')
  expect(stampPath(undefined, '/h', 's1')).toBe('/h/.claude/statusline-cache/s1.last')
})

import { view, parseStamp } from './cache'

test('view', async () => {
  expect(view(null, 100)).toBe(null)
  expect(view(0, 0)).toEqual({ label: 'warm ~60m', color: 'green' })
  expect(view(0, 3000)).toEqual({ label: 'warm ~10m', color: 'yellow' })
  expect(view(0, 3600)).toEqual({ label: 'cold (1h)', color: 'gray' })
})
test('parseStamp', async () => {
  expect(parseStamp('1700000000\n')).toBe(1700000000)
  expect(parseStamp('junk')).toBe(null)
})
