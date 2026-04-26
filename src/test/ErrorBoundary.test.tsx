import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../components/ErrorBoundary'

function Boom(): never {
  throw new Error('test crash')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(<ErrorBoundary><p>ok</p></ErrorBoundary>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('renders fallback on error', () => {
    render(<ErrorBoundary lang="en"><Boom /></ErrorBoundary>)
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
  })

  it('shows label in error message when provided', () => {
    render(<ErrorBoundary lang="en" label="History"><Boom /></ErrorBoundary>)
    expect(screen.getByText(/Error in History/i)).toBeInTheDocument()
  })

  it('shows Hebrew error message for lang=he', () => {
    render(<ErrorBoundary lang="he" label="היסטוריה"><Boom /></ErrorBoundary>)
    expect(screen.getByText(/משהו השתבש/i)).toBeInTheDocument()
  })

  it('shows retry and reload buttons', () => {
    render(<ErrorBoundary lang="en"><Boom /></ErrorBoundary>)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('resets to children after retry click', () => {
    let shouldThrow = true
    function Conditional() {
      if (shouldThrow) throw new Error('boom')
      return <p>recovered</p>
    }
    render(<ErrorBoundary lang="en"><Conditional /></ErrorBoundary>)
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<p>custom fallback</p>}>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('custom fallback')).toBeInTheDocument()
  })
})
