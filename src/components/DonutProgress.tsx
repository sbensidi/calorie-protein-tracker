import { memo } from 'react'
import type { ReactNode } from 'react'

interface DonutProgressProps {
  value:           number
  goal:            number
  type:            'calories' | 'protein' | 'fluid'
  size?:           number
  strokeWidth?:    number
  centerContent?:  ReactNode
}

export const DonutProgress = memo(function DonutProgress({ value, goal, type, size = 56, strokeWidth = 5, centerContent }: DonutProgressProps) {
  const pct     = goal > 0 ? Math.min(1, value / goal) : 0
  const realPct = goal > 0 ? Math.round((value / goal) * 100) : 0

  const r    = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * pct

  // ── Calories: green gradient until goal, red when over ──────────────
  // ── Protein:  red < 50%, amber 50-79%, bright green ≥ 100% ─────────

  let fillColor: string
  let glowColor: string

  if (type === 'calories') {
    if (realPct > 100) {
      fillColor = 'var(--red)'
      glowColor = 'rgba(244,63,94,0.35)'
    } else if (realPct >= 80) {
      // Close to goal — deeper green
      fillColor = 'var(--green-hi)'
      glowColor = 'rgba(16,185,129,0.35)'
    } else if (realPct >= 50) {
      // Mid range — medium green
      fillColor = 'var(--green)'
      glowColor = 'rgba(52,211,153,0.30)'
    } else {
      // Low — soft green
      fillColor = 'var(--green-soft)'
      glowColor = 'rgba(110,231,183,0.25)'
    }
  } else if (type === 'protein') {
    if (realPct >= 100) {
      fillColor = 'var(--green-hi)'
      glowColor = 'rgba(16,185,129,0.35)'
    } else if (realPct >= 50) {
      fillColor = 'var(--amber)'
      glowColor = 'rgba(245,158,11,0.30)'
    } else {
      fillColor = 'var(--red)'
      glowColor = 'rgba(244,63,94,0.35)'
    }
  } else {
    // fluid
    if (realPct >= 100) {
      fillColor = 'var(--green-hi)'
      glowColor = 'rgba(16,185,129,0.35)'
    } else {
      fillColor = 'var(--blue)'
      glowColor = 'rgba(59,130,246,0.30)'
    }
  }

  return (
    <div
      role="img"
      aria-label={`${type === 'calories' ? 'Calories' : type === 'protein' ? 'Protein' : 'Fluid'}: ${realPct}% of goal`}
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        aria-hidden="true"
        style={{ transform: 'rotate(-90deg)', display: 'block' }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={strokeWidth}
        />
        {/* Glow layer */}
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={glowColor}
            strokeWidth={strokeWidth + 3}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{
              filter: 'blur(3px)',
              transition: 'stroke-dasharray 0.7s cubic-bezier(.22,.9,.36,1), stroke 0.3s',
            }}
          />
        )}
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dasharray 0.7s cubic-bezier(.22,.9,.36,1), stroke 0.3s',
          }}
        />
      </svg>

      {/* Center content — custom or default % */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {centerContent ?? (
          <span style={{
            fontSize: size < 48 ? 9 : 10,
            fontWeight: 800,
            color: fillColor,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}>
            {realPct}%
          </span>
        )}
      </div>
    </div>
  )
})
