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
import { useGoals } from '../../hooks/useGoals'

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

function makeChannel() {
  return { on: vi.fn().mockReturnThis(), subscribe: vi.fn() }
}

const fromMock    = supabase.from as ReturnType<typeof vi.fn>
const channelMock = supabase.channel as ReturnType<typeof vi.fn>

const USER = 'user-goals'

const dbGoalRow = {
  id: 'goal-1',
  user_id: USER,
  default_calories: 2000,
  default_protein: 150,
  weekly_overrides: { '1': { calories: 1800, protein: 120 } }, // Monday override
  updated_at: '2026-04-26T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  fromMock.mockReturnValue(makeChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } }))
  channelMock.mockReturnValue(makeChannel())
})

describe('useGoals', () => {
  it('returns null goals and no error when userId is null', async () => {
    const { result } = renderHook(() => useGoals(null))
    expect(result.current.goals).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('loads goals from DB on mount', async () => {
    fromMock.mockReturnValue(makeChain({ data: dbGoalRow }))
    const { result } = renderHook(() => useGoals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.goals?.default_calories).toBe(2000)
    expect(result.current.goals?.default_protein).toBe(150)
  })

  it('PGRST116: auto-upserts defaults for new user', async () => {
    const upsertChain = makeChain()
    fromMock
      .mockReturnValueOnce(makeChain({ data: null, error: { code: 'PGRST116', message: 'no rows' } }))
      .mockReturnValue(upsertChain)

    const { result } = renderHook(() => useGoals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER, default_calories: 1700, default_protein: 160 }),
      expect.objectContaining({ onConflict: 'user_id' }),
    )
    expect(result.current.error).toBeNull()
  })

  it('sets error state on non-PGRST116 DB error', async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: { code: '500', message: 'server error' } }))
    const { result } = renderHook(() => useGoals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('server error')
  })

  it('getGoalForDate returns defaults when goals is null', () => {
    const { result } = renderHook(() => useGoals(null))
    const g = result.current.getGoalForDate('2026-04-28')
    expect(g.calories).toBe(1700)
    expect(g.protein).toBe(160)
  })

  it('getGoalForDate returns default_calories on a day with no override', async () => {
    fromMock.mockReturnValue(makeChain({ data: dbGoalRow }))
    const { result } = renderHook(() => useGoals(USER))
    await waitFor(() => expect(result.current.goals).not.toBeNull())

    // 2026-04-26 is a Sunday (dow=0), no override for 0 in dbGoalRow
    const g = result.current.getGoalForDate('2026-04-26')
    expect(g.calories).toBe(2000)
    expect(g.protein).toBe(150)
  })

  it('getGoalForDate returns override on the correct day-of-week', async () => {
    fromMock.mockReturnValue(makeChain({ data: dbGoalRow }))
    const { result } = renderHook(() => useGoals(USER))
    await waitFor(() => expect(result.current.goals).not.toBeNull())

    // 2026-04-27 is a Monday (dow=1), override: { calories: 1800, protein: 120 }
    const g = result.current.getGoalForDate('2026-04-27')
    expect(g.calories).toBe(1800)
    expect(g.protein).toBe(120)
  })

  it('saveGoals calls upsert with user_id', async () => {
    const fetchChain  = makeChain({ data: dbGoalRow })
    const upsertChain = makeChain()
    fromMock
      .mockReturnValueOnce(fetchChain)
      .mockReturnValue(upsertChain)

    const { result } = renderHook(() => useGoals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.saveGoals({ default_calories: 2200 }) })

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ default_calories: 2200, user_id: USER }),
      expect.objectContaining({ onConflict: 'user_id' }),
    )
  })
})
