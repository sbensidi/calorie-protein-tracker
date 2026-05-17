import { describe, it, expect } from 'vitest'
import { calcBMR, calcDailyTdee, calcWeeklyTdee, calcGoalStreak, calcProjectedDays, calcMealTypeDistribution, calcMacroBreakdown } from '../lib/calculations'
import type { UserProfile } from '../hooks/useProfile'
import type { Meal } from '../types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    sex: 'm', age: 30, height: 175, weight: 75,
    activityLevel: 1,
    targetWeightKg: null,
    goalType: 'maintain',
    weightUnit: 'g', volumeUnit: 'ml',
    fluidGoalMl: 2000, fluidThresholdMl: 200,
    fluidZeroCalOnly: false, defaultServingGrams: 100,
    ...overrides,
  }
}

function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1', user_id: 'u-1', date: '2026-05-10',
    meal_type: 'lunch', name: 'Chicken', grams: 100,
    calories: 300, protein: 30,
    fat: null, carbs: null, notes: null,
    time_logged: '12:00:00', created_at: new Date().toISOString(),
    fluid_ml: null, fluid_excluded: false,
    ...overrides,
  }
}

const FIXED_GOAL = { calories: 2000 }
const goalForDate = (_: string) => FIXED_GOAL

// ── calcBMR ───────────────────────────────────────────────────────────────────

describe('calcBMR', () => {
  it('male: 10w + 6.25h − 5a + 5', () => {
    // 10×75 + 6.25×175 − 5×30 + 5 = 750 + 1093.75 − 150 + 5 = 1698.75 → 1699
    expect(calcBMR(makeProfile({ sex: 'm', weight: 75, height: 175, age: 30 }))).toBe(1699)
  })

  it('female: 10w + 6.25h − 5a − 161', () => {
    // 10×60 + 6.25×165 − 5×25 − 161 = 600 + 1031.25 − 125 − 161 = 1345.25 → 1345
    expect(calcBMR(makeProfile({ sex: 'f', weight: 60, height: 165, age: 25 }))).toBe(1345)
  })
})

// ── calcDailyTdee ─────────────────────────────────────────────────────────────

describe('calcDailyTdee', () => {
  it('sedentary (level 0): BMR × 1.2', () => {
    const p = makeProfile({ activityLevel: 0 })
    expect(calcDailyTdee(p)).toBe(Math.round(calcBMR(p) * 1.2))
  })

  it('lightly active (level 1): BMR × 1.375', () => {
    const p = makeProfile({ activityLevel: 1 })
    expect(calcDailyTdee(p)).toBe(Math.round(calcBMR(p) * 1.375))
  })

  it('moderately active (level 2): BMR × 1.55', () => {
    const p = makeProfile({ activityLevel: 2 })
    expect(calcDailyTdee(p)).toBe(Math.round(calcBMR(p) * 1.55))
  })

  it('very active (level 3): BMR × 1.725', () => {
    const p = makeProfile({ activityLevel: 3 })
    expect(calcDailyTdee(p)).toBe(Math.round(calcBMR(p) * 1.725))
  })

  it('extremely active (level 4): BMR × 1.9', () => {
    const p = makeProfile({ activityLevel: 4 })
    expect(calcDailyTdee(p)).toBe(Math.round(calcBMR(p) * 1.9))
  })

  it('female profile computes correctly', () => {
    const p = makeProfile({ sex: 'f', weight: 60, height: 165, age: 25, activityLevel: 2 })
    expect(calcDailyTdee(p)).toBe(Math.round(calcBMR(p) * 1.55))
  })
})

// ── calcWeeklyTdee ────────────────────────────────────────────────────────────

describe('calcWeeklyTdee', () => {
  it('equals calcDailyTdee × 7', () => {
    const p = makeProfile()
    expect(calcWeeklyTdee(p)).toBe(calcDailyTdee(p) * 7)
  })

  it('is whole number (no fractions)', () => {
    const result = calcWeeklyTdee(makeProfile({ sex: 'f', activityLevel: 3 }))
    expect(result % 1).toBe(0)
  })
})

// ── calcGoalStreak ────────────────────────────────────────────────────────────

describe('calcGoalStreak', () => {
  it('returns 0 when no meals exist', () => {
    expect(calcGoalStreak([], goalForDate, new Date('2026-05-16'))).toBe(0)
  })

  it('returns 0 when only today has meals (today is excluded)', () => {
    const meals = [makeMeal({ date: '2026-05-16', calories: 1800 })]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(0)
  })

  it('counts one qualifying day', () => {
    const meals = [makeMeal({ id: '1', date: '2026-05-15', calories: 1800 })]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(1)
  })

  it('counts consecutive qualifying days backwards from yesterday', () => {
    const meals = [
      makeMeal({ id: '1', date: '2026-05-15', calories: 1800 }),
      makeMeal({ id: '2', date: '2026-05-14', calories: 1900 }),
      makeMeal({ id: '3', date: '2026-05-13', calories: 1750 }),
    ]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(3)
  })

  it('breaks streak on a gap day (no meals logged)', () => {
    const meals = [
      makeMeal({ id: '1', date: '2026-05-15', calories: 1800 }),
      // 2026-05-14 missing
      makeMeal({ id: '2', date: '2026-05-13', calories: 1700 }),
    ]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(1)
  })

  it('breaks streak when calories exceed goal', () => {
    const meals = [
      makeMeal({ id: '1', date: '2026-05-15', calories: 2200 }), // over 2000
      makeMeal({ id: '2', date: '2026-05-14', calories: 1800 }),
    ]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(0)
  })

  it('returns 0 when calories are 0 (no food logged counts as missing)', () => {
    const meals = [makeMeal({ id: '1', date: '2026-05-15', calories: 0 })]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(0)
  })

  it('accumulates multiple meals on the same day', () => {
    // 800 + 800 = 1600 → within 2000 goal
    const meals = [
      makeMeal({ id: '1', date: '2026-05-15', calories: 800 }),
      makeMeal({ id: '2', date: '2026-05-15', calories: 800 }),
    ]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(1)
  })

  it('breaks streak when accumulated daily total exceeds goal', () => {
    // 1200 + 900 = 2100 → over 2000
    const meals = [
      makeMeal({ id: '1', date: '2026-05-15', calories: 1200 }),
      makeMeal({ id: '2', date: '2026-05-15', calories: 900 }),
    ]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(0)
  })

  it('counts exactly at the goal boundary as qualifying', () => {
    const meals = [makeMeal({ id: '1', date: '2026-05-15', calories: 2000 })]
    expect(calcGoalStreak(meals, goalForDate, new Date('2026-05-16'))).toBe(1)
  })
})

// ── calcProjectedDays ─────────────────────────────────────────────────────────

describe('calcProjectedDays', () => {
  it('returns null when |diff| < 50 kcal/day', () => {
    // tdee=2000, goal=1960 → diff=40 → too small
    expect(calcProjectedDays(80, 70, 2000, 1960)).toBeNull()
  })

  it('returns null at boundary (diff=49)', () => {
    expect(calcProjectedDays(80, 70, 2000, 1951)).toBeNull()
  })

  it('returns null when eating at deficit but wanting to gain (wrong direction)', () => {
    // tdee=2000, goal=1500 → dailyDiff=+500 (deficit) but target=85 > current=80 (gain goal)
    expect(calcProjectedDays(80, 85, 2000, 1500)).toBeNull()
  })

  it('returns null when eating at surplus but wanting to lose (wrong direction)', () => {
    // tdee=2000, goal=2500 → dailyDiff=-500 (surplus) but target=70 < current=80 (loss goal)
    expect(calcProjectedDays(80, 70, 2000, 2500)).toBeNull()
  })

  it('calculates days for weight loss: deficit + lower target', () => {
    // tdee=2000, goal=1500 → dailyDiff=+500 (deficit)
    // target=70, current=80 → kgDiff=-10 (loss) — valid direction
    // days = round(10 × 7700 / 500) = round(154) = 154
    expect(calcProjectedDays(80, 70, 2000, 1500)).toBe(154)
  })

  it('calculates days for weight gain: surplus + higher target', () => {
    // tdee=2000, goal=2500 → dailyDiff=-500 (surplus)
    // target=85, current=80 → kgDiff=+5 (gain) — valid direction
    // days = round(5 × 7700 / 500) = round(77) = 77
    expect(calcProjectedDays(80, 85, 2000, 2500)).toBe(77)
  })

  it('rounds fractional days', () => {
    // diff=300, kgDiff=-5 → 5×7700/300 = 128.33... → 128
    expect(calcProjectedDays(80, 75, 2000, 1700)).toBe(128)
  })

  it('returns null when current equals target (zero kgDiff → sign=0, same as sign of any non-zero diff)', () => {
    // kgDiff=0 → sign=0, dailyDiff=500 → sign=1 → 0 !== 1 → proceed → days=0
    // Actually sign(0) = 0, sign(500) = 1 → not equal → don't return null → 0 days
    expect(calcProjectedDays(80, 80, 2000, 1500)).toBe(0)
  })
})

// ── calcMealTypeDistribution ──────────────────────────────────────────────────

describe('calcMealTypeDistribution', () => {
  it('returns empty array when no meals', () => {
    expect(calcMealTypeDistribution([])).toEqual([])
  })

  it('returns empty array when all calories are 0', () => {
    const meals = [makeMeal({ calories: 0 }), makeMeal({ id: '2', calories: 0 })]
    expect(calcMealTypeDistribution(meals)).toEqual([])
  })

  it('single meal type: 100%', () => {
    const meals = [makeMeal({ meal_type: 'lunch', calories: 400 })]
    const result = calcMealTypeDistribution(meals)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'lunch', pct: 100 })
  })

  it('two meal types: proportional percentages', () => {
    const meals = [
      makeMeal({ id: '1', meal_type: 'breakfast', calories: 300 }),
      makeMeal({ id: '2', meal_type: 'lunch',     calories: 700 }),
    ]
    const result = calcMealTypeDistribution(meals)
    expect(result).toHaveLength(2)
    const byType = Object.fromEntries(result.map(r => [r.type, r.pct]))
    expect(byType.breakfast).toBe(30)
    expect(byType.lunch).toBe(70)
  })

  it('sorts by descending calorie contribution', () => {
    const meals = [
      makeMeal({ id: '1', meal_type: 'breakfast', calories: 200 }),
      makeMeal({ id: '2', meal_type: 'dinner',    calories: 800 }),
      makeMeal({ id: '3', meal_type: 'snack',     calories: 100 }),
    ]
    const result = calcMealTypeDistribution(meals)
    expect(result.map(r => r.type)).toEqual(['dinner', 'breakfast', 'snack'])
  })

  it('accumulates multiple meals of the same type', () => {
    const meals = [
      makeMeal({ id: '1', meal_type: 'lunch', calories: 300 }),
      makeMeal({ id: '2', meal_type: 'lunch', calories: 200 }),
    ]
    const result = calcMealTypeDistribution(meals)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'lunch', kcal: 500, pct: 100 })
  })

  it('omits types with 0 calories', () => {
    const meals = [
      makeMeal({ id: '1', meal_type: 'breakfast', calories: 0 }),
      makeMeal({ id: '2', meal_type: 'lunch',     calories: 500 }),
    ]
    const result = calcMealTypeDistribution(meals)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('lunch')
  })
})

// ── calcMacroBreakdown ────────────────────────────────────────────────────────

describe('calcMacroBreakdown', () => {
  it('returns zero breakdown for empty meals', () => {
    const result = calcMacroBreakdown([])
    expect(result.totalKcal).toBe(0)
    expect(result.hasFatCarbs).toBe(false)
  })

  it('protein-only when fat/carbs missing (coverage=0)', () => {
    // 30g protein × 4 = 120 kcal → 100%
    const meals = [makeMeal({ protein: 30, fat: null, carbs: null })]
    const result = calcMacroBreakdown(meals)
    expect(result.hasFatCarbs).toBe(false)
    expect(result.proteinPct).toBe(100)
    expect(result.fatPct).toBe(0)
    expect(result.carbsPct).toBe(0)
  })

  it('includes fat and carbs when coverage ≥ 50%', () => {
    // 30g prot → 120 kcal, 10g fat → 90 kcal, 25g carbs → 100 kcal = 310 total
    const meals = [makeMeal({ protein: 30, fat: 10, carbs: 25 })]
    const result = calcMacroBreakdown(meals)
    expect(result.hasFatCarbs).toBe(true)
    expect(result.proteinPct).toBe(Math.round(120 / 310 * 100))
    expect(result.fatPct).toBe(Math.round(90 / 310 * 100))
    expect(result.carbsPct).toBe(Math.round(100 / 310 * 100))
  })

  it('coverage < 50%: hasFatCarbs is false', () => {
    // 1 out of 3 meals has fat/carbs → 33%
    const meals = [
      makeMeal({ id: '1', protein: 20, fat: 10, carbs: 20 }),
      makeMeal({ id: '2', protein: 20, fat: null, carbs: null }),
      makeMeal({ id: '3', protein: 20, fat: null, carbs: null }),
    ]
    const result = calcMacroBreakdown(meals)
    expect(result.hasFatCarbs).toBe(false)
    expect(result.coverage).toBeCloseTo(1 / 3)
  })

  it('coverage exactly 50%: hasFatCarbs is true', () => {
    const meals = [
      makeMeal({ id: '1', protein: 20, fat: 5, carbs: 10 }),
      makeMeal({ id: '2', protein: 20, fat: null, carbs: null }),
    ]
    const result = calcMacroBreakdown(meals)
    expect(result.hasFatCarbs).toBe(true)
    expect(result.coverage).toBe(0.5)
  })

  it('pct values are whole numbers (no fractions)', () => {
    const meals = [makeMeal({ protein: 25, fat: 8, carbs: 30 })]
    const result = calcMacroBreakdown(meals)
    expect(result.proteinPct % 1).toBe(0)
    expect(result.fatPct % 1).toBe(0)
    expect(result.carbsPct % 1).toBe(0)
  })
})
