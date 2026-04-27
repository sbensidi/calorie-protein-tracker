import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

import { supabase } from '../../lib/supabase'
import { useProfile } from '../../hooks/useProfile'

function makeChain(res: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: res.data ?? null, error: res.error ?? null }
  const chain = {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolved)),
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolved).then(onFulfilled, onRejected)
    },
  }
  return chain
}

const fromMock = supabase.from as ReturnType<typeof vi.fn>

const USER = 'user-xyz'

// DB row format (snake_case)
const dbProfileRow = {
  id: USER,
  sex: 'f',
  age: 25,
  height: 165,
  weight: 58,
  activity_level: 2,
  goal_type: 'maintain',
  weight_unit: 'g',
  volume_unit: 'ml',
  fluid_goal_ml: 2000,
  fluid_threshold_ml: 100,
  fluid_zero_cal_only: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  // Default: no DB row (PGRST116)
  fromMock.mockReturnValue(makeChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } }))
})

describe('useProfile', () => {
  it('returns default profile when no userId', async () => {
    const { result } = renderHook(() => useProfile(null))
    expect(result.current.profile.weight).toBe(70) // DEFAULT.weight
    expect(result.current.error).toBeNull()
  })

  it('does not call DB when userId is null', async () => {
    renderHook(() => useProfile(null))
    await new Promise(r => setTimeout(r, 30))
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('loads profile from DB on mount', async () => {
    fromMock.mockReturnValue(makeChain({ data: dbProfileRow }))
    const { result } = renderHook(() => useProfile(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile.weight).toBe(58)
    expect(result.current.profile.sex).toBe('f')
    expect(result.current.profile.age).toBe(25)
  })

  it('handles PGRST116 without setting error', async () => {
    const { result } = renderHook(() => useProfile(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.profile.weight).toBe(70) // DEFAULT stays
  })

  it('saveProfile applies update to state immediately (no userId)', async () => {
    const { result } = renderHook(() => useProfile(null))
    await act(async () => { await result.current.saveProfile({ weight: 80 }) })
    expect(result.current.profile.weight).toBe(80)
  })

  it('saveProfile reverts state on DB error', async () => {
    // mount: PGRST116 (no row, keep DEFAULT)
    const upsertChain = makeChain({ error: { message: 'write failed' } })
    fromMock
      .mockReturnValueOnce(makeChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } }))
      .mockReturnValue(upsertChain)

    const { result } = renderHook(() => useProfile(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const originalWeight = result.current.profile.weight // 70

    await act(async () => { await result.current.saveProfile({ weight: 99 }) })

    expect(result.current.profile.weight).toBe(originalWeight)
    expect(result.current.error).toBe('write failed')
  })

  it('saveProfile reverts localStorage on DB error', async () => {
    const upsertChain = makeChain({ error: { message: 'write failed' } })
    fromMock
      .mockReturnValueOnce(makeChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } }))
      .mockReturnValue(upsertChain)

    const { result } = renderHook(() => useProfile(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.saveProfile({ weight: 99 }) })

    const stored = JSON.parse(localStorage.getItem('user_profile') ?? '{}')
    expect(stored.weight).toBe(70) // reverted to DEFAULT
  })
})
