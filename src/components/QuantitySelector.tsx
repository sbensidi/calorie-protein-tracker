import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'

interface QuantitySelectorProps {
  qty: number
  onChange: (qty: number) => void
  lang: Lang
}

export function QuantitySelector({ qty, onChange, lang }: QuantitySelectorProps) {
  const dec = () => onChange(Math.max(0.5, Math.round((qty - 0.5) * 10) / 10))
  const inc = () => onChange(Math.round((qty + 0.5) * 10) / 10)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{t(lang, 'quantity')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', minWidth: 38, textAlign: 'center' }}>
          ×{qty % 1 === 0 ? qty : qty.toFixed(1)}
        </span>
        <button className="qty-btn" onClick={dec}>−</button>
        <button className="qty-btn" onClick={inc}>+</button>
      </div>
    </div>
  )
}
