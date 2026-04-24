import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface ClearableInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Called when the user clicks the ✕ button */
  onClear: () => void
  /** Icon shown on the inline-start side (e.g. 'search'). Optional. */
  startIcon?: string
  /** RTL mode — flips clear button and start icon sides */
  isRTL?: boolean
}

/**
 * An <input> with an optional leading icon and a ✕ clear button that
 * appears whenever the field has a non-empty value.
 *
 * The wrapper is `position: relative` so the parent doesn't need to be.
 */
export const ClearableInput = forwardRef<HTMLInputElement, ClearableInputProps>(
  function ClearableInput({ onClear, startIcon, isRTL = false, value, style, className, ...rest }, ref) {
    const hasValue = value !== '' && value != null

    return (
      <div style={{ position: 'relative' }}>
        {startIcon && (
          <span
            className="icon icon-sm"
            style={{
              position: 'absolute',
              top: '50%', transform: 'translateY(-50%)',
              ...(isRTL ? { right: 10 } : { left: 10 }),
              color: 'var(--text-3)',
              pointerEvents: 'none',
            }}
          >
            {startIcon}
          </span>
        )}
        <input
          ref={ref}
          value={value}
          className={`inp${className ? ` ${className}` : ''}`}
          style={{
            ...(startIcon
              ? (isRTL ? { paddingRight: 36 } : { paddingLeft: 36 })
              : {}),
            ...(hasValue
              ? (isRTL ? { paddingLeft: 32 } : { paddingRight: 32 })
              : {}),
            ...style,
          }}
          {...rest}
        />
        {hasValue && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onClear() }}
            tabIndex={-1}
            style={{
              position: 'absolute',
              ...(isRTL ? { left: 0 } : { right: 0 }),
              top: 0, bottom: 0, width: 32,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        )}
      </div>
    )
  }
)
