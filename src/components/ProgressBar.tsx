interface ProgressBarProps {
  value: number
  goal: number
  color: 'blue' | 'green'
}

export function ProgressBar({ value, goal, color }: ProgressBarProps) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0
  const realPct = goal > 0 ? Math.round((value / goal) * 100) : 0

  const badgeStyle =
    realPct >= 100
      ? { background: 'rgba(244,63,94,0.12)', color: '#f43f5e' }
      : realPct >= 80
      ? { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
      : { background: 'rgba(255,255,255,0.06)', color: 'var(--text-2)' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div
          className={color === 'blue' ? 'bar-blue' : 'bar-green'}
          style={{ height: '100%', width: `${pct}%`, borderRadius: 999 }}
        />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, minWidth: 36, textAlign: 'center', ...badgeStyle }}>
        {realPct}%
      </span>
    </div>
  )
}
