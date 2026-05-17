import type { UserProfile } from '../hooks/useProfile'
import type { Meal } from '../types'

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
