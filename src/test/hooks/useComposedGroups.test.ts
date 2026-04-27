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
import { useComposedGroups } from '../../hooks/useComposedGroups'

function makeChain(res: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: res.data ?? null, error: res.error ?? null }
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
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

const USER = 'user-cg'

// DB rows use snake_case meal_ids
const groupRows = [
  { id: 'g1', name: 'Breakfast Set',  meal_ids: ['m1', 'm2'] },
  { id: 'g2', name: 'Dinner Combo',   meal_ids: ['m3'] },
]

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  fromMock.mockReturnValue(makeChain({ data: [] }))
  channelMock.mockReturnValue(makeChannel())
})

describe('useComposedGroups', () => {
  it('fetches groups on mount and maps meal_ids → mealIds', async () => {
    fromMock.mockReturnValue(makeChain({ data: groupRows }))
    const { result } = renderHook(() => useComposedGroups(USER))
    await waitFor(() => expect(result.current.groups).toHaveLength(2))
    expect(result.current.groups[0].mealIds).toEqual(['m1', 'm2'])
  })

  it('upsert adds new group to state immediately', async () => {
    const { result } = renderHook(() => useComposedGroups(USER))
    await waitFor(() => expect(result.current.groups).toHaveLength(0))

    act(() => {
      result.current.upsert({ id: 'g99', name: 'New Group', mealIds: ['m9'] })
    })

    expect(result.current.groups.find(g => g.id === 'g99')).toBeDefined()
  })

  it('remove deletes group from state and calls DB delete', async () => {
    const fetchChain  = makeChain({ data: groupRows })
    const deleteChain = makeChain()
    fromMock
      .mockReturnValueOnce(fetchChain)
      .mockReturnValue(deleteChain)

    const { result } = renderHook(() => useComposedGroups(USER))
    await waitFor(() => expect(result.current.groups).toHaveLength(2))

    await act(async () => { await result.current.remove('g1') })

    expect(result.current.groups.find(g => g.id === 'g1')).toBeUndefined()
    expect(deleteChain.delete).toHaveBeenCalled()
  })

  it('pruneMealId does nothing when meal is not in any group', async () => {
    fromMock.mockReturnValue(makeChain({ data: groupRows }))
    const { result } = renderHook(() => useComposedGroups(USER))
    await waitFor(() => expect(result.current.groups).toHaveLength(2))

    await act(async () => { await result.current.pruneMealId('m-nonexistent') })

    // No DB calls beyond the initial fetch
    expect(result.current.groups).toHaveLength(2)
  })

  it('pruneMealId updates group when other meals remain', async () => {
    const fetchChain  = makeChain({ data: groupRows })
    const updateChain = makeChain()
    fromMock
      .mockReturnValueOnce(fetchChain)
      .mockReturnValue(updateChain)

    const { result } = renderHook(() => useComposedGroups(USER))
    await waitFor(() => expect(result.current.groups).toHaveLength(2))

    await act(async () => { await result.current.pruneMealId('m1') })

    // g1 had [m1, m2] → now [m2] (not deleted)
    const g1 = result.current.groups.find(g => g.id === 'g1')
    expect(g1?.mealIds).toEqual(['m2'])
    expect(updateChain.update).toHaveBeenCalledWith({ meal_ids: ['m2'] })
  })

  it('pruneMealId deletes group when it becomes empty', async () => {
    const fetchChain  = makeChain({ data: groupRows })
    const deleteChain = makeChain()
    fromMock
      .mockReturnValueOnce(fetchChain)
      .mockReturnValue(deleteChain)

    const { result } = renderHook(() => useComposedGroups(USER))
    await waitFor(() => expect(result.current.groups).toHaveLength(2))

    await act(async () => { await result.current.pruneMealId('m3') })

    // g2 had only [m3] → deleted
    expect(result.current.groups.find(g => g.id === 'g2')).toBeUndefined()
    expect(deleteChain.delete).toHaveBeenCalled()
  })
})
