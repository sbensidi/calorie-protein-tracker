import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate } from '../lib/i18n'
import { DonutProgress } from './DonutProgress'

interface DailySummaryProps {
  meals:         Meal[]
  date:          string
  goalCalories:  number
  goalProtein:   number
  lang:          Lang
  fluidGoalMl?:  number
  fluidTodayMl?: number
}

export function DailySummary({ meals, date, goalCalories, goalProtein, lang, fluidGoalMl = 0, fluidTodayMl = 0 }: DailySummaryProps) {
  const totalCalories = Math.round(meals.reduce((s, m) => s + m.calories, 0))
  const totalProtein  = Math.round(meals.reduce((s, m) => s + m.protein, 0) * 10) / 10

  const remCal    = Math.round(goalCalories - totalCalories)
  const remProt   = Math.round((goalProtein - totalProtein) * 10) / 10
  const remFluid  = Math.round(fluidGoalMl - fluidTodayMl)

  const fmtMl = (ml: number) =>
    ml >= 1000
      ? `${(ml / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}`
      : `${Math.round(ml)}ml`

  const remStr = (rem: number, unit: string) => {
    const abs = Math.abs(rem)
    const val = unit === 'ml' ? fmtMl(abs) : `${abs}${unit}`
    return rem < 0
      ? (lang === 'he' ? `חרגת ב-${val}` : `${val} over`)
      : (lang === 'he' ? `נותרו ${val}`   : `${val} left`)
  }

  const items = [
    {
      type:        'calories' as const,
      value:       totalCalories,
      goal:        goalCalories,
      color:       'var(--blue-hi)',
      label:       lang === 'he' ? 'קלוריות' : 'Calories',
      centerVal:   totalCalories.toLocaleString(),
      centerGoal:  `${goalCalories.toLocaleString()} /`,
      remaining:   remStr(remCal, ` ${t(lang, 'caloriesUnit')}`),
      over:        remCal < 0,
    },
    {
      type:        'protein' as const,
      value:       totalProtein,
      goal:        goalProtein,
      color:       'var(--green-hi)',
      label:       lang === 'he' ? 'חלבון' : 'Protein',
      centerVal:   String(totalProtein),
      centerGoal:  `${goalProtein}${t(lang, 'proteinUnit')} /`,
      remaining:   remStr(remProt, t(lang, 'proteinUnit')),
      over:        remProt < 0,
    },
    ...(fluidGoalMl > 0 ? [{
      type:        'fluid' as const,
      value:       fluidTodayMl,
      goal:        fluidGoalMl,
      color:       'var(--blue)',
      label:       lang === 'he' ? 'נוזלים' : 'Fluid',
      centerVal:   fmtMl(fluidTodayMl),
      centerGoal:  `${fmtMl(fluidGoalMl)} /`,
      remaining:   remStr(remFluid, 'ml'),
      over:        remFluid < 0,
    }] : []),
  ]

  return (
    <div
      className="fade-up"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 8 }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 14 }}>
        {formatDate(date, lang)}
      </p>

      {/* ── Active: Option B — responsive rich-donut row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', gap: 4 }}>
        {items.map(m => {
          const pct = m.goal > 0 ? Math.min(100, Math.round((m.value / m.goal) * 100)) : 0
          return (
            <div
              key={m.type}
              style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <DonutProgress
                value={m.value}
                goal={m.goal}
                type={m.type}
                size={96}
                strokeWidth={9}
                style={{ width: '100%', maxWidth: 96, height: 'auto', aspectRatio: '1', flexShrink: 1 }}
                centerContent={
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '0 4px' }}>
                    <span style={{ fontSize: 'clamp(11px, 3.5vw, 17px)', fontWeight: 800, color: m.color, lineHeight: 1, letterSpacing: '-0.02em' }}>
                      {m.centerVal}
                    </span>
                    <span style={{ fontSize: 'clamp(8px, 2.2vw, 10px)', fontWeight: 500, color: 'var(--text-3)', lineHeight: 1 }}>
                      {m.centerGoal}
                    </span>
                  </div>
                }
              />
              <div style={{ textAlign: 'center', width: '100%' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: m.color, opacity: 0.8 }}>{pct}%</span>
                  {m.label}
                </p>
                <p style={{ fontSize: 10, fontWeight: 500, color: m.over ? 'var(--red)' : 'var(--text-3)', margin: 0, lineHeight: 1.3 }}>
                  {m.remaining}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/*
      ── OPTION A (horizontal scroll cards) — inactive, kept for easy revival ──
      Replace the Option B block above with this if the donut row feels too cramped.

      import { StatusBadge } from './StatusBadge'  ← restore this import too

      const calLabel  = remaining(remCal,  t(lang,'caloriesUnit'), lang)
      const protLabel = remaining(remProt, t(lang,'proteinUnit'),  lang)
      const fluidLbl  = fluidOver ? `${fmtMl(abs)} over` : `${fmtMl(abs)} remaining`

      <div style={{ display:'flex', gap:10, overflowX:'auto', scrollSnapType:'x mandatory', paddingBottom:4, marginBottom:-4 }}>

        <div style={{ flex:'0 0 auto', minWidth:130, scrollSnapAlign:'start', background:'rgba(59,130,246,0.07)', border:'1px solid rgba(59,130,246,0.14)', borderRadius:10, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:10, fontWeight:700, color:'var(--blue-hi)', marginBottom:3, letterSpacing:'0.05em' }}>{t(lang,'calories').toUpperCase()}</p>
              <div style={{ display:'flex', alignItems:'baseline', gap:2 }}>
                <span style={{ fontSize:26, fontWeight:800, color:'var(--text)', lineHeight:1 }}>{totalCalories}</span>
                <span style={{ fontSize:11, color:'var(--text-2)' }}>{t(lang,'caloriesUnit')}</span>
              </div>
              <p style={{ fontSize:10, color:'var(--text-3)', margin:'2px 0 0' }}>/ {goalCalories} {t(lang,'caloriesUnit')}</p>
            </div>
            <DonutProgress value={totalCalories} goal={goalCalories} type="calories" size={58} strokeWidth={5} />
          </div>
          <StatusBadge status={calLabel.over?'over':'under'} text={calLabel.text} lang={lang} />
        </div>

        ... protein card, fluid card (same pattern) ...

      </div>
      */}
    </div>
  )
}
