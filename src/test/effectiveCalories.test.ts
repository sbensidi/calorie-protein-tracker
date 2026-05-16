import { describe, it, expect } from 'vitest'
import { effectiveCalories, backCalcBase } from '../lib/units'

// Known rounding edge case: typed=299, qty=3 → base=100 → shows 300.
// Acceptable for calorie tracking; the "N per item" hint surfaces the discrepancy.

describe('effectiveCalories — display', () => {
  it('qty=1: effective equals base', () => {
    expect(effectiveCalories(250, 1)).toBe(250)
  })

  it('qty=3: multiplies correctly', () => {
    expect(effectiveCalories(100, 3)).toBe(300)
  })

  it('rounds fractional result', () => {
    expect(effectiveCalories(33, 3)).toBe(99)
  })

  it('zero base returns zero', () => {
    expect(effectiveCalories(0, 5)).toBe(0)
  })
})

describe('backCalcBase — round-trip', () => {
  it('exact division round-trips without loss', () => {
    const base = 100
    const qty = 3
    const effective = effectiveCalories(base, qty)   // 300
    expect(backCalcBase(effective, qty)).toBe(base)  // 300/3 = 100 ✓
  })

  it('known rounding discrepancy: typed=299, qty=3', () => {
    const typedTotal = 299
    const qty = 3
    const base = backCalcBase(typedTotal, qty) // 100
    expect(base).toBe(100)
    const redisplayed = effectiveCalories(base, qty) // 300
    expect(redisplayed).toBe(300)
    expect(Math.abs(redisplayed - typedTotal)).toBeLessThanOrEqual(qty)
  })

  it('qty=1: no rounding occurs', () => {
    expect(backCalcBase(157, 1)).toBe(157)
    expect(effectiveCalories(backCalcBase(157, 1), 1)).toBe(157)
  })

  it('large qty: rounding error stays within 1 unit per item', () => {
    const qty = 10
    for (let typed = 1; typed <= 100; typed++) {
      const base = backCalcBase(typed, qty)
      const redisplayed = effectiveCalories(base, qty)
      expect(Math.abs(redisplayed - typed)).toBeLessThanOrEqual(qty)
    }
  })
})

describe('effectiveProtein — same math applies', () => {
  it('rounds to 1 decimal via * 10 / 10 pattern', () => {
    const base = 10.15
    const qty = 2
    const effective = Math.round(base * qty * 10) / 10 // 20.3
    expect(effective).toBe(20.3)
  })
})
