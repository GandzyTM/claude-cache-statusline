// A request counts only if it read from or wrote to the prompt cache.
export function touchesCache(u: {
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
} | null): boolean {
  return !!u && u.cache_read_input_tokens + u.cache_creation_input_tokens > 0
}

// Per-session file statusline.sh reads: <config dir>/statusline-cache/<id>.last
export function stampPath(configDir: string | undefined, home: string | undefined, sessionId: string): string {
  const base = configDir || `${home ?? ''}/.claude`
  return `${base}/statusline-cache/${sessionId}.last`
}

export const TTL_S = 3600
export const WARN_S = 600

export type CacheView = { label: string; color: string }

// What the desktop band says: time since the last request that touched the
// cache. It is the client's estimate of a 1h window, not a server-side fact.
export function view(lastS: number | null, nowS: number): CacheView | null {
  if (lastS === null) return null
  const idle = Math.max(0, nowS - lastS)
  if (idle >= TTL_S) return { label: `cold (${Math.floor(idle / TTL_S)}h)`, color: 'gray' }
  const leftS = TTL_S - idle
  return {
    label: `warm ~${Math.floor(leftS / 60)}m`,
    color: leftS <= WARN_S ? 'yellow' : 'green',
  }
}

export function parseStamp(text: string): number | null {
  const t = text.trim()
  return /^\d+$/.test(t) ? Number(t) : null
}
