import { describe, it, expect } from 'vitest'
import { toBase, fromBase, mlToGrams, gramsToMl, formatWeight, formatAmount, UNITS } from '../lib/units'

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

describe('UNITS registry', () => {
  it('all units have required fields', () => {
    for (const [id, def] of Object.entries(UNITS)) {
      expect(def.id, `${id}.id`).toBeTruthy()
      expect(def.toBase, `${id}.toBase`).toBeGreaterThan(0)
      expect(def.type, `${id}.type`).toMatch(/weight|volume/)
    }
  })
})
