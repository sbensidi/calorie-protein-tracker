import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import type { Lang } from '../lib/i18n'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  label?: string
  lang?: Lang
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
    console.error('[ErrorBoundary]', this.props.label ?? 'unknown', error, info)
  }

  reset() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const isHe = this.props.lang === 'he'
      const label = this.props.label
      const msg = isHe
        ? `${label ? `שגיאה ב${label}. ` : ''}משהו השתבש.`
        : `${label ? `Error in ${label}. ` : ''}Something went wrong.`
      const retry  = isHe ? 'נסה שוב' : 'Try again'
      const reload = isHe ? 'רענן דף' : 'Reload'

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
            {msg}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              className="btn-primary"
              style={{ fontSize: 13 }}
              onClick={() => this.reset()}
            >
              {retry}
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: 13 }}
              onClick={() => window.location.reload()}
            >
              {reload}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
