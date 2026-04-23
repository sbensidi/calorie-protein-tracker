import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 120,
            padding: '24px 16px',
            gap: 10,
          }}
        >
          <span className="icon" style={{ fontSize: 28, color: 'var(--red)' }}>error</span>
          <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', margin: 0 }}>
            משהו השתבש. נסה לרענן את הדף.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 4, fontSize: 13 }}
            onClick={() => window.location.reload()}
          >
            רענן
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
