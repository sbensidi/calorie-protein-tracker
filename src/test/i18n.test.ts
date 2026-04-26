import { describe, it, expect } from 'vitest'
import { t, dir, formatDate, today, translations } from '../lib/i18n'

describe('t()', () => {
  it('returns Hebrew string for he', () => {
    expect(t('he', 'calories')).toBe('קלוריות')
  })

  it('returns English string for en', () => {
    expect(t('en', 'calories')).toBe('Calories')
  })

  it('returns correct unit labels', () => {
    expect(t('he', 'caloriesUnit')).toBe('קק״ל')
    expect(t('en', 'caloriesUnit')).toBe('kcal')
    expect(t('he', 'proteinUnit')).toBe('ג׳')
    expect(t('en', 'proteinUnit')).toBe('g')
  })

  it('covers all keys symmetrically between he and en', () => {
    const heKeys = Object.keys(translations.he)
    const enKeys = Object.keys(translations.en)
    expect(heKeys.sort()).toEqual(enKeys.sort())
  })

  it('has no empty string values', () => {
    for (const [key, val] of Object.entries(translations.he)) {
      expect(val, `he.${key} is empty`).not.toBe('')
    }
    for (const [key, val] of Object.entries(translations.en)) {
      expect(val, `en.${key} is empty`).not.toBe('')
    }
  })
})

describe('dir()', () => {
  it('returns rtl for Hebrew', () => expect(dir('he')).toBe('rtl'))
  it('returns ltr for English', () => expect(dir('en')).toBe('ltr'))
})

describe('formatDate()', () => {
  it('formats in English', () => {
    const result = formatDate('2026-04-26', 'en')
    expect(result).toContain('2026')
    expect(result).toContain('April')
  })

  it('formats in Hebrew', () => {
    const result = formatDate('2026-04-26', 'he')
    expect(result).toContain('אפריל')
    expect(result).toContain('2026')
  })
})

describe('today()', () => {
  it('returns ISO date string YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches current date', () => {
    const now = new Date()
    const y   = now.getFullYear()
    const m   = String(now.getMonth() + 1).padStart(2, '0')
    const d   = String(now.getDate()).padStart(2, '0')
    expect(today()).toBe(`${y}-${m}-${d}`)
  })
})
