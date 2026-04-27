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
import { useMeals } from '../../hooks/useMeals'
import type { Meal } from '../../types'

function makeChain(res: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: res.data ?? null, error: res.error ?? null }
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
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

const USER = 'user-abc'

const fakeMealRow: Meal = {
  id: 'meal-1',
  user_id: USER,
  name: 'Chicken Breast',
  calories: 165,
  protein: 31,
  grams: 100,
  date: '2026-04-26',
  meal_type: 'lunch',
  time_logged: '12:00:00',
  created_at: '2026-04-26T12:00:00Z',
  fluid_ml: null,
  fluid_excluded: false,
}

const newMealPayload = {
  name: 'Egg', calories: 78, protein: 6, grams: 50,
  date: '2026-04-26', meal_type: 'breakfast' as const,
  time_logged: '08:00:00', fluid_ml: null, fluid_excluded: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  fromMock.mockReturnValue(makeChain({ data: [] }))
  channelMock.mockReturnValue(makeChannel())
})

describe('useMeals', () => {
  it('does not fetch when userId is null', async () => {
    renderHook(() => useMeals(null))
    await new Promise(r => setTimeout(r, 30))
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('fetches meals on mount', async () => {
    fromMock.mockReturnValue(makeChain({ data: [fakeMealRow] }))
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.meals).toHaveLength(1))
    expect(result.current.meals[0].name).toBe('Chicken Breast')
  })

  it('isMeal type guard filters invalid rows', async () => {
    const invalid = { id: 999, name: 'bad' }
    fromMock.mockReturnValue(makeChain({ data: [fakeMealRow, invalid] }))
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.meals).toHaveLength(1)
  })

  it('sets error state when fetch fails', async () => {
    fromMock.mockReturnValue(makeChain({ error: { message: 'network error' } }))
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.error).toBe('network error'))
  })

  it('addMeal calls insert on meals table', async () => {
    const chain = makeChain({ data: [] })
    fromMock.mockReturnValue(chain)
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.addMeal(newMealPayload) })

    expect(chain.insert).toHaveBeenCalled()
  })

  it('addMeal sets error on insert failure', async () => {
    fromMock
      .mockReturnValueOnce(makeChain({ data: [] }))
      .mockReturnValue(makeChain({ error: { message: 'insert failed' } }))
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.addMeal(newMealPayload) })

    expect(result.current.error).toBe('insert failed')
  })

  it('updateMeal calls update with correct payload and id', async () => {
    const chain = makeChain({ data: [fakeMealRow] })
    fromMock.mockReturnValue(chain)
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.updateMeal('meal-1', { calories: 200 }) })

    expect(chain.update).toHaveBeenCalledWith({ calories: 200 })
    expect(chain.eq).toHaveBeenCalledWith('id', 'meal-1')
  })

  it('deleteMeal calls delete with correct id', async () => {
    const chain = makeChain({ data: [fakeMealRow] })
    fromMock.mockReturnValue(chain)
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.deleteMeal('meal-1') })

    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'meal-1')
  })

  it("duplicateMeal calls insert with today's date", async () => {
    const chain = makeChain({ data: [fakeMealRow] })
    fromMock.mockReturnValue(chain)
    const { result } = renderHook(() => useMeals(USER))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.duplicateMeal(fakeMealRow) })

    const insertArg = chain.insert.mock.calls[0][0]
    expect(insertArg).toMatchObject({ name: 'Chicken Breast', calories: 165 })
  })
})
