import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DailySummary } from '../components/DailySummary'
import { AppProvider } from '../context/AppContext'
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

function wrap(ui: React.ReactElement) {
  return render(<AppProvider>{ui}</AppProvider>)
}

describe('DailySummary', () => {
  const date = '2026-04-26'

  it('shows 0 calories when no meals', () => {
    wrap(<DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2)
  })

  it('sums calories across meals', () => {
    const meals = [meal({ calories: 300 }), meal({ calories: 250 })]
    wrap(<DailySummary meals={meals} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getByText('550')).toBeInTheDocument()
  })

  it('rounds protein to 1 decimal', () => {
    const meals = [meal({ protein: 10.333 }), meal({ protein: 5.167 })]
    wrap(<DailySummary meals={meals} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getByText('15.5')).toBeInTheDocument()
  })

  it('shows "left" text when under goal', () => {
    wrap(<DailySummary meals={[meal({ calories: 500 })]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getAllByText(/left/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows "over" text when exceeding goal', () => {
    wrap(<DailySummary meals={[meal({ calories: 2500 })]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.getAllByText(/over/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows Hebrew labels when lang=he', () => {
    wrap(<DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="he" />)
    expect(screen.getByText('קלוריות')).toBeInTheDocument()
    expect(screen.getByText('חלבון')).toBeInTheDocument()
  })

  it('does not show fluid donut when no fluidGoalMl', () => {
    wrap(<DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en" />)
    expect(screen.queryByText('Fluid')).not.toBeInTheDocument()
  })

  it('shows fluid donut when fluidGoalMl > 0', () => {
    wrap(
      <DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en"
        fluidGoalMl={2500} fluidTodayMl={0} />
    )
    expect(screen.getByText('Fluid')).toBeInTheDocument()
  })

  it('formats fluid in liters when >= 1000ml', () => {
    wrap(
      <DailySummary meals={[]} date={date} goalCalories={2000} goalProtein={150} lang="en"
        fluidGoalMl={2500} fluidTodayMl={2500} />
    )
    expect(screen.getAllByText(/2\.5L/).length).toBeGreaterThanOrEqual(1)
  })
})
