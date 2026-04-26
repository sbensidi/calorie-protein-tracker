import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DailySummary } from '../components/DailySummary'
import type { Meal } from '../types'

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: crypto.randomUUID(),
    user_id: 'user1',
    date: '2026-04-26',
    name: 'Test Food',
    calories: 200,
    protein: 20,
    grams: 100,
    meal_type: 'lunch',
    time_logged: '12:00:00',
    created_at: new Date().toISOString(),
    fluid_ml: null,
    fluid_excluded: false,
    ...overrides,
  }
}

describe('DailySummary', () => {
  const date = '2026-04-26'

  it('shows 0 calories when no meals', () => {
    render(<DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    // Both calories and protein show 0, so we expect at least two
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2)
  })

  it('sums calories across meals', () => {
    const meals = [meal({ calories: 300 }), meal({ calories: 250 })]
    render(<DailySummary meals={meals} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getByText('550')).toBeInTheDocument()
  })

  it('rounds protein to 1 decimal', () => {
    const meals = [meal({ protein: 10.333 }), meal({ protein: 5.167 })]
    render(<DailySummary meals={meals} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getByText('15.5')).toBeInTheDocument()
  })

  it('shows "left" text when under goal', () => {
    render(<DailySummary meals={[meal({ calories: 500 })]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    // both calories and protein show "left" when under goal
    expect(screen.getAllByText(/left/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows "over" text when exceeding goal', () => {
    render(<DailySummary meals={[meal({ calories: 2500 })]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getAllByText(/over/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows Hebrew labels when lang=he', () => {
    render(<DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="he" />)
    expect(screen.getByText('קלוריות')).toBeInTheDocument()
    expect(screen.getByText('חלבון')).toBeInTheDocument()
  })

  it('does not show fluid donut when no fluidGoalMl', () => {
    render(<DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.queryByText('Fluid')).not.toBeInTheDocument()
  })

  it('shows fluid donut when fluidGoalMl > 0', () => {
    render(
      <DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en"
        fluidGoalMl={2500} fluidTodayMl={0} />
    )
    expect(screen.getByText('Fluid')).toBeInTheDocument()
  })

  it('formats fluid in liters when >= 1000ml', () => {
    render(
      <DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en"
        fluidGoalMl={2500} fluidTodayMl={2500} />
    )
    // centerVal and centerGoal both show liter values
    expect(screen.getAllByText(/2\.5L/).length).toBeGreaterThanOrEqual(1)
  })
})
