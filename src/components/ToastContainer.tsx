import type { Toast } from '../hooks/useToast'

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
  lang: 'he' | 'en'
}

const ICONS: Record<Toast['type'], string> = {
  success: 'check_circle',
  error:   'error',
  info:    'info',
}

const COLORS: Record<Toast['type'], { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', icon: 'var(--green)' },
  error:   { bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.25)',  icon: 'var(--red)'   },
  info:    { bg: 'var(--surface-3)',       border: 'var(--border-hi)',      icon: 'var(--blue)'  },
}

export function ToastContainer({ toasts, onDismiss, lang }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(calc(100vw - 32px), 420px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 300,
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => {
        const c = COLORS[toast.type]
        return (
          <div
            key={toast.id}
            role="status"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 12,
              background: c.bg,
              border: `1px solid ${c.border}`,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              pointerEvents: 'all',
              animation: 'fadeUp 0.22s cubic-bezier(.22,.9,.36,1) both',
            }}
          >
            <span className="icon" style={{ fontSize: 18, color: c.icon, flexShrink: 0 }}>
              {ICONS[toast.type]}
            </span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
              {toast.message}
            </span>
            {toast.action && (
              <button
                onClick={() => { toast.action!.onClick(); onDismiss(toast.id) }}
                style={{
                  background: 'none', border: `1px solid ${c.border}`,
                  borderRadius: 8, cursor: 'pointer', padding: '3px 10px',
                  fontSize: 12, fontWeight: 700, color: c.icon,
                  flexShrink: 0, fontFamily: 'inherit',
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label={lang === 'he' ? 'סגור הודעה' : 'Dismiss'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 2, display: 'flex', color: 'var(--text-3)',
                flexShrink: 0,
              }}
            >
              <span className="icon icon-sm">close</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
