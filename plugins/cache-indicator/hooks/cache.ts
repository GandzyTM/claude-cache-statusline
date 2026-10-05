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
