import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readCache, writeCache, clearCache } from '../lib/offlineCache'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('writeCache / readCache', () => {
  it('round-trips data', () => {
    writeCache('k', { x: 1 })
    expect(readCache('k')).toEqual({ x: 1 })
  })

  it('returns null for missing key', () => {
    expect(readCache('no-such-key')).toBeNull()
  })

  it('returns null when TTL expired', () => {
    writeCache('k', 42)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000 * 60 * 60 * 25) // +25h
    expect(readCache('k')).toBeNull()
  })

  it('respects custom TTL', () => {
    writeCache('k', 'hello')
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000 * 60 * 6) // +6min
    // default TTL is 24h — still valid
    expect(readCache('k', 1000 * 60 * 60)).not.toBeNull()
    // custom TTL of 5min — expired
    expect(readCache('k', 1000 * 60 * 5)).toBeNull()
  })

  it('returns data when ttlMs is Infinity', () => {
    writeCache('k', [1, 2, 3])
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000 * 60 * 60 * 24 * 365)
    expect(readCache('k', Infinity)).toEqual([1, 2, 3])
  })

  it('returns null for corrupted JSON', () => {
    localStorage.setItem('bad', 'not-json')
    expect(readCache('bad')).toBeNull()
  })
})

describe('clearCache', () => {
  it('removes the key so subsequent read returns null', () => {
    writeCache('k', 99)
    clearCache('k')
    expect(readCache('k')).toBeNull()
  })

  it('does not throw when key does not exist', () => {
    expect(() => clearCache('missing')).not.toThrow()
  })
})
