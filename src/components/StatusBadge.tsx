import type { Lang } from '../lib/i18n'

type Status = 'over' | 'under' | 'success'

interface StatusBadgeProps {
  status: Status
  text: string
  lang: Lang
}

const STYLE: Record<Status, { bg: string; color: string; icon: string }> = {
  over:    { bg: 'var(--red-select)',        color: 'var(--red)',      icon: 'arrow_upward'   },
  under:   { bg: 'var(--surface-3)',        color: 'var(--text-2)',   icon: 'arrow_downward' },
  success: { bg: 'var(--surface-3)',        color: 'var(--text-2)',   icon: 'arrow_downward' },
}

export function StatusBadge({ status, text, lang }: StatusBadgeProps) {
  const s = STYLE[status]
  const ariaLabel = lang === 'he'
    ? (status === 'over' ? 'חריגה: ' : 'נותר: ') + text
    : (status === 'over' ? 'Over: ' : 'Remaining: ') + text

  return (
    <span
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 10, fontWeight: 700,
        padding: '3px 8px', borderRadius: 999,
        background: s.bg, color: s.color,
        alignSelf: 'flex-start',
      }}
    >
      <span className="icon icon-sm" style={{ fontSize: 11 }}>{s.icon}</span>
      {text}
    </span>
  )
}
