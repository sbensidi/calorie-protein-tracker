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
import { useFoodHistory } from '../../hooks/useFoodHistory'

function makeChain(res: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: res.data ?? null, error: res.error ?? null }
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
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

const USER = 'user-hist'

const historyRows = [
  { id: 'fh-1', user_id: USER, name: 'Chicken Breast', grams: 100, calories: 165, protein: 31, fluid_ml: null, use_count: 10, last_used: '2026-04-26' },
  { id: 'fh-2', user_id: USER, name: 'Chocolate Cake', grams: 100, calories: 400, protein: 5,  fluid_ml: null, use_count: 3,  last_used: '2026-04-25' },
]

beforeEach(() => {
  vi.resetAllMocks()
  fromMock.mockReturnValue(makeChain({ data: [] }))
  channelMock.mockReturnValue(makeChannel())
})

describe('useFoodHistory', () => {
  it('fetches history on mount', async () => {
    fromMock.mockReturnValue(makeChain({ data: historyRows }))
    const { result } = renderHook(() => useFoodHistory(USER))
    await waitFor(() => expect(result.current.history).toHaveLength(2))
    expect(result.current.history[0].name).toBe('Chicken Breast')
  })

  it('getSuggestions returns empty array for blank query', async () => {
    fromMock.mockReturnValue(makeChain({ data: historyRows }))
    const { result } = renderHook(() => useFoodHistory(USER))
    await waitFor(() => expect(result.current.history).toHaveLength(2))
    expect(result.current.getSuggestions('')).toEqual([])
    expect(result.current.getSuggestions('   ')).toEqual([])
  })

  it('getSuggestions filters by partial name (case-insensitive)', async () => {
    fromMock.mockReturnValue(makeChain({ data: historyRows }))
    const { result } = renderHook(() => useFoodHistory(USER))
    await waitFor(() => expect(result.current.history).toHaveLength(2))

    const hits = result.current.getSuggestions('chick')
    expect(hits).toHaveLength(1)
    expect(hits[0].name).toBe('Chicken Breast')
  })

  it('upsertHistory calls insert when item not found', async () => {
    const fetchChain  = makeChain({ data: [] })
    // select+single: not found → insert path
    const selectChain = makeChain({ data: null })
    const insertChain = makeChain()

    fromMock
      .mockReturnValueOnce(fetchChain)   // mount fetchHistory
      .mockReturnValueOnce(selectChain)  // select for existing check
      .mockReturnValueOnce(insertChain)  // insert
      .mockReturnValue(fetchChain)       // refetch after insert

    const { result } = renderHook(() => useFoodHistory(USER))
    await waitFor(() => expect(result.current.history).toBeDefined())

    await act(async () => {
      await result.current.upsertHistory({ name: 'Apple', grams: 100, calories: 52, protein: 0.3, fluid_ml: null })
    })

    expect(insertChain.insert).toHaveBeenCalled()
    expect(insertChain.update).not.toHaveBeenCalled()
  })

  it('upsertHistory calls update when item already exists', async () => {
    const fetchChain  = makeChain({ data: [] })
    const selectChain = makeChain({ data: { id: 'fh-1', use_count: 3 } })
    const updateChain = makeChain()

    fromMock
      .mockReturnValueOnce(fetchChain)   // mount fetchHistory
      .mockReturnValueOnce(selectChain)  // select → found
      .mockReturnValueOnce(updateChain)  // update
      .mockReturnValue(fetchChain)       // refetch

    const { result } = renderHook(() => useFoodHistory(USER))
    await waitFor(() => expect(result.current.history).toBeDefined())

    await act(async () => {
      await result.current.upsertHistory({ name: 'Apple', grams: 100, calories: 52, protein: 0.3, fluid_ml: null })
    })

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ use_count: 4 }),
    )
    expect(updateChain.insert).not.toHaveBeenCalled()
  })

  it('deleteHistory removes item optimistically', async () => {
    fromMock.mockReturnValue(makeChain({ data: historyRows }))
    const { result } = renderHook(() => useFoodHistory(USER))
    await waitFor(() => expect(result.current.history).toHaveLength(2))

    act(() => { result.current.deleteHistory('fh-1') })

    expect(result.current.history.find(h => h.id === 'fh-1')).toBeUndefined()
  })

  it('deleteHistory reverts on DB error', async () => {
    const fetchChain  = makeChain({ data: historyRows })
    const deleteChain = makeChain({ error: { message: 'delete failed' } })

    fromMock
      .mockReturnValueOnce(fetchChain)
      .mockReturnValue(deleteChain)

    const { result } = renderHook(() => useFoodHistory(USER))
    await waitFor(() => expect(result.current.history).toHaveLength(2))

    await act(async () => { await result.current.deleteHistory('fh-1') })

    // Wait for revert from refetch response
    await waitFor(() => expect(result.current.error).toBe('delete failed'))
  })
})
