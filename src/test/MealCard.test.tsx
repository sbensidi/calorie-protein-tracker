import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MealCard } from '../components/MealCard'
import type { Meal } from '../types'

function fakeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    user_id: 'user-1',
    date: '2026-04-26',
    name: 'Chicken Breast',
    calories: 165,
    protein: 31,
    grams: 100,
    meal_type: 'lunch',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('MealCard (read mode)', () => {
  it('renders meal name', () => {
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument()
  })

  it('renders calorie value', () => {
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('165')).toBeInTheDocument()
  })

  it('renders protein value', () => {
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('31')).toBeInTheDocument()
  })

  it('shows grams for weight entries', () => {
    render(<MealCard meal={fakeMeal({ grams: 150 })} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    expect(screen.getByText('150g')).toBeInTheDocument()
  })

  it('shows ml for fluid entries', () => {
    render(
      <MealCard
        meal={fakeMeal({ fluid_ml: 350, fluid_excluded: false })}
        lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}}
      />
    )
    expect(screen.getByText('350ml')).toBeInTheDocument()
  })

  it('shows pcs for piece entries', () => {
    render(<MealCard meal={fakeMeal({ grams: -3 })} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    expect(screen.getByText(/3 pcs/)).toBeInTheDocument()
  })

  it('calls onToggleSelect when checkbox clicked', () => {
    const onToggle = vi.fn()
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={onToggle} onEdit={() => {}} />)
    fireEvent.click(document.querySelector('.cb')!)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('edit button is accessible with aria-label', () => {
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })
})

describe('MealCard (edit mode)', () => {
  it('shows edit form when edit button clicked', () => {
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByPlaceholderText(/food name/i)).toBeInTheDocument()
  })

  it('prefills name in edit form', () => {
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    const nameInput = screen.getByDisplayValue('Chicken Breast')
    expect(nameInput).toBeInTheDocument()
  })

  it('calls onEdit with updated values on save', () => {
    const onEdit = vi.fn()
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={onEdit} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByText(/save/i))
    expect(onEdit).toHaveBeenCalledWith('meal-1', expect.objectContaining({ name: 'Chicken Breast' }))
  })

  it('cancel restores read mode without calling onEdit', () => {
    const onEdit = vi.fn()
    render(<MealCard meal={fakeMeal()} lang="en" showCheckbox selected={false} onToggleSelect={() => {}} onEdit={onEdit} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByText(/cancel/i))
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument()
  })
})
