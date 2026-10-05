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
