import type { Meal } from '../types'
import type { Lang } from '../lib/i18n'
import { t, formatDate } from '../lib/i18n'
import { DonutProgress } from './DonutProgress'
import { useAppContext } from '../context/AppContext'

interface DailySummaryProps {
  meals:         Meal[]
  date:          string
  goalCalories:  number
  goalProtein:   number
  lang:          Lang
  fluidGoalMl?:  number
  fluidTodayMl?: number
  streak?:       number
}

export function DailySummary({ meals, date, goalCalories, goalProtein, lang, fluidGoalMl = 0, fluidTodayMl = 0, streak = 0 }: DailySummaryProps) {
  const { styleMode } = useAppContext()
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
      color:       'var(--accent-hi)',
      label:       lang === 'he' ? 'קלוריות' : 'Calories',
      centerVal:   totalCalories.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US'),
      centerGoal:  `${goalCalories.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} /`,
      remaining:   remStr(remCal, ` ${t(lang, 'caloriesUnit')}`),
      over:        remCal < 0,
    },
    {
      type:        'protein' as const,
      value:       totalProtein,
      goal:        goalProtein,
      color:       'var(--positive-hi)',
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
      color:       'var(--accent)',
      label:       lang === 'he' ? 'נוזלים' : 'Fluid',
      centerVal:   fmtMl(fluidTodayMl),
      centerGoal:  `${fmtMl(fluidGoalMl)} /`,
      remaining:   remStr(remFluid, 'ml'),
      over:        remFluid < 0,
    }] : []),
  ]

  // ── Minimal layout: hero percentage + hairline bars ──────────────────
  if (styleMode === 'minimal') {
    const calPct   = goalCalories > 0 ? Math.round(totalCalories / goalCalories * 100) : 0
    const protRatio = goalProtein  > 0 ? totalProtein / goalProtein : 0
    const protPct  = Math.min(1, protRatio)
    const protOver = protRatio > 1
    const fluidRatio = fluidGoalMl > 0 ? fluidTodayMl / fluidGoalMl : 0
    const fluidPct = Math.min(1, fluidRatio)
    const fluidOver = fluidRatio > 1
    const isOver  = totalCalories > goalCalories && goalCalories > 0

    return (
      <div className="fade-up" style={{ padding: '8px 0 28px' }}>
        {/* Date + streak */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 300, color: 'var(--text-3)', letterSpacing: '0.06em', margin: 0 }}>
            {formatDate(date, lang)}
          </p>
          {streak >= 2 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-tint)', borderRadius: 20, padding: '2px 8px' }}>
              🔥 {streak} {t(lang, 'streakDays')}
            </span>
          )}
        </div>

        {/* Hero percentage — always right-aligned regardless of text direction */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: lang === 'he' ? 'flex-start' : 'flex-end', padding: '16px 4px 0', gap: 4 }}>
          <span style={{
            fontSize: 'clamp(72px, 26vw, 132px)',
            fontWeight: 100,
            lineHeight: 0.88,
            letterSpacing: '-0.05em',
            color: isOver ? 'var(--text)' : 'var(--text)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {calPct}
          </span>
          <span style={{
            fontSize: 'clamp(22px, 8vw, 40px)',
            fontWeight: 200,
            letterSpacing: '-0.03em',
            color: 'var(--text-2)',
            paddingBottom: '0.12em',
          }}>%</span>
        </div>

        {/* Cal meta — always right-aligned to sit below the hero number */}
        <p style={{ fontSize: 12, fontWeight: 300, color: 'var(--text-2)', padding: '8px 4px 0', textAlign: lang === 'he' ? 'start' : 'end' }}>
          {totalCalories.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}
          {lang === 'he' ? ' מתוך ' : ' / '}
          {goalCalories.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} {t(lang, 'caloriesUnit')}
        </p>

        {/* Protein bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 4px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 300, color: protOver ? 'var(--warning)' : 'var(--positive-hi)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {lang === 'he'
              ? `חלבון ${Math.round(totalProtein)} / ${goalProtein}g`
              : `protein ${Math.round(totalProtein)} / ${goalProtein}g`}
          </span>
          <div style={{ flex: 1, height: 2, background: 'var(--border)', position: 'relative', borderRadius: 2 }}>
            <div style={{
              position: 'absolute', top: 0, insetInlineStart: 0, bottom: 0,
              width: `${protPct * 100}%`, borderRadius: 2,
              background: protOver ? 'var(--warning)' : 'var(--positive-hi)',
              transition: 'width 0.6s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 300, color: protOver ? 'var(--warning)' : 'var(--positive-hi)', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 26, textAlign: 'end' }}>
            {Math.round(protRatio * 100)}%
          </span>
        </div>

        {/* Fluid bar — only if goal is set */}
        {fluidGoalMl > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px 0' }}>
            <span style={{ fontSize: 11, fontWeight: 300, color: fluidOver ? 'var(--warning)' : 'var(--cyan-hi)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {lang === 'he'
                ? `נוזלים ${fluidTodayMl >= 1000 ? `${(fluidTodayMl / 1000).toFixed(1)}ל׳` : `${Math.round(fluidTodayMl)}ml`}`
                : `fluid ${fluidTodayMl >= 1000 ? `${(fluidTodayMl / 1000).toFixed(1)}L` : `${Math.round(fluidTodayMl)}ml`}`}
            </span>
            <div style={{ flex: 1, height: 2, background: 'var(--border)', position: 'relative', borderRadius: 2 }}>
              <div style={{
                position: 'absolute', top: 0, insetInlineStart: 0, bottom: 0,
                width: `${fluidPct * 100}%`, borderRadius: 2,
                background: fluidOver ? 'var(--warning)' : 'var(--cyan-hi)',
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 300, color: fluidOver ? 'var(--warning)' : 'var(--cyan-hi)', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 26, textAlign: 'end' }}>
              {Math.round(fluidRatio * 100)}%
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Classic / Hybrid layout: donuts ───────────────────────────────────
  return (
    <div
      className="fade-up"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>
          {formatDate(date, lang)}
        </p>
        {streak >= 2 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-tint)', borderRadius: 20, padding: '2px 8px' }}>
            🔥 {streak} {t(lang, 'streakDays')}
          </span>
        )}
      </div>

      {/* ── Active: Option B — responsive rich-donut row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', gap: 4 }}>
        {items.map(m => {
          const pct = m.goal > 0 ? Math.round((m.value / m.goal) * 100) : 0
          return (
            <div
              key={m.type}
              style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <DonutProgress
                value={m.value}
                goal={m.goal}
                type={m.type}
                lang={lang}
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
                  <span style={{ fontSize: 10, fontWeight: 700, color: m.over ? 'var(--danger)' : m.color, opacity: 0.8 }}>{pct}%</span>
                  {m.label}
                </p>
                <p style={{ fontSize: 10, fontWeight: 500, color: m.over ? 'var(--danger)' : 'var(--text-3)', margin: 0, lineHeight: 1.3 }}>
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

        <div style={{ flex:'0 0 auto', minWidth:130, scrollSnapAlign:'start', background:'var(--accent-fill)', border:'1px solid color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius:10, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:10, fontWeight:700, color:'var(--accent-hi)', marginBottom:3, letterSpacing:'0.05em' }}>{t(lang,'calories').toUpperCase()}</p>
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
