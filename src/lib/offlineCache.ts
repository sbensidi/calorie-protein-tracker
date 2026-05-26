const DEFAULT_TTL = 1000 * 60 * 60 * 24  // 24h

interface CacheEntry<T> { ts: number; data: T }

export function readCache<T>(key: string, ttlMs = DEFAULT_TTL): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw) as CacheEntry<T>
    if (ttlMs !== Infinity && Date.now() - ts > ttlMs) return null
    return data
  } catch { return null }
}

export function writeCache<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) }
  catch { /* localStorage full — swallow */ }
}

export function clearCache(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
