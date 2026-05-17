import type { UserProfile } from '../hooks/useProfile'
import type { Meal } from '../types'

const TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'beverage'] as const

export interface MealTypeSlice {
  type: string
  kcal: number
  pct: number
}

export interface MacroBreakdown {
  proteinPct: number
  fatPct: number
  carbsPct: number
  totalKcal: number
  hasFatCarbs: boolean
  coverage: number
}

const ACTIVITY_MULTIPLIERS = [1.2, 1.375, 1.55, 1.725, 1.9]

export function calcBMR(p: UserProfile): number {
  return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161))
}

export function calcDailyTdee(p: UserProfile): number {
  return Math.round(calcBMR(p) * (ACTIVITY_MULTIPLIERS[p.activityLevel] ?? 1.375))
}

export function calcWeeklyTdee(p: UserProfile): number {
  return calcDailyTdee(p) * 7
}

/**
 * Count consecutive days backwards from the day before `referenceDate`
 * where meals were logged (calories > 0) and calories stayed within the goal.
 * Stops at the first gap or day over goal.
 */
export function calcGoalStreak(
  meals: Meal[],
  getGoalForDate: (date: string) => { calories: number },
  referenceDate: Date = new Date(),
): number {
  const byDate = new Map<string, number>()
  meals.forEach(m => { byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.calories) })

  let streak = 0
  const d = new Date(referenceDate)
  d.setDate(d.getDate() - 1)

  for (let i = 0; i < 90; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const cal  = byDate.get(key) ?? 0
    const goal = getGoalForDate(key).calories
    if (cal > 0 && cal <= goal) {
      streak++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

/**
 * Groups meals by meal_type and returns each type's share of total calories,
 * sorted by descending calorie contribution. Types with 0 calories are omitted.
 */
export function calcMealTypeDistribution(meals: Meal[]): MealTypeSlice[] {
  const totals: Record<string, number> = {}
  for (const m of meals) {
    totals[m.meal_type] = (totals[m.meal_type] ?? 0) + m.calories
  }
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0)
  if (grandTotal === 0) return []
  return TYPE_ORDER
    .filter(type => (totals[type] ?? 0) > 0)
    .map(type => ({ type, kcal: totals[type], pct: Math.round((totals[type] / grandTotal) * 100) }))
    .sort((a, b) => b.kcal - a.kcal)
}

/**
 * Computes macro percentages (protein/fat/carbs as % of total kcal from macros).
 * Fat and carbs are only included when at least 50% of meals have those values.
 * Returns coverage = fraction of meals with fat+carbs data.
 */
export function calcMacroBreakdown(meals: Meal[]): MacroBreakdown {
  if (meals.length === 0) return { proteinPct: 0, fatPct: 0, carbsPct: 0, totalKcal: 0, hasFatCarbs: false, coverage: 0 }
  const withFatCarbs = meals.filter(m => m.fat != null && m.carbs != null)
  const coverage = withFatCarbs.length / meals.length
  const hasFatCarbs = coverage >= 0.5

  const source = hasFatCarbs ? withFatCarbs : meals
  const protKcal  = source.reduce((s, m) => s + m.protein * 4, 0)
  const fatKcal   = hasFatCarbs ? source.reduce((s, m) => s + (m.fat ?? 0) * 9, 0) : 0
  const carbKcal  = hasFatCarbs ? source.reduce((s, m) => s + (m.carbs ?? 0) * 4, 0) : 0
  const totalKcal = protKcal + fatKcal + carbKcal

  if (totalKcal === 0) return { proteinPct: 0, fatPct: 0, carbsPct: 0, totalKcal: 0, hasFatCarbs, coverage }
  return {
    proteinPct: Math.round((protKcal / totalKcal) * 100),
    fatPct:     Math.round((fatKcal  / totalKcal) * 100),
    carbsPct:   Math.round((carbKcal / totalKcal) * 100),
    totalKcal,
    hasFatCarbs,
    coverage,
  }
}

/**
 * Returns the number of days to reach `targetWeight` from `currentWeight`
 * given a daily TDEE and daily calorie goal, or null if the direction
 * doesn't match the deficit/surplus or the difference is too small (<50 kcal/day).
 */
export function calcProjectedDays(
  currentWeight: number,
  targetWeight: number,
  tdeeDaily: number,
  dailyCalGoal: number,
): number | null {
  const dailyDiff = tdeeDaily - dailyCalGoal
  const kgDiff    = targetWeight - currentWeight
  if (Math.abs(dailyDiff) < 50) return null
  // Valid only when directions align: deficit (dailyDiff>0) + want to lose (kgDiff<0),
  // or surplus (dailyDiff<0) + want to gain (kgDiff>0). Same sign = wrong direction.
  if (Math.sign(dailyDiff) === Math.sign(kgDiff)) return null
  return Math.round(Math.abs(kgDiff) * 7700 / Math.abs(dailyDiff))
}
