import { memo } from 'react'
import type { ReactNode } from 'react'

interface DonutProgressProps {
  value:           number
  goal:            number
  type:            'calories' | 'protein' | 'fluid'
  lang?:           'he' | 'en'
  size?:           number
  strokeWidth?:    number
  centerContent?:  ReactNode
  style?:          React.CSSProperties
}

export const DonutProgress = memo(function DonutProgress({ value, goal, type, lang = 'en', size = 56, strokeWidth = 5, centerContent, style }: DonutProgressProps) {
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
      fillColor = 'var(--danger)'
      glowColor = 'var(--danger-border)'
    } else if (realPct >= 80) {
      // Close to goal — deeper green
      fillColor = 'var(--positive-hi)'
      glowColor = 'var(--positive-border)'
    } else if (realPct >= 50) {
      // Mid range — medium green
      fillColor = 'var(--positive)'
      glowColor = 'var(--positive-glow)'
    } else {
      // Low — soft green
      fillColor = 'var(--positive-soft)'
      glowColor = 'var(--positive-glow)'
    }
  } else if (type === 'protein') {
    if (realPct >= 100) {
      fillColor = 'var(--positive-hi)'
      glowColor = 'var(--positive-border)'
    } else if (realPct >= 50) {
      fillColor = 'var(--positive)'
      glowColor = 'var(--positive-glow)'
    } else {
      fillColor = 'var(--positive-soft)'
      glowColor = 'var(--positive-glow)'
    }
  } else {
    // fluid
    if (realPct >= 100) {
      fillColor = 'var(--positive-hi)'
      glowColor = 'var(--positive-border)'
    } else {
      fillColor = 'var(--accent)'
      glowColor = 'var(--accent-glow)'
    }
  }

  return (
    <div
      role="img"
      aria-label={
        lang === 'he'
          ? `${type === 'calories' ? 'קלוריות' : type === 'protein' ? 'חלבון' : 'נוזלים'}: ${realPct}% מהיעד`
          : `${type === 'calories' ? 'Calories' : type === 'protein' ? 'Protein' : 'Fluid'}: ${realPct}% of goal`
      }
      style={{ position: 'relative', width: size, height: size, flexShrink: 0, ...style }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        height="100%"
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
            strokeWidth={strokeWidth + 3}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{
              stroke: glowColor,
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
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{
            stroke: fillColor,
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
