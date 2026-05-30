import { describe, it, expect } from 'vitest'
import { toBase, fromBase, mlToGrams, gramsToMl, formatWeight, formatAmount, UNITS, formatIngredientDisplay } from '../lib/units'
import type { RecipeIngredient } from '../types'

function fakeIng(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { name: 'Test', grams: 100, calories: 200, protein: 10, ...overrides }
}

describe('toBase()', () => {
  it('grams are identity', () => expect(toBase(100, 'g')).toBe(100))
  it('converts oz to grams', () => expect(toBase(1, 'oz')).toBeCloseTo(28.35, 1))
  it('ml are identity', () => expect(toBase(250, 'ml')).toBe(250))
  it('converts cup to ml', () => expect(toBase(1, 'cup')).toBe(240))
  it('converts tbsp to ml', () => expect(toBase(1, 'tbsp')).toBeCloseTo(14.79, 1))
})

describe('fromBase()', () => {
  it('grams to grams is identity', () => expect(fromBase(100, 'g')).toBe(100))
  it('converts grams to oz', () => expect(fromBase(28.3495, 'oz')).toBeCloseTo(1, 2))
  it('converts ml to cups', () => expect(fromBase(240, 'cup')).toBe(1))
})

describe('toBase / fromBase roundtrip', () => {
  const units = ['g', 'oz', 'ml', 'cup', 'tbsp', 'tsp', 'fl_oz'] as const
  for (const unit of units) {
    it(`round-trips ${unit}`, () => {
      const original = 3.5
      expect(fromBase(toBase(original, unit), unit)).toBeCloseTo(original, 5)
    })
  }
})

describe('mlToGrams() / gramsToMl()', () => {
  it('water density 1: ml equals grams', () => {
    expect(mlToGrams(100, 1)).toBe(100)
    expect(gramsToMl(100, 1)).toBe(100)
  })

  it('oil density 0.92: 100ml = 92g', () => {
    expect(mlToGrams(100, 0.92)).toBeCloseTo(92, 5)
  })

  it('roundtrips', () => {
    const density = 1.05
    expect(gramsToMl(mlToGrams(200, density), density)).toBeCloseTo(200, 5)
  })
})

describe('formatWeight()', () => {
  it('formats grams', () => expect(formatWeight(85, 'g')).toBe('85g'))
  it('rounds grams', () => expect(formatWeight(85.6, 'g')).toBe('86g'))
  it('formats oz', () => expect(formatWeight(28.3495, 'oz')).toBe('1 oz'))
  it('defaults to grams', () => expect(formatWeight(100)).toBe('100g'))
})

describe('formatAmount()', () => {
  it('formats g in English', () => expect(formatAmount(100, 'g', 'en')).toBe('100 g'))
  it('formats cup in Hebrew', () => expect(formatAmount(1, 'cup', 'he')).toBe('1 כוס'))
  it('rounds fractional units to 1 decimal', () => expect(formatAmount(1.55, 'tbsp', 'en')).toBe('1.6 tbsp'))
})

describe('formatIngredientDisplay()', () => {
  it('grams fallback — returns grams + ג׳ unit', () => {
    const { amount, unit } = formatIngredientDisplay(fakeIng({ grams: 150 }), 'he')
    expect(amount).toBe(150)
    expect(unit).toBe("ג׳")
  })

  it('grams fallback — English', () => {
    const { amount, unit } = formatIngredientDisplay(fakeIng({ grams: 150 }), 'en')
    expect(amount).toBe(150)
    expect(unit).toBe('g')
  })

  it('pcs — negative grams → absolute value + מנה', () => {
    const { amount, unit } = formatIngredientDisplay(fakeIng({ grams: -2 }), 'he')
    expect(amount).toBe(2)
    expect(unit).toBe('מנה')
  })

  it('pcs — English', () => {
    const { amount, unit } = formatIngredientDisplay(fakeIng({ grams: -1 }), 'en')
    expect(amount).toBe(1)
    expect(unit).toBe('serving')
  })

  it('display_unit tbsp — uses display_amount + כף', () => {
    const { amount, unit } = formatIngredientDisplay(
      fakeIng({ grams: 15, display_amount: 1, display_unit: 'tbsp' }), 'he'
    )
    expect(amount).toBe(1)
    expect(unit).toBe('כף')
  })

  it('display_unit cup — English', () => {
    const { amount, unit } = formatIngredientDisplay(
      fakeIng({ grams: 240, display_amount: 1, display_unit: 'cup' }), 'en'
    )
    expect(amount).toBe(1)
    expect(unit).toBe('cup')
  })

  it('fluid — uses fluid_ml + מ"ל', () => {
    const { amount, unit } = formatIngredientDisplay(
      fakeIng({ grams: 0, fluid_ml: 240 }), 'he'
    )
    expect(amount).toBe(240)
    expect(unit).toBe('מ"ל')
  })

  it('zero grams, no display — returns 0 + grams unit', () => {
    const { amount, unit } = formatIngredientDisplay(fakeIng({ grams: 0 }), 'he')
    expect(amount).toBe(0)
    expect(unit).toBe("ג׳")
  })

  it('unknown display_unit — falls back to raw string', () => {
    const { amount, unit } = formatIngredientDisplay(
      fakeIng({ grams: 10, display_amount: 2, display_unit: 'custom' }), 'en'
    )
    expect(amount).toBe(2)
    expect(unit).toBe('custom')
  })
})

describe('UNITS registry', () => {
  it('all units have required fields', () => {
    for (const [id, def] of Object.entries(UNITS)) {
      expect(def.id, `${id}.id`).toBeTruthy()
      expect(def.toBase, `${id}.toBase`).toBeGreaterThan(0)
      expect(def.type, `${id}.type`).toMatch(/weight|volume/)
    }
  })
})
