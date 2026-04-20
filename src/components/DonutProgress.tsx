interface DonutProgressProps {
  value:       number
  goal:        number
  color:       'blue' | 'green'
  size?:       number
  strokeWidth?: number
}

export function DonutProgress({ value, goal, color, size = 56, strokeWidth = 5 }: DonutProgressProps) {
  const pct     = goal > 0 ? Math.min(1, value / goal) : 0
  const realPct = goal > 0 ? Math.round((value / goal) * 100) : 0

  const r    = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * pct

  const isOver  = realPct >= 100
  const isClose = !isOver && realPct >= 80

  const fillColor = isOver
    ? 'var(--red)'
    : isClose
    ? 'var(--amber)'
    : color === 'blue'
    ? 'var(--blue-hi)'
    : 'var(--green-hi)'

  const glowColor = isOver
    ? 'rgba(244,63,94,0.35)'
    : isClose
    ? 'rgba(245,158,11,0.30)'
    : color === 'blue'
    ? 'rgba(59,130,246,0.30)'
    : 'rgba(16,185,129,0.30)'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', display: 'block' }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
        />
        {/* Glow layer (slightly thicker, blurred) */}
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

      {/* Percentage label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: size < 48 ? 9 : 10,
          fontWeight: 800,
          color: fillColor,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}>
          {realPct}%
        </span>
      </div>
    </div>
  )
}
