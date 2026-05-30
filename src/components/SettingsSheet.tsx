import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSheetScroll } from '../hooks/useSheetScroll'
import { SheetHandle } from './SheetHandle'
import type { Lang, DayKey, TranslationKey } from '../lib/i18n'
import { t, dir, DAY_KEYS, DAY_SHORT_HE, DAY_SHORT_EN } from '../lib/i18n'
import { toWeekIndex } from '../lib/utils'
import type { Toast } from '../hooks/useToast'
import type { Goal, FoodHistory, ComposedGroup, Meal, UserFoodItem, RecipeIngredient } from '../types'
import type { UserProfile } from '../hooks/useProfile'
import { useFoodLibrary } from '../hooks/useFoodLibrary'
import { UNITS, toBase, fromBase, mlToGrams } from '../lib/units'
import { useNutritionAmountEditor } from '../hooks/useNutritionAmountEditor'
import type { UnitId } from '../lib/units'
import { fuzzyScore } from '../lib/fuzzyMatch'
import { useAppContext } from '../context/AppContext'
import { calcBMR, calcDailyTdee, calcProjectedDays, calcBMI, calcBMICategory, calcSuggestedFluidMl } from '../lib/calculations'
import { EditRecipeModal } from './EditRecipeModal'

const SEARCH_THRESHOLD = 0.45

// ── Constants ─────────────────────────────────────────────────────────────────

type Screen = 'main' | 'profile' | 'goals' | 'foodHistory' | 'library' | 'preferences' | 'myFoods'

// ── DayPanel (module-level to avoid React re-mounting on every render) ────────

interface DayPanelProps {
  dayKey:         DayKey
  compact?:       boolean
  lang:           Lang
  todayKey:       DayKey
  isCustom:       boolean
  calVal:         number
  protVal:        number
  fluidVal:       number
  calDiff:        string | null
  protDiff:       string | null
  fluidDiff:      string | null
  onChangeCal:    (v: string) => void
  onChangeProt:   (v: string) => void
  onChangeFluid:  (v: string) => void
  onReset:        () => void
  onClearCal?:    () => void
  onClearProt?:   () => void
  onClearFluid?:  () => void
}

function DayPanel({
  dayKey, compact = false, lang, todayKey,
  isCustom, calVal, protVal, fluidVal, calDiff, protDiff, fluidDiff,
  onChangeCal, onChangeProt, onChangeFluid, onReset,
  onClearCal, onClearProt, onClearFluid,
}: DayPanelProps) {
  const isToday = dayKey === todayKey

  return (
    <div style={{
      border: `1.5px solid ${isToday ? 'var(--accent-border-hi)' : isCustom ? 'var(--library-border)' : 'var(--border)'}`,
      background: isToday ? 'var(--accent-fill)' : isCustom ? 'var(--library-fill)' : 'transparent',
      borderRadius: 12,
      padding: compact ? '10px 12px' : 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{
          fontSize: compact ? 12 : 13, fontWeight: 700,
          color: isToday ? 'var(--accent-hi)' : isCustom ? 'var(--library-hi)' : 'var(--text-2)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {t(lang, dayKey as TranslationKey)}
          {isToday && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: 'var(--accent)',
              background: 'var(--accent-chip)', borderRadius: 4, padding: '2px 5px',
            }}>
              {t(lang, 'today')}
            </span>
          )}
        </span>
        {isCustom && (
          <button
            onClick={onReset}
            aria-label={t(lang, 'reset')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}
          >
            <span className="icon icon-sm">restart_alt</span>
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          {!compact && (
            <label style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              {t(lang, 'calories')}
            </label>
          )}
          <div style={{ position: 'relative' }}>
            {!compact && onClearCal && (
              <button onMouseDown={e => { e.preventDefault(); onClearCal() }} tabIndex={-1}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: calDiff ? 'var(--accent-hi)' : 'var(--text-4, var(--text-3))', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="icon icon-sm">close</span>
              </button>
            )}
            <input
              type="number"
              inputMode="numeric"
              className="inp"
              aria-label={t(lang, 'calories')}
              style={{ height: compact ? 38 : undefined, paddingLeft: (!compact && onClearCal) ? 28 : undefined, paddingRight: calDiff ? 48 : undefined }}
              value={calVal === 0 ? '' : calVal}
              placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => onChangeCal(e.target.value)}
            />
            {calDiff && (
              <span style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 600, pointerEvents: 'none',
                color: calDiff.startsWith('(+') ? 'var(--positive-hi)' : 'var(--danger)',
              }}>
                {calDiff}
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {!compact && (
            <label style={{ fontSize: 11, color: 'var(--positive-hi)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              {t(lang, 'protein')}
            </label>
          )}
          <div style={{ position: 'relative' }}>
            {!compact && onClearProt && (
              <button onMouseDown={e => { e.preventDefault(); onClearProt() }} tabIndex={-1}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: protDiff ? 'var(--positive-hi)' : 'var(--text-4, var(--text-3))', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="icon icon-sm">close</span>
              </button>
            )}
            <input
              type="number"
              inputMode="decimal"
              className="inp inp-green"
              aria-label={t(lang, 'protein')}
              style={{ height: compact ? 38 : undefined, paddingLeft: (!compact && onClearProt) ? 28 : undefined, paddingRight: protDiff ? 48 : undefined }}
              value={protVal === 0 ? '' : protVal}
              placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => onChangeProt(e.target.value)}
            />
            {protDiff && (
              <span style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 600, pointerEvents: 'none',
                color: protDiff.startsWith('(+') ? 'var(--positive-hi)' : 'var(--danger)',
              }}>
                {protDiff}
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {!compact && (
            <label style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600, display: 'block', marginBottom: 5 }}>
              {t(lang, 'fluid')}
            </label>
          )}
          <div style={{ position: 'relative' }}>
            {!compact && onClearFluid && (
              <button onMouseDown={e => { e.preventDefault(); onClearFluid() }} tabIndex={-1}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: fluidDiff ? 'var(--accent-hi)' : 'var(--text-4, var(--text-3))', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="icon icon-sm">close</span>
              </button>
            )}
            <input
              type="number"
              inputMode="numeric"
              className="inp"
              aria-label={t(lang, 'fluid')}
              style={{ height: compact ? 38 : undefined, paddingLeft: (!compact && onClearFluid) ? 28 : undefined, paddingRight: fluidDiff ? 48 : undefined, borderColor: 'var(--accent-border)' }}
              value={fluidVal === 0 ? '' : fluidVal}
              placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => onChangeFluid(e.target.value)}
            />
            {fluidDiff && (
              <span style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 600, pointerEvents: 'none',
                color: fluidDiff.startsWith('(+') ? 'var(--positive-hi)' : 'var(--danger)',
              }}>
                {fluidDiff}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

function MainScreen({ lang, connected, theme, styleMode, showGreeting, onProfile, onGoals, onFoodHistory, onLibrary, onMyFoods, onPreferences, onToggleLang, onToggleTheme, onSelectStyleMode, onToggleGreeting, onSignOut, onLinkGoogle, hasGoogleLinked, onExportCsv }: {
  lang:                Lang
  connected:           boolean
  theme:               'dark' | 'light'
  styleMode:           'classic' | 'minimal'
  showGreeting:        boolean
  onProfile:           () => void
  onGoals:             () => void
  onFoodHistory:       () => void
  onLibrary:           () => void
  onMyFoods:           () => void
  onPreferences:       () => void
  onToggleLang:        () => void
  onToggleTheme:       () => void
  onSelectStyleMode:   (m: 'classic' | 'minimal') => void
  onToggleGreeting:    () => void
  onSignOut:           () => void
  onLinkGoogle?:       () => void
  hasGoogleLinked?:    boolean
  onExportCsv?:        () => void
}) {
  const chevron = lang === 'he' ? 'chevron_left' : 'chevron_right'
  const minimal = styleMode === 'minimal'

  const rowBase: React.CSSProperties = minimal ? {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 0',
    background: 'transparent', border: 'none', borderRadius: 0,
    cursor: 'pointer', width: '100%', fontFamily: 'inherit',
    textAlign: 'start',
  } : {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '13px 14px',
    background: 'transparent', border: 'none', borderRadius: 0,
    cursor: 'pointer', width: '100%', fontFamily: 'inherit',
    textAlign: 'start', transition: 'background 0.12s',
  }

  const rowSep: React.CSSProperties = minimal ? { borderBottom: '1px dashed var(--border)' } : {}

  const groupStyle: React.CSSProperties = minimal ? {} : {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
  }

  const divider: React.CSSProperties = minimal ? {} : {
    borderTop: '1px solid var(--border)',
    marginInline: 14,
  }

  return (
    <>
      <div style={{ margin: '8px 0 18px' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          {t(lang, 'settings')}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: minimal ? 0 : 10 }}>

        {/* Group 1 — Navigation */}
        <div style={groupStyle}>
          <button onClick={onProfile} style={{ ...rowBase, ...rowSep }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--accent)', flexShrink: 0 }}>person</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'personalProfile')}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {t(lang, 'settingsPersonalSubtitle')}
              </p>
            </div>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
          </button>

          {!minimal && <div style={divider} />}
          <button onClick={onGoals} style={{ ...rowBase, ...rowSep }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--positive-hi)', flexShrink: 0 }}>track_changes</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'dailyGoalsLabel')}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {t(lang, 'settingsGoalsSubtitle')}
              </p>
            </div>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
          </button>

          {!minimal && <div style={divider} />}
          <button onClick={onFoodHistory} style={{ ...rowBase, ...rowSep }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--warning)', flexShrink: 0 }}>manage_search</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'foodHistory')}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {t(lang, 'settingsFoodHistorySubtitle')}
              </p>
            </div>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
          </button>

          {!minimal && <div style={divider} />}
          <button onClick={onLibrary} style={{ ...rowBase, ...rowSep }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--positive-hi)', flexShrink: 0 }}>menu_book</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'foodLibrary')}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {t(lang, 'settingsFoodLibrarySubtitle')}
              </p>
            </div>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
          </button>

          {!minimal && <div style={divider} />}
          <button onClick={onMyFoods} style={{ ...rowBase, ...rowSep }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--accent-hi)', flexShrink: 0 }}>bookmark</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'myFoods')}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {t(lang, 'settingsMyFoodsSubtitle')}
              </p>
            </div>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
          </button>

          {!minimal && <div style={divider} />}
          <button onClick={onPreferences} style={{ ...rowBase, ...rowSep }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--library)', flexShrink: 0 }}>tune</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'preferences')}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {t(lang, 'settingsPrefsSubtitle')}
              </p>
            </div>
            <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>
          </button>
        </div>

        {/* Group 2 — Display */}
        <div style={groupStyle}>
          <div style={{ ...rowBase, ...rowSep, cursor: 'default' }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--composed)', flexShrink: 0 }}>language</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'language')}
              </p>
            </div>
            <button
              onClick={onToggleLang}
              style={{
                padding: '6px 16px', borderRadius: 999,
                background: 'var(--qty-bg)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t(lang, 'switchToLangAbbr')}
            </button>
          </div>

          {!minimal && <div style={divider} />}
          <div style={{ ...rowBase, ...rowSep, cursor: 'default' }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--warning)', flexShrink: 0 }}>
              {theme === 'dark' ? 'dark_mode' : 'light_mode'}
            </span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'appearance')}
              </p>
            </div>
            <button
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                position: 'relative',
                width: 50, height: 28,
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                background: theme === 'dark' ? 'var(--accent-glow)' : 'var(--warning-glow)',
                transition: 'background 0.25s',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 3,
                insetInlineStart: theme === 'dark' ? 3 : 23,
                width: 22, height: 22,
                borderRadius: '50%',
                background: theme === 'dark' ? 'var(--accent)' : 'var(--warning)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'inset-inline-start 0.25s cubic-bezier(.34,1.56,.64,1), background 0.25s',
                boxShadow: 'var(--shadow-sm)',
              }}>
                <span className="icon" style={{ fontSize: 13, color: 'var(--on-color)' }}>
                  {theme === 'dark' ? 'dark_mode' : 'light_mode'}
                </span>
              </span>
            </button>
          </div>

          {!minimal && <div style={divider} />}
          <div style={{ ...rowBase, ...rowSep, cursor: 'default' }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--accent)', flexShrink: 0 }}>palette</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'themeStyle')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {(['classic', 'minimal'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => onSelectStyleMode(mode)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: styleMode === mode ? '1px solid var(--accent-border-hi)' : '1px solid var(--border)',
                    background: styleMode === mode ? 'var(--accent-select)' : 'transparent',
                    color: styleMode === mode ? 'var(--accent)' : 'var(--text-2)',
                    fontSize: 12,
                    fontWeight: styleMode === mode ? 700 : 400,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, paddingBottom: 4,
                  }}
                >
                  {t(lang, mode === 'classic' ? 'styleClassic' : 'styleMinimal')}
                </button>
              ))}
            </div>
          </div>
          {!minimal && <div style={divider} />}
          <div style={{ ...rowBase, ...rowSep, cursor: 'default' }}>
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--accent)', flexShrink: 0 }}>waving_hand</span>}
            <div style={{ flex: 1, textAlign: 'start' }}>
              <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {t(lang, 'showDailyGreeting')}
              </p>
              {!minimal && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                  {t(lang, 'showDailyGreetingDesc')}
                </p>
              )}
            </div>
            <button
              onClick={onToggleGreeting}
              aria-label={t(lang, 'toggleGreeting')}
              style={{
                position: 'relative', width: 50, height: 28, borderRadius: 999,
                border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                background: showGreeting ? 'var(--accent-glow)' : 'var(--qty-bg)',
                transition: 'background 0.25s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3,
                insetInlineStart: showGreeting ? 3 : 23,
                width: 22, height: 22, borderRadius: '50%',
                background: showGreeting ? 'var(--accent)' : 'var(--text-3)',
                transition: 'inset-inline-start 0.25s cubic-bezier(.34,1.56,.64,1), background 0.25s',
                boxShadow: 'var(--shadow-sm)',
              }} />
            </button>
          </div>
        </div>

        {/* Group 3 — Account */}
        <div style={groupStyle}>
          {onLinkGoogle && !hasGoogleLinked && (<>
            <button
              onClick={onLinkGoogle}
              style={{ ...rowBase, ...rowSep }}
            >
              {!minimal && (
                <svg width="22" height="22" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              <div style={{ flex: 1, textAlign: 'start' }}>
                <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  {t(lang, 'linkGoogle')}
                </p>
                {!minimal && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                    {t(lang, 'linkGoogleSub')}
                  </p>
                )}
              </div>
              {!minimal && <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>}
            </button>
            {!minimal && <div style={divider} />}
          </>)}

          {onExportCsv && (
            <>
              <button onClick={onExportCsv} style={{ ...rowBase, ...rowSep }}>
                {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--text-2)', flexShrink: 0 }}>download</span>}
                <div style={{ flex: 1, textAlign: 'start' }}>
                  <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                    {t(lang, 'exportCsv')}
                  </p>
                  {!minimal && (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                      {t(lang, 'exportCsvDesc')}
                    </p>
                  )}
                </div>
                {!minimal && <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{chevron}</span>}
              </button>
              {!minimal && <div style={divider} />}
            </>
          )}

          <button
            onClick={onSignOut}
            style={{ ...rowBase, ...(minimal ? { paddingTop: 14 } : {}) }}
          >
            {!minimal && <span className="icon" style={{ fontSize: 22, color: 'var(--danger)', flexShrink: 0 }}>logout</span>}
            <p style={{ fontSize: minimal ? 13 : 14, fontWeight: 600, color: 'var(--danger)', margin: 0, flex: 1, textAlign: 'start' }}>
              {t(lang, 'signOut')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: connected ? 'var(--status-ok)' : 'var(--text-3)',
                boxShadow: connected ? '0 0 5px var(--status-ok)' : 'none',
              }} />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {t(lang, connected ? 'connected' : 'disconnected')}
              </span>
            </div>
          </button>

          <p style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', margin: '8px 0 0', letterSpacing: 0.3 }}>
            {new Date(__BUILD_TS__).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </>
  )
}

// NotificationsSection — suspended on web, implemented in iOS native only

// ── Weight Sparkline ──────────────────────────────────────────────────────────

function WeightSparkline({ entries }: { entries: import('../types').WeightLog[] }) {
  if (entries.length < 2) return null
  const pts = entries.slice(-30)
  const W = 300, H = 52, pad = 6
  const weights = pts.map(e => e.weight_kg)
  const minW = Math.min(...weights), maxW = Math.max(...weights)
  const range = maxW - minW || 1
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2)
  const y = (w: number) => H - pad - ((w - minW) / range) * (H - pad * 2)
  const points = pts.map((e, i) => `${x(i)},${y(e.weight_kg)}`).join(' ')
  const area   = `M${x(0)},${H} ` + pts.map((e, i) => `L${x(i)},${y(e.weight_kg)}`).join(' ') + ` L${x(pts.length - 1)},${H} Z`
  const last   = pts[pts.length - 1]
  const lx = x(pts.length - 1), ly = y(last.weight_kg)
  return (
    <div style={{ margin: '0 0 10px', borderRadius: 10, overflow: 'hidden', background: 'var(--accent-fill)', padding: '8px 8px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="wsg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-hi)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent-hi)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#wsg)" />
        <polyline points={points} fill="none" stroke="var(--accent-hi)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lx} cy={ly} r={3.5} fill="var(--accent-hi)" />
      </svg>
    </div>
  )
}

// ── Profile Screen ────────────────────────────────────────────────────────────

function ProfileScreen({ lang, profile, onSave, showToast, weightLogEntries = [], onLogWeight, onDeleteWeightEntry, saveRef, onSaveDone }: {
  lang:      Lang
  profile:   UserProfile
  onSave:    (updates: Partial<UserProfile>) => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  weightLogEntries?: import('../types').WeightLog[]
  onLogWeight?:      (weight_kg: number, date?: string) => Promise<void>
  onDeleteWeightEntry?: (id: string) => Promise<void>
  saveRef:     React.MutableRefObject<(() => void) | null>
  onSaveDone:  () => void
}) {
  const [draft, setDraft] = useState<UserProfile>({ ...profile })
  const [weightInput, setWeightInput] = useState('')
  const [loggingWeight, setLoggingWeight] = useState(false)
  const [, setWeightFromLog] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)

  // draft is initialised from the localStorage snapshot (before fetchProfile resolves).
  // Once the server profile arrives, sync the whole draft — but stop once the user
  // starts editing so we never overwrite in-progress changes.
  const dirtyRef = useRef(false)
  useEffect(() => {
    if (!dirtyRef.current) setDraft({ ...profile })
  }, [profile])

  const set = <K extends keyof UserProfile>(key: K, val: UserProfile[K]) => {
    dirtyRef.current = true
    setDraft(p => ({ ...p, [key]: val }))
  }

  const { bmr, suggestedFluidMl, bmi, bmiCategory } = useMemo(() => {
    const bmiVal = calcBMI(draft.weight, draft.height)
    return {
      bmr:              calcBMR(draft),
      suggestedFluidMl: calcSuggestedFluidMl(draft.weight),
      bmi:              bmiVal,
      bmiCategory:      calcBMICategory(bmiVal),
    }
  }, [draft])

  const handleSave = () => {
    onSave(draft)
    onSaveDone()
    // On first-ever save (no log entries yet), record a baseline weight automatically
    if (weightLogEntries.length === 0 && draft.weight > 0 && onLogWeight) {
      onLogWeight(draft.weight)
      setWeightFromLog(true)
      showToast(t(lang, 'weightBaselineLogged'), 'info')
    } else {
      showToast(t(lang, 'profileSaved'), 'success')
    }
  }
  saveRef.current = handleSave

  const handleLogWeight = async () => {
    const kg = parseFloat(weightInput.replace(',', '.'))
    if (!kg || kg < 20 || kg > 300 || !onLogWeight) return
    setLoggingWeight(true)
    await onLogWeight(kg)
    set('weight', kg)      // reflect in draft → metrics update instantly
    onSave({ weight: kg }) // persist → GoalsScreen recommendations update
    setWeightInput('')
    setLoggingWeight(false)
    setWeightFromLog(true)
    showToast(t(lang, 'weightLoggedBang'), 'success')
  }

  const bmiColor = bmiCategory === 'normal' ? 'var(--positive-hi)' : bmiCategory === 'obese' ? 'var(--danger)' : 'var(--warning)'
  const bmiKeyMap = { underweight: 'bmiUnderweight', normal: 'bmiNormal', overweight: 'bmiOverweight', obese: 'bmiObese' } as const
  const bmiLabel = t(lang, bmiKeyMap[bmiCategory as keyof typeof bmiKeyMap])
  // key changes when metrics change → CSS remount triggers pulse animation
  const metricsKey = `${bmr}-${bmi}`

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5,
  }

  return (
    <>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 18px' }}>
        {t(lang, 'personalProfile')}
      </h2>

      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>
        {t(lang, 'personalDetails')}
      </p>

      {/* Display name */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>{t(lang, 'displayNameLabel')}</label>
        <input
          type="text"
          className="inp"
          value={draft.displayName ?? ''}
          placeholder={t(lang, 'displayNamePlaceholder')}
          onChange={e => set('displayName', e.target.value || null)}
          style={{ fontSize: 16, width: '100%', boxSizing: 'border-box' }}
        />
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '5px 0 0' }}>
          {t(lang, 'displayNameHint')}
        </p>
      </div>

      {/* Sex */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{t(lang, 'sex')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['m', 'f'] as const).map(s => (
            <button
              key={s}
              onClick={() => set('sex', s)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontFamily: 'inherit',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: draft.sex === s ? 'var(--accent-select)' : 'var(--bg-card)',
                border: `1.5px solid ${draft.sex === s ? 'var(--accent)' : 'var(--border)'}`,
                color: draft.sex === s ? 'var(--accent-hi)' : 'var(--text-2)',
                transition: 'all .15s',
              }}
            >
              {s === 'm' ? t(lang, 'male') : t(lang, 'female')}
            </button>
          ))}
        </div>
      </div>

      {/* Age / Height / Weight */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
        {([
          { key: 'age' as const,    label: t(lang, 'ageLabel'),  min: 10,  max: 100,  mode: 'numeric'  as const },
          { key: 'height' as const, label: t(lang, 'heightCm'),  min: 100, max: 250,  mode: 'decimal'  as const },
          { key: 'weight' as const, label: t(lang, 'weightKg'),  min: 30,  max: 300,  mode: 'decimal'  as const },
        ]).map(({ key, label, min, max, mode }) => (
          <div key={key}>
            <label htmlFor={`profile-${key}`} style={labelStyle}>{label}</label>
            <div style={{ position: 'relative' }}>
              <input
                id={`profile-${key}`}
                type="number"
                inputMode={mode}
                className="inp"
                min={min} max={max}
                value={draft[key] === 0 ? '' : draft[key]}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => {
                  if (key === 'weight') setWeightFromLog(false)
                  set(key, Number(e.target.value) as UserProfile[typeof key])
                }}
                style={{ textAlign: lang === 'he' ? 'right' : 'left', paddingInlineStart: 12, paddingInlineEnd: 28 }}
              />
              {(draft[key] as number) > 0 && (
                <button
                  onMouseDown={e => { e.preventDefault(); set(key, 0 as UserProfile[typeof key]) }}
                  tabIndex={-1}
                  aria-label={t(lang, 'clearField')}
                  style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="icon icon-sm">close</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {weightLogEntries.length > 0 && (
        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '-14px 0 18px', textAlign: 'start' }}>
          {t(lang, 'weightFromLogHint')}
        </p>
      )}

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 18px' }} />

      {/* Metrics */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
        {t(lang, 'yourMetrics')}
      </p>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 2px' }}>BMR</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
              {t(lang, 'bmrDescription')}
            </p>
          </div>
          <span key={metricsKey} className="metric-pulse" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', flexShrink: 0, marginInlineStart: 10 }}>
            {bmr.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} <span style={{ fontSize: 10, fontWeight: 400 }}>{t(lang, 'caloriesUnit')}</span>
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--border)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 2px' }}>BMI</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
              {t(lang, 'bmiScale')}
            </p>
          </div>
          <span key={metricsKey} className="metric-pulse" style={{ fontSize: 18, fontWeight: 800, color: bmiColor, flexShrink: 0, marginInlineStart: 10 }}>
            {bmi} <span style={{ fontSize: 12, fontWeight: 600 }}>— {bmiLabel}</span>
          </span>
        </div>
        <div style={{ height: 1, background: 'var(--border)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 2px' }}>
              {t(lang, 'recommendedFluidLabel')}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, lineHeight: 1.4 }}>
              {`${t(lang, 'fluidFormulaPrefix')}${draft.weight}${t(lang, 'fluidFormulaSuffix')}`}
            </p>
          </div>
          <span key={metricsKey} className="metric-pulse" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', flexShrink: 0, marginInlineStart: 10 }}>
            {suggestedFluidMl >= 1000 ? (suggestedFluidMl / 1000).toFixed(1) : suggestedFluidMl}{' '}
            <span style={{ fontSize: 10, fontWeight: 400 }}>
              {suggestedFluidMl >= 1000 ? t(lang, 'litersUnit') : 'ml'}
            </span>
          </span>
        </div>
      </div>

      {/* ── Weight Log section ─────────────────────────────────── */}
      <div style={{ background: 'var(--accent-fill)', border: '1px solid var(--accent-border)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hi)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="icon" style={{ fontSize: 14 }}>monitor_weight</span>
          {t(lang, 'weightLog')}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="number"
              inputMode="decimal"
              className="inp"
              style={{ width: '100%', fontSize: 16, boxSizing: 'border-box', paddingInlineEnd: weightInput ? 28 : undefined }}
              placeholder={t(lang, 'weightKgPlaceholder')}
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLogWeight() }}
            />
            {weightInput && (
              <button
                onMouseDown={e => { e.preventDefault(); setWeightInput('') }}
                tabIndex={-1}
                aria-label={t(lang, 'clearField')}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
          <button
            className="btn-primary"
            style={{ flexShrink: 0, paddingInline: 16, opacity: loggingWeight ? 0.7 : 1 }}
            onClick={handleLogWeight}
            disabled={loggingWeight || !weightInput}
          >
            {t(lang, 'logWeight')}
          </button>
        </div>
      </div>

      {/* Sparkline — shown when ≥2 entries */}
      <WeightSparkline entries={weightLogEntries} />

      {/* Entry list — accordion when > 4 entries */}
      {weightLogEntries.length > 0 && (() => {
        const visible = logExpanded ? weightLogEntries : weightLogEntries.slice(-4)
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visible.map(entry => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1 }}>{entry.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'baseline', gap: 3, direction: 'ltr' }}>
                    {lang === 'he'
                      ? <><span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>ק״ג</span>{entry.weight_kg}</>
                      : <>{entry.weight_kg}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>kg</span></>
                    }
                  </span>
                  {onDeleteWeightEntry && (
                    <button
                      onClick={() => onDeleteWeightEntry(entry.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}
                      aria-label={t(lang, 'delete')}
                    >
                      <span className="icon icon-sm">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {weightLogEntries.length > 4 && (
              <button
                onClick={() => setLogExpanded(p => !p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-hi)', fontSize: 11, fontWeight: 600, padding: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span className="icon icon-sm">{logExpanded ? 'expand_less' : 'expand_more'}</span>
                {logExpanded
                  ? t(lang, 'showLess')
                  : `${t(lang, 'showMorePrefix')}${weightLogEntries.length - 4}${t(lang, 'showMoreSuffix')}`}
              </button>
            )}
          </div>
        )
      })()}

    </>
  )
}

// ── Goals Screen ──────────────────────────────────────────────────────────────

function GoalsScreen({ lang, profile, goals, onSave, onSaveProfile, onSaveFluidGoal, fluidGoalMl = 2500, showToast, saveRef, onSaveDone }: {
  lang:              Lang
  profile:           UserProfile
  goals:             Goal | null
  onSave:            (updates: Partial<Goal>) => void
  onSaveProfile:     (updates: Partial<UserProfile>) => void
  onSaveFluidGoal?:  (ml: number) => void
  fluidGoalMl?:      number
  showToast:         (msg: string, type: 'success' | 'error' | 'info') => void
  saveRef:     React.MutableRefObject<(() => void) | null>
  onSaveDone:  () => void
}) {
  const [defCal,       setDefCal]       = useState(goals?.default_calories ?? 1700)
  const [defProt,      setDefProt]      = useState(goals?.default_protein  ?? 160)
  const [defFluidGoal, setDefFluidGoal] = useState(fluidGoalMl)
  const [overrides, setOverrides] = useState<Record<string, { calories: number; protein: number; fluid_ml?: number }>>(goals?.weekly_overrides ?? {})
  const [draftActivityLevel, setDraftActivityLevel] = useState<number>(profile.activityLevel ?? 1)
  const [draftGoalType, setDraftGoalType] = useState<'lose' | 'maintain' | 'gain'>(profile.goalType ?? 'maintain')
  const [draftTargetWeightKg, setDraftTargetWeightKg] = useState<number | null>(profile.targetWeightKg)
  const [weeklyOpen, setWeeklyOpen] = useState(false)

  const todayKey    = DAY_KEYS[new Date().getDay()]
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey)

  useEffect(() => {
    if (goals) {
      setDefCal(goals.default_calories)
      setDefProt(goals.default_protein)
      setOverrides(goals.weekly_overrides ?? {})
    }
  }, [goals])

  useEffect(() => { setDefFluidGoal(fluidGoalMl) }, [fluidGoalMl])

  useEffect(() => {
    setDraftActivityLevel(profile.activityLevel ?? 1)
    setDraftGoalType(profile.goalType ?? 'maintain')
    setDraftTargetWeightKg(profile.targetWeightKg)
  }, [profile.activityLevel, profile.goalType, profile.targetWeightKg])

  const tdee = useMemo(() => calcDailyTdee({ ...profile, activityLevel: draftActivityLevel as 0|1|2|3|4 }), [profile, draftActivityLevel])

  const projectedDate = useMemo(() => {
    if (draftTargetWeightKg == null || !defCal || defCal <= 0) return null
    const days = calcProjectedDays(profile.weight, draftTargetWeightKg, tdee, defCal)
    if (days == null) return null
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }, [draftTargetWeightKg, defCal, profile.weight, tdee, lang])
  const suggestedCal     = tdee + (draftGoalType === 'lose' ? -500 : draftGoalType === 'gain' ? 300 : 0)
  const suggestedProtRate = draftGoalType === 'lose' ? 2.0 : draftGoalType === 'gain' ? 2.2 : 1.6
  const suggestedProt    = Math.round(profile.weight * suggestedProtRate)
  const suggestedFluidMl = Math.round(profile.weight * 35 / 100) * 100

  const hasOverride = (dayKey: DayKey) => !!overrides[toWeekIndex(dayKey)]

  const getVal = (dayKey: DayKey, field: 'calories' | 'protein') => {
    const entry = overrides[toWeekIndex(dayKey)]
    return entry?.[field] ?? (field === 'calories' ? defCal : defProt)
  }

  const getDiff = (dayKey: DayKey, field: 'calories' | 'protein'): string | null => {
    if (!hasOverride(dayKey)) return null
    const val  = getVal(dayKey, field)
    const def  = field === 'calories' ? defCal : defProt
    const diff = val - def
    if (diff === 0) return null
    const unit = field === 'protein' ? 'g' : ''
    return diff > 0 ? `(+${diff}${unit})` : `(${diff}${unit})`
  }

  const getFluidVal = (dayKey: DayKey) => {
    const entry = overrides[toWeekIndex(dayKey)]
    return entry?.fluid_ml ?? defFluidGoal
  }

  const getFluidDiff = (dayKey: DayKey): string | null => {
    if (!hasOverride(dayKey)) return null
    const entry = overrides[toWeekIndex(dayKey)]
    if (entry?.fluid_ml == null) return null
    const diff = entry.fluid_ml - defFluidGoal
    if (diff === 0) return null
    return diff > 0 ? `(+${diff})` : `(${diff})`
  }

  const setDayOverride = (dayKey: DayKey, field: 'calories' | 'protein', value: string) => {
    const idx = toWeekIndex(dayKey)
    setOverrides(prev => ({
      ...prev,
      [idx]: { calories: prev[idx]?.calories ?? defCal, protein: prev[idx]?.protein ?? defProt, fluid_ml: prev[idx]?.fluid_ml, [field]: Number(value) },
    }))
  }

  const setFluidDayOverride = (dayKey: DayKey, value: string) => {
    const idx = toWeekIndex(dayKey)
    setOverrides(prev => {
      const existing = prev[idx]
      return {
        ...prev,
        [idx]: { calories: existing?.calories ?? defCal, protein: existing?.protein ?? defProt, fluid_ml: Number(value) },
      }
    })
  }

  const clearDayField = (dayKey: DayKey, field: 'calories' | 'protein' | 'fluid') => {
    const idx = toWeekIndex(dayKey)
    setOverrides(prev => {
      const entry = prev[idx]
      if (!entry) return prev
      const next = { ...prev }
      if (field === 'calories') next[idx] = { ...entry, calories: defCal }
      else if (field === 'protein') next[idx] = { ...entry, protein: defProt }
      else next[idx] = { ...entry, fluid_ml: defFluidGoal }
      return next
    })
  }

  const resetDay = (dayKey: DayKey) => {
    const idx = toWeekIndex(dayKey)
    setOverrides(prev => { const n = { ...prev }; delete n[idx as keyof typeof n]; return n })
  }

  const dayShort = (dayKey: DayKey) => lang === 'he' ? DAY_SHORT_HE[dayKey] : DAY_SHORT_EN[dayKey]

  const handleSave = () => {
    onSave({ default_calories: defCal, default_protein: defProt, weekly_overrides: overrides })
    onSaveProfile({ activityLevel: draftActivityLevel as 0|1|2|3|4, goalType: draftGoalType, targetWeightKg: draftTargetWeightKg })
    onSaveFluidGoal?.(defFluidGoal)
    onSaveDone()
    showToast(t(lang, 'goalsSaved'), 'success')
  }
  saveRef.current = handleSave

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6,
  }

  return (
    <>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 18px' }}>
        {t(lang, 'dailyGoalsLabel')}
      </h2>

      {/* Activity level */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{t(lang, 'activityLevel')}</label>
        <select
          className="inp"
          style={{ fontSize: 16 }}
          value={draftActivityLevel}
          onChange={e => setDraftActivityLevel(Number(e.target.value))}
        >
          <option value={0}>{t(lang, 'sedentary')}</option>
          <option value={1}>{t(lang, 'lightActive')}</option>
          <option value={2}>{t(lang, 'moderateActive')}</option>
          <option value={3}>{t(lang, 'activeLevel')}</option>
          <option value={4}>{t(lang, 'veryActive')}</option>
        </select>
      </div>

      {/* Goal type */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{t(lang, 'goalType')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['lose', 'maintain', 'gain'] as const).map(gt => (
            <button
              key={gt}
              onClick={() => setDraftGoalType(gt)}
              style={{
                flex: 1, padding: '10px 4px', borderRadius: 10, fontFamily: 'inherit',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: draftGoalType === gt ? 'var(--accent-select)' : 'var(--bg-card)',
                border: `1.5px solid ${draftGoalType === gt ? 'var(--accent)' : 'var(--border)'}`,
                color: draftGoalType === gt ? 'var(--accent-hi)' : 'var(--text-2)',
                transition: 'all .15s',
              }}
            >
              {t(lang, gt)}
            </button>
          ))}
        </div>
      </div>

      {/* Target weight + projection */}
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>{t(lang, 'targetWeightKg')}</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="number"
              inputMode="decimal"
              className="inp"
              style={{ fontSize: 16, paddingInlineEnd: draftTargetWeightKg !== null ? 28 : undefined }}
              placeholder={t(lang, 'targetWeightPlaceholder')}
              value={draftTargetWeightKg ?? ''}
              onFocus={e => e.target.select()}
              onChange={e => setDraftTargetWeightKg(e.target.value ? parseFloat(e.target.value) : null)}
            />
            {draftTargetWeightKg !== null && (
              <button
                onMouseDown={e => { e.preventDefault(); setDraftTargetWeightKg(null) }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
          <button
            onClick={() => {
              onSaveProfile({ targetWeightKg: draftTargetWeightKg })
              showToast(t(lang, 'profileSaved'), 'success')
            }}
            style={{
              flexShrink: 0, padding: '0 14px', borderRadius: 10, fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: 'var(--accent-select)', border: '1.5px solid var(--accent)',
              color: 'var(--accent-hi)', whiteSpace: 'nowrap',
            }}
          >
            {t(lang, 'save')}
          </button>
        </div>
      </div>
      {projectedDate && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--accent-fill)', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🎯</span>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-hi)', margin: '0 0 1px' }}>{t(lang, 'projectedDateLabel')}</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>{projectedDate}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{t(lang, 'projectedDateHint')}</p>
          </div>
        </div>
      )}
      {!projectedDate && <div style={{ marginBottom: 14 }} />}

      {/* TDEE banner */}
      <div style={{ background: 'var(--accent-fill)', border: '1px solid var(--accent-glow)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="icon icon-sm" style={{ color: 'var(--accent-hi)' }}>bolt</span>
        <p style={{ fontSize: 12, margin: 0 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>TDEE: </span>
          <span style={{ fontWeight: 800, color: 'var(--accent-hi)' }}>{tdee.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
          <span style={{ color: 'var(--text-3)', marginInlineStart: 3 }}>{t(lang, 'kcalPerDay')}</span>
        </p>
      </div>

      {/* Suggestions card */}
      <div style={{ background: 'var(--accent-fill)', border: '1px solid var(--accent-select)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span className="icon icon-sm" style={{ color: 'var(--accent-hi)' }}>auto_fix_high</span>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hi)', margin: 0 }}>
            {t(lang, 'profileRecs')}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {/* Calories */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="icon icon-sm" style={{ color: 'var(--accent-hi)' }}>local_fire_department</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, margin: 0 }}>
                <span style={{ fontWeight: 800, color: 'var(--accent-hi)' }}>{suggestedCal.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
                <span style={{ color: 'var(--text-3)', marginInlineStart: 3 }}>{t(lang, 'caloriesUnit')}</span>
              </p>
              <p dir={dir(lang)} style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
                {lang === 'he'
                  ? draftGoalType === 'lose'
                    ? <>גרעון של 500 קק״ל/יום: <span dir="ltr">{tdee.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} − 500 = {suggestedCal.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}</span> קק״ל × 7 ≈ 0.5 ק״ג שומן/שבוע</>
                    : draftGoalType === 'gain'
                      ? <>עודף של 300 קק״ל/יום: <span dir="ltr">{tdee.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')} + 300 = {suggestedCal.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}</span> קק״ל × 7 ≈ 0.3 ק״ג/שבוע</>
                      : 'שמירה על משקל, שווה לצריכה האנרגטית היומית'
                  : draftGoalType === 'lose'
                    ? <><span dir="ltr">500 kcal/day deficit: {tdee.toLocaleString('en-US')} − 500 = {suggestedCal.toLocaleString('en-US')} kcal × 7 ≈ 0.5 kg fat/week</span></>
                    : draftGoalType === 'gain'
                      ? <><span dir="ltr">+300 kcal/day surplus: {tdee.toLocaleString('en-US')} + 300 = {suggestedCal.toLocaleString('en-US')} kcal × 7 ≈ 0.3 kg/week</span></>
                      : 'Maintenance — matches your daily energy expenditure'}
              </p>
            </div>
          </div>

          {/* Protein */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--positive-chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="icon icon-sm" style={{ color: 'var(--positive-hi)' }}>fitness_center</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, margin: 0 }}>
                <span style={{ fontWeight: 800, color: 'var(--positive-hi)' }}>{suggestedProt}</span>
                <span style={{ color: 'var(--text-3)', marginInlineStart: 3 }}>{t(lang, 'gProteinLabel')}</span>
              </p>
              <p dir={dir(lang)} style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
                {lang === 'he'
                  ? draftGoalType === 'lose'
                    ? <>שמירה מרבית על שריר בגרעון: <span dir="ltr">{suggestedProtRate} × {profile.weight} = {suggestedProt}g</span></>
                    : draftGoalType === 'gain'
                      ? <>סינתזת שריר מיטבית בעודף: <span dir="ltr">{suggestedProtRate} × {profile.weight} = {suggestedProt}g</span></>
                      : <>שמירה על מסת שריר: <span dir="ltr">{suggestedProtRate} × {profile.weight} = {suggestedProt}g</span></>
                  : draftGoalType === 'lose'
                    ? `${suggestedProtRate}g/kg × ${profile.weight}kg = ${suggestedProt}g protein`
                    : draftGoalType === 'gain'
                      ? `${suggestedProtRate}g/kg × ${profile.weight}kg = ${suggestedProt}g protein`
                      : `${suggestedProtRate}g/kg × ${profile.weight}kg = ${suggestedProt}g protein`}
              </p>
            </div>
          </div>

          {/* Fluid */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--cyan-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="icon icon-sm" style={{ color: 'var(--accent-hi)' }}>water_drop</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, margin: 0 }}>
                <span style={{ fontWeight: 800, color: 'var(--accent-hi)' }}>
                  {suggestedFluidMl >= 1000 ? (suggestedFluidMl / 1000).toFixed(1) : suggestedFluidMl}
                </span>
                <span style={{ color: 'var(--text-3)', marginInlineStart: 3 }}>
                  {suggestedFluidMl >= 1000 ? t(lang, 'litersFluid') : 'ml'}
                </span>
              </p>
              <p dir={dir(lang)} style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
                {`${t(lang, 'hydrationFormulaPrefix')}${profile.weight}${t(lang, 'hydrationFormulaSuffix')}`}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => { setDefCal(suggestedCal); setDefProt(suggestedProt); setDefFluidGoal(suggestedFluidMl) }}
          style={{
            width: '100%', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            background: 'var(--accent-chip)', border: '1px solid var(--accent-glow)',
            color: 'var(--accent-hi)',
          }}
        >
          {t(lang, 'applyAll')}
        </button>
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 16px' }} />

      {/* Default goals */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        {t(lang, 'defaultGoals')}
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, color: 'var(--accent-hi)' }}>
            {t(lang, 'calories')} ({t(lang, 'caloriesUnit')})
          </label>
          <div style={{ position: 'relative' }}>
            <input type="number" inputMode="numeric" className="inp"
              style={{ paddingInlineEnd: defCal > 0 ? 32 : undefined }}
              value={defCal === 0 ? '' : defCal} placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => setDefCal(Number(e.target.value))} />
            {defCal > 0 && (
              <button
                onMouseDown={e => { e.preventDefault(); setDefCal(0) }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, color: 'var(--positive-hi)' }}>
            {t(lang, 'protein')} ({t(lang, 'proteinUnit')})
          </label>
          <div style={{ position: 'relative' }}>
            <input type="number" inputMode="decimal" className="inp inp-green"
              style={{ paddingInlineEnd: defProt > 0 ? 32 : undefined }}
              value={defProt === 0 ? '' : defProt} placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => setDefProt(Number(e.target.value))} />
            {defProt > 0 && (
              <button
                onMouseDown={e => { e.preventDefault(); setDefProt(0) }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, color: 'var(--accent-hi)' }}>
            {t(lang, 'fluidMl')}
          </label>
          <div style={{ position: 'relative' }}>
            <input type="number" inputMode="numeric" className="inp"
              style={{ paddingInlineEnd: defFluidGoal > 0 ? 32 : undefined, borderColor: 'var(--accent-border)' }}
              value={defFluidGoal === 0 ? '' : defFluidGoal} placeholder="0"
              onFocus={e => e.target.select()}
              onChange={e => setDefFluidGoal(Number(e.target.value))} />
            {defFluidGoal > 0 && (
              <button
                onMouseDown={e => { e.preventDefault(); setDefFluidGoal(0) }}
                tabIndex={-1}
                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span className="icon icon-sm">close</span>
              </button>
            )}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '3px 0 0' }}>
            {`${t(lang, 'suggestedFluidPrefix')}${suggestedFluidMl}${t(lang, 'unitOptMl')}`}
          </p>
        </div>
      </div>

      {/* Accordion: Goals by Day */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <button
          onClick={() => setWeeklyOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, flex: 1, textAlign: 'start' }}>
            {t(lang, 'weeklyAdjustments')}
          </p>
          {Object.keys(overrides).length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--library-hi)', background: 'var(--library-chip)', borderRadius: 10, padding: '2px 7px' }}>
              {Object.keys(overrides).length}
            </span>
          )}
          <span className="icon icon-chevron" style={{ color: 'var(--text-3)', transition: 'transform .2s', transform: weeklyOpen ? 'rotate(180deg)' : 'none' }}>
            expand_more
          </span>
        </button>

        {weeklyOpen && (
          <>
            {Object.keys(overrides).length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button
                  onClick={() => setOverrides({})}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
                >
                  <span className="icon icon-sm">restart_alt</span>
                  <span style={{ fontSize: 11 }}>{t(lang, 'resetAllToDefault')}</span>
                </button>
              </div>
            )}

            {/* Day grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 12 }}>
              {DAY_KEYS.map(dayKey => {
                const isToday    = dayKey === todayKey
                const isCustom   = hasOverride(dayKey)
                const isSelected = dayKey === selectedDay
                return (
                  <button
                    key={dayKey}
                    onClick={() => setSelectedDay(dayKey)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      padding: '8px 2px 6px', borderRadius: 10, cursor: 'pointer',
                      fontFamily: 'inherit', position: 'relative',
                      border: `1.5px solid ${isSelected ? 'var(--library)' : isCustom ? 'color-mix(in srgb, var(--library) 45%, transparent)' : isToday ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'var(--border)'}`,
                      background: isSelected ? 'color-mix(in srgb, var(--library) 15%, transparent)' : isCustom ? 'var(--library-tint)' : isToday ? 'var(--accent-tint)' : 'transparent',
                      boxShadow: isSelected ? '0 0 0 3px color-mix(in srgb, var(--library) 20%, transparent)' : 'none',
                      transition: 'all .15s',
                    }}
                  >
                    {isToday && (
                      <span style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: 'var(--on-color)', fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        {t(lang, 'today')}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? 'var(--text)' : isCustom ? 'var(--library-hi)' : isToday ? 'var(--accent-hi)' : 'var(--text-3)' }}>
                      {dayShort(dayKey)}
                    </span>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: isCustom ? 'var(--library)' : isToday ? 'var(--accent)' : 'var(--border)' }} />
                  </button>
                )
              })}
            </div>

            <DayPanel
              dayKey={selectedDay}
              lang={lang}
              todayKey={todayKey}
              isCustom={hasOverride(selectedDay)}
              calVal={getVal(selectedDay, 'calories')}
              protVal={getVal(selectedDay, 'protein')}
              fluidVal={getFluidVal(selectedDay)}
              calDiff={getDiff(selectedDay, 'calories')}
              protDiff={getDiff(selectedDay, 'protein')}
              fluidDiff={getFluidDiff(selectedDay)}
              onChangeCal={v => setDayOverride(selectedDay, 'calories', v)}
              onChangeProt={v => setDayOverride(selectedDay, 'protein', v)}
              onChangeFluid={v => setFluidDayOverride(selectedDay, v)}
              onReset={() => resetDay(selectedDay)}
              onClearCal={() => clearDayField(selectedDay, 'calories')}
              onClearProt={() => clearDayField(selectedDay, 'protein')}
              onClearFluid={() => clearDayField(selectedDay, 'fluid')}
            />
          </>
        )}
      </div>

    </>
  )
}

// ── Food History Screen ───────────────────────────────────────────────────────

function FoodHistoryScreen({ lang, history, composedGroups, meals, onDelete, onRestore, onUpdate, onRemoveGroup, onSaveComposedGroup, showToast }: {
  lang:                   Lang
  history:                FoodHistory[]
  composedGroups:         ComposedGroup[]
  meals:                  Meal[]
  onDelete:               (id: string) => void
  onRestore?:             (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>) => void
  onUpdate:               (id: string, updates: Partial<Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>>) => void
  onRemoveGroup:          (id: string) => void
  onSaveComposedGroup?:   (group: ComposedGroup) => void
  showToast:              (msg: string, type: 'success' | 'error' | 'info', options?: { action?: { label: string; onClick: () => void }; durationMs?: number }) => void
}) {
  const { styleMode } = useAppContext()
  const minimal = styleMode === 'minimal'
  const [search, setSearch]       = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ name: string; grams: string; calories: string; protein: string }>({ name: '', grams: '', calories: '', protein: '' })
  const [editUnit,  setEditUnit]  = useState<UnitId | 'pcs'>('g')
  const [filter, setFilter]       = useState<'all' | 'foods' | 'beverage' | 'composed'>('all')
  const HIST_PAGE = 30
  const [visibleGroupCount, setVisibleGroupCount] = useState(HIST_PAGE)
  const scrollAreaRef   = useRef<HTMLDivElement>(null)
  const scrollBeforeLoad = useRef(0)
  useLayoutEffect(() => {
    const el = scrollAreaRef.current
    if (!el || scrollBeforeLoad.current === 0) return
    el.scrollTop = scrollBeforeLoad.current - 60
    scrollBeforeLoad.current = 0
  }, [visibleGroupCount])
  const chipScrollRef = useRef<HTMLDivElement>(null)
  const [chipCanScrollLeft,  setChipCanScrollLeft]  = useState(false)
  const [chipCanScrollRight, setChipCanScrollRight] = useState(false)
  const updateChipScroll = (el: HTMLElement) => {
    if (lang === 'he') {
      // RTL Chrome/Safari: scrollLeft=0 at right-start, goes negative scrolling left
      // canScrollLeft: not yet at the leftmost end (content still to the left)
      setChipCanScrollLeft(el.scrollLeft > -(el.scrollWidth - el.clientWidth - 2))
      // canScrollRight: scrolled past the start (content hidden to the right)
      setChipCanScrollRight(el.scrollLeft < -2)
    } else {
      setChipCanScrollLeft(el.scrollLeft > 2)
      setChipCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
    }
  }
  useEffect(() => {
    const el = chipScrollRef.current
    if (el) updateChipScroll(el)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Ratios per base unit (grams or ml) — used for proportional scaling when amount changes
  const editRatios = useRef({ calPerBase: 0, protPerBase: 0 })
  const [expandedGroupId, setExpandedGroupId]           = useState<string | null>(null)
  const [expandedHistoryGroup, setExpandedHistoryGroup] = useState<string | null>(null)
  const [editingRecipeGroup, setEditingRecipeGroup] = useState<ComposedGroup | null>(null)
  const getHistorySuggestions = useCallback((q: string) => {
    const lq = q.trim().toLowerCase()
    return lq ? history.filter(h => h.name.toLowerCase().includes(lq)).slice(0, 10) : []
  }, [history])
  const openRecipeEditor = (group: ComposedGroup, groupMeals: Meal[]) => {
    const withIngredients = group.ingredients?.length
      ? group
      : { ...group, ingredients: groupMeals.map<RecipeIngredient>(m => ({ name: m.name, grams: m.grams, calories: Math.round(m.calories), protein: Math.round(m.protein * 10) / 10, fluid_ml: m.fluid_ml ?? null, display_unit: m.display_unit ?? null, display_amount: m.display_amount ?? null })) }
    setEditingRecipeGroup(withIngredients)
  }

  const q = search.trim().toLowerCase()
  useEffect(() => { setVisibleGroupCount(HIST_PAGE) }, [q, filter])
  const beverageHistory = history.filter(h => h.fluid_ml != null && h.fluid_ml > 0)
  const baseHistory = filter === 'beverage' ? beverageHistory : history
  const filtered = q
    ? [...baseHistory]
        .map(h => ({ h, score: fuzzyScore(q, h.name) }))
        .filter(({ score }) => score >= SEARCH_THRESHOLD)
        .sort((a, b) => b.score - a.score || b.h.use_count - a.h.use_count)
        .map(({ h }) => h)
    : [...baseHistory].sort((a, b) => b.use_count - a.use_count)

  // Group by name (case-insensitive) — single-weight names show flat, multi-weight names collapse
  const historyGroups = useMemo(() => {
    const map = new Map<string, FoodHistory[]>()
    for (const item of filtered) {
      const key = item.name.toLowerCase()
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    return Array.from(map.values())
  }, [filtered])

  // Computed at scope level so both sections can use it for conditional rendering
  const filteredGroups = q
    ? composedGroups
        .map(g => ({ g, score: fuzzyScore(q, g.name) }))
        .filter(({ score }) => score >= SEARCH_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .map(({ g }) => g)
    : composedGroups

  const startEdit = (item: FoodHistory) => {
    let initialUnit: UnitId | 'pcs' = 'g'
    let displayAmt: number
    let base: number
    if (item.grams < 0) {
      initialUnit = 'pcs'; displayAmt = Math.abs(item.grams); base = displayAmt
    } else if (item.fluid_ml != null && item.fluid_ml > 0) {
      initialUnit = 'ml'; displayAmt = Math.round(item.fluid_ml); base = item.fluid_ml
    } else {
      initialUnit = 'g'; displayAmt = item.grams; base = item.grams
    }
    editRatios.current = { calPerBase: item.calories / (base || 1), protPerBase: item.protein / (base || 1) }
    setEditUnit(initialUnit)
    setEditingId(item.id)
    setEditDraft({ name: item.name, grams: String(displayAmt), calories: String(Math.round(item.calories)), protein: String(Math.round(item.protein * 10) / 10) })
  }

  const handleAmountChange = (val: string) => {
    const displayAmt = Math.abs(Number(val)) || 0
    const base = editUnit === 'pcs' ? displayAmt : toBase(displayAmt, editUnit as UnitId)
    const { calPerBase, protPerBase } = editRatios.current
    setEditDraft(d => ({
      ...d,
      grams:    val,
      calories: base > 0 ? String(Math.round(calPerBase  * base))           : d.calories,
      protein:  base > 0 ? String(Math.round(protPerBase * base * 10) / 10) : d.protein,
    }))
  }

  const handleUnitChange = (newUnit: UnitId | 'pcs') => {
    if (editUnit !== 'pcs' && newUnit !== 'pcs' && editUnit !== newUnit) {
      const displayAmt = Math.abs(Number(editDraft.grams)) || 0
      const base = toBase(displayAmt, editUnit as UnitId)
      const newDisplay = fromBase(base, newUnit as UnitId)
      setEditDraft(d => ({ ...d, grams: String(Math.round(newDisplay * 100) / 100) }))
    }
    setEditUnit(newUnit)
  }

  const saveEdit = () => {
    if (!editingId) return
    const displayAmt = Math.abs(Number(editDraft.grams))
    const isVol = editUnit !== 'pcs' && UNITS[editUnit as UnitId]?.type === 'volume'
    const isPcs = editUnit === 'pcs'
    const base  = isPcs ? displayAmt : toBase(displayAmt, editUnit as UnitId)
    onUpdate(editingId, {
      name:     editDraft.name,
      grams:    isPcs ? -displayAmt : Math.round(base),
      calories: Number(editDraft.calories),
      protein:  Number(editDraft.protein),
      fluid_ml: isVol ? base : null,
    })
    setEditingId(null)
    showToast(t(lang, 'saved'), 'success')
  }
  const handleDelete = (item: FoodHistory) => {
    const snapshot = { name: item.name, grams: item.grams, calories: item.calories, protein: item.protein, fluid_ml: item.fluid_ml }
    onDelete(item.id)
    showToast(`"${item.name}${t(lang, 'itemDeletedSuffix')}`, 'info', {
      action: onRestore ? { label: t(lang, 'undo'), onClick: () => onRestore(snapshot) } : undefined,
    })
  }
  const handleRemoveGroup = (id: string, name: string) => {
    onRemoveGroup(id)
    showToast(`"${name}${t(lang, 'itemDeletedSuffix')}`, 'info')
  }

  const inputSm: React.CSSProperties = { height: 42, fontSize: 16, padding: '0 8px', borderRadius: 8 }

  return (
    <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sticky top: title + search + filter chips */}
      <div style={{ flexShrink: 0, padding: '12px 16px 0', background: 'var(--bg)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>
          {t(lang, 'foodHistory')}
        </h2>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span className="icon" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(lang === 'he' ? { right: 10 } : { left: 10 }), color: 'var(--text-3)', fontSize: 18, pointerEvents: 'none' }}>search</span>
          <input className="inp" type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t(lang, 'search')}
            dir={dir(lang)}
            style={{ paddingInlineStart: 36, paddingInlineEnd: search ? 32 : 12 }}
          />
          {search && (
            <button
              onMouseDown={e => { e.preventDefault(); setSearch('') }}
              tabIndex={-1}
              style={{ position: 'absolute', ...(lang === 'he' ? { left: 0 } : { right: 0 }), top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <span className="icon icon-sm">close</span>
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ position: 'relative' }}>
          {chipCanScrollLeft  && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 10, width: 24, background: 'linear-gradient(to right, var(--bg), transparent)', zIndex: 1 /* local stacking */, pointerEvents: 'none' }} />}
          {chipCanScrollRight && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 10, width: 24, background: 'linear-gradient(to left, var(--bg), transparent)', zIndex: 1 /* local stacking */, pointerEvents: 'none' }} />}
          <div
            ref={chipScrollRef}
            onScroll={e => updateChipScroll(e.currentTarget)}
            style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}
          >
            {([
              { key: 'all',      labelHe: `הכל (${history.length + composedGroups.length})`,   labelEn: `All (${history.length + composedGroups.length})` },
              { key: 'foods',    labelHe: `מזונות (${history.length})`,                         labelEn: `Foods (${history.length})` },
              { key: 'beverage', labelHe: `שתייה (${beverageHistory.length})`,                  labelEn: `Drinks (${beverageHistory.length})` },
              { key: 'composed', labelHe: `מנות (${composedGroups.length})`,                    labelEn: `Dishes (${composedGroups.length})` },
            ] as const).map(({ key, labelHe, labelEn }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background .12s, color .12s',
                  background: filter === key ? 'var(--accent)' : 'var(--surface-2)',
                  color: filter === key ? 'var(--on-color)' : 'var(--text-2)',
                }}
              >
                {lang === 'he' ? labelHe : labelEn}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable list with fades */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20, background: 'linear-gradient(to bottom, var(--bg), transparent)', zIndex: 2 /* local stacking */, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'linear-gradient(to top, var(--bg), transparent)', zIndex: 2 /* local stacking */, pointerEvents: 'none' }} />
      <div ref={scrollAreaRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)' }}>

      {(filter === 'all' || filter === 'foods' || filter === 'beverage') &&
       !(filter === 'all' && q && historyGroups.length === 0) && (
        <>
          {filter === 'all' && history.length > 0 && beverageHistory.length < history.length && (
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 8px' }}>
              {t(lang, 'foods')}
            </p>
          )}
          {filter === 'beverage' && beverageHistory.length > 0 && (
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan-hi)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 8px' }}>
              {t(lang, 'drinks')}
            </p>
          )}
          {historyGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>search_off</span>
              <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noRecentFood')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: minimal ? 0 : 6 }}>
              {historyGroups.slice(0, visibleGroupCount).map(groupItems => {
                const groupKey  = groupItems[0].name.toLowerCase()
                const isGroup   = groupItems.length > 1
                const isGroupExpanded = expandedHistoryGroup === groupKey

                // Render a single history item (used for both flat and within a group)
                const renderItem = (item: FoodHistory, inGroup = false, isLastInGroup = false) => {
                  const isEditing = editingId === item.id
                  const [amtNum, amtUnit] = item.grams < 0
                    ? [String(Math.abs(item.grams)), t(lang, 'unitLabel')]
                    : item.fluid_ml != null && item.fluid_ml > 0
                      ? item.fluid_ml >= 1000
                        ? [(item.fluid_ml / 1000).toFixed(1), t(lang, 'litersUnit')]
                        : [String(Math.round(item.fluid_ml)), t(lang, 'unitOptMl')]
                      : [String(item.grams), t(lang, 'proteinUnit')]
                  const usesLabel = item.use_count === 1 ? t(lang, 'useSingular') : t(lang, 'uses')
                  const isFluid = item.fluid_ml != null && item.fluid_ml > 0
                  return (
                    <div
                      key={item.id}
                      style={minimal
                        ? { borderBottom: isLastInGroup ? 'none' : '1px dashed var(--border)' }
                        : inGroup
                          ? { borderBottom: '1px solid var(--border)' }
                          : { background: 'var(--bg-card)', border: `1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color .15s' }
                      }
                    >
                      {!isEditing ? (
                        minimal ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                                {!inGroup && (
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                    {item.name}
                                    {isFluid && <span className="icon" style={{ fontSize: 12, color: 'var(--cyan-hi)', opacity: 0.8, verticalAlign: 'middle', margin: '0 4px' }}>water_drop</span>}
                                  </span>
                                )}
                                <span style={{ fontSize: inGroup ? 12 : 11, fontWeight: inGroup ? 600 : 400, color: inGroup ? 'var(--text)' : 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {amtNum} {amtUnit}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>| {item.use_count} {usesLabel}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: inGroup ? 0 : 2 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                                  {Math.round(item.calories)}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                                  {Math.round(item.protein * 10) / 10}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'gProteinLabel')}</span>
                                </span>
                              </div>
                            </div>
                            <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', borderRadius: 6, flexShrink: 0 }}>
                              <span className="icon icon-sm">edit</span>
                            </button>
                            <button onClick={() => handleDelete(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, display: 'flex', borderRadius: 6, flexShrink: 0 }}>
                              <span className="icon icon-sm">delete</span>
                            </button>
                          </div>
                        ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: inGroup ? '8px 12px' : '10px 12px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {!inGroup && (
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'row', direction: dir(lang), gap: 5, alignItems: 'baseline', margin: inGroup ? 0 : '2px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                                <span>{amtNum}</span><span style={{ fontSize: 10 }}>{amtUnit}</span>
                              </span>
                              <span style={{ color: 'var(--border)' }}>·</span>
                              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                                <span style={{ color: 'var(--accent-hi)', fontWeight: 600 }}>{Math.round(item.calories)}</span><span style={{ fontSize: 10 }}>{t(lang, 'caloriesUnit')}</span>
                              </span>
                              <span style={{ color: 'var(--border)' }}>·</span>
                              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                                <span style={{ color: 'var(--positive-hi)', fontWeight: 600 }}>{Math.round(item.protein * 10) / 10}</span><span style={{ fontSize: 10 }}>{t(lang, 'proteinUnit')}</span>
                              </span>
                              <span style={{ color: 'var(--border)' }}>·</span>
                              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                                <span>{item.use_count}</span><span style={{ fontSize: 10 }}>{usesLabel}</span>
                              </span>
                            </div>
                          </div>
                          <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 6, display: 'flex', borderRadius: 8 }}>
                            <span className="icon icon-sm">edit</span>
                          </button>
                          <button onClick={() => handleDelete(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 6, display: 'flex', borderRadius: 8 }}>
                            <span className="icon icon-sm">delete</span>
                          </button>
                        </div>
                        )
                      ) : (
                        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ position: 'relative' }}>
                            <input className="inp" value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                              placeholder={t(lang, 'namePlaceholder')} style={{ ...inputSm, paddingInlineEnd: editDraft.name ? 28 : 8 }} dir={dir(lang)} />
                            {editDraft.name && (
                              <button onMouseDown={e => { e.preventDefault(); setEditDraft(d => ({ ...d, name: '' })) }} tabIndex={-1}
                                style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="icon icon-sm">close</span>
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                            <div>
                              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>
                                {t(lang, 'amountLabel')}
                              </label>
                              <div style={{ position: 'relative' }}>
                                <input className="inp" type="number" inputMode="decimal" value={editDraft.grams}
                                  onFocus={e => e.target.select()}
                                  onChange={e => handleAmountChange(e.target.value)}
                                  style={{ ...inputSm, borderColor: 'var(--accent-border)', paddingInlineEnd: editDraft.grams ? 28 : 8 }} />
                                {editDraft.grams && (
                                  <button onMouseDown={e => { e.preventDefault(); setEditDraft(d => ({ ...d, grams: '' })) }} tabIndex={-1}
                                    style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="icon icon-sm">close</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>
                                {t(lang, 'unitHeader')}
                              </label>
                              <select className="inp" value={editUnit} onChange={e => handleUnitChange(e.target.value as UnitId | 'pcs')}
                                style={{ ...inputSm, width: '100%' }}>
                                <option value="g">g</option>
                                <option value="oz">{lang === 'he' ? UNITS.oz.abbr_he : 'oz'}</option>
                                <option value="ml">ml</option>
                                <option value="cup">{lang === 'he' ? UNITS.cup.abbr_he : 'cup'}</option>
                                <option value="tbsp">{lang === 'he' ? UNITS.tbsp.abbr_he : 'tbsp'}</option>
                                <option value="tsp">{lang === 'he' ? UNITS.tsp.abbr_he : 'tsp'}</option>
                                <option value="fl_oz">{lang === 'he' ? UNITS.fl_oz.abbr_he : 'fl oz'}</option>
                                <option value="pcs">{t(lang, 'serving')}</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-hi)', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                                {`${t(lang, 'calories')} (${t(lang, 'caloriesUnit')})`}
                                <span className="icon" style={{ fontSize: 10, opacity: 0.6 }} title={t(lang, 'autoScaledHint')}>calculate</span>
                              </label>
                              <div style={{ position: 'relative' }}>
                                <input className="inp" type="number" inputMode="decimal" value={editDraft.calories}
                                  onFocus={e => e.target.select()}
                                  onChange={e => setEditDraft(d => ({ ...d, calories: e.target.value }))}
                                  style={{ ...inputSm, paddingInlineEnd: editDraft.calories ? 28 : 8 }} />
                                {editDraft.calories && (
                                  <button onMouseDown={e => { e.preventDefault(); setEditDraft(d => ({ ...d, calories: '' })) }} tabIndex={-1}
                                    style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="icon icon-sm">close</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--positive-hi)', display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                                {`${t(lang, 'protein')} (${t(lang, 'proteinUnit')})`}
                                <span className="icon" style={{ fontSize: 10, opacity: 0.6 }} title={t(lang, 'autoScaledHint')}>calculate</span>
                              </label>
                              <div style={{ position: 'relative' }}>
                                <input className="inp" type="number" inputMode="decimal" value={editDraft.protein}
                                  onFocus={e => e.target.select()}
                                  onChange={e => setEditDraft(d => ({ ...d, protein: e.target.value }))}
                                  style={{ ...inputSm, paddingInlineEnd: editDraft.protein ? 28 : 8 }} />
                                {editDraft.protein && (
                                  <button onMouseDown={e => { e.preventDefault(); setEditDraft(d => ({ ...d, protein: '' })) }} tabIndex={-1}
                                    style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="icon icon-sm">close</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setEditingId(null)} className="btn-ghost" style={{ flex: 1, height: 34, fontSize: 12, borderRadius: 8 }}>
                              {t(lang, 'cancel')}
                            </button>
                            <button onClick={saveEdit} className="btn-primary" style={{ flex: 1, height: 34, fontSize: 12, borderRadius: 8 }}>
                              {t(lang, 'save')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                if (!isGroup) {
                  return renderItem(groupItems[0])
                }

                // Multi-weight group — collapsible
                const totalUses = groupItems.reduce((s, x) => s + x.use_count, 0)
                return (
                  <div key={groupKey} style={minimal
                    ? { borderBottom: isGroupExpanded ? 'none' : '1px dashed var(--border)' }
                    : { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
                  }>
                    {/* Group header */}
                    <button
                      onClick={() => setExpandedHistoryGroup(isGroupExpanded ? null : groupKey)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                        padding: minimal ? '8px 0' : '10px 12px',
                        borderBottom: minimal ? 'none' : (isGroupExpanded ? '1px solid var(--border)' : 'none'),
                      }}
                    >
                      {!minimal && <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>layers</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {minimal ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{groupItems[0].name}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{groupItems.length} {t(lang, 'variants')}</span>
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{totalUses} {t(lang, 'usesAbbr')}</span>
                          </>
                        ) : (
                          <>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupItems[0].name}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                              {groupItems.length} {t(lang, 'variants')} · {totalUses} {t(lang, 'usesAbbr')}
                            </p>
                          </>
                        )}
                      </div>
                      <span className="icon icon-chevron" style={{ color: 'var(--text-3)', flexShrink: 0, transition: 'transform .2s', transform: isGroupExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                    </button>
                    {/* Expanded items */}
                    {isGroupExpanded && (
                      <div style={minimal ? {
                        background: 'var(--composed-tint)',
                        borderTop: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        marginInline: -16,
                        paddingInline: 16,
                      } : {}}>
                        {groupItems.map((item, gi) => renderItem(item, true, gi === groupItems.length - 1))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {(filter === 'all' || filter === 'composed') &&
       !(filter === 'all' && q && filteredGroups.length === 0) && (
        <>
          {filter === 'all' && (
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 8px' }}>
              {t(lang, 'dishesHeader')}
            </p>
          )}
          {filteredGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
              <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>{composedGroups.length === 0 ? 'dinner_dining' : 'search_off'}</span>
              <p style={{ fontSize: 13, margin: 0 }}>{composedGroups.length === 0 ? t(lang, 'noComposedDishes') : t(lang, 'noResults')}</p>
              {composedGroups.length === 0 && <p style={{ fontSize: 12, margin: '4px 0 0', opacity: 0.7 }}>{t(lang, 'noComposedDishesSub')}</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: minimal ? 0 : 6 }}>
            {filteredGroups.map(group => {
                const groupMeals = meals.filter(m => group.mealIds.includes(m.id))
                const totalCal   = Math.round(groupMeals.reduce((s, m) => s + m.calories, 0))
                const totalProt  = Math.round(groupMeals.reduce((s, m) => s + m.protein, 0) * 10) / 10
                const isExpanded = expandedGroupId === group.id
                return (
                  <div key={group.id} style={minimal
                    ? { borderBottom: isExpanded ? 'none' : '1px dashed var(--border)' }
                    : { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
                  }>
                    {/* Group header — 2-row layout matching regular history items */}
                    <div
                      role="button" tabIndex={0}
                      onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedGroupId(isExpanded ? null : group.id) } }}
                      style={{ display: 'flex', alignItems: 'center', gap: minimal ? 6 : 10, padding: minimal ? '8px 0' : '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      {/* Icon */}
                      {minimal
                        ? <span className="icon icon-sm" style={{ color: 'var(--composed)', flexShrink: 0 }}>restaurant</span>
                        : <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'var(--composed-tint)', border: '1px solid var(--composed-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="icon icon-sm" style={{ color: 'var(--composed)', fontSize: 15 }}>restaurant</span>
                          </div>
                      }
                      {/* Name + stats (2 rows) */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{group.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{groupMeals.length} {t(lang, 'ingredientsUnit')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 5, direction: dir(lang), alignItems: 'baseline', marginTop: 2, fontSize: 11, color: 'var(--text-3)' }}>
                          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--accent-hi)' }}>{totalCal}</span>
                            <span style={{ fontSize: 10 }}>{t(lang, 'caloriesUnit')}</span>
                          </span>
                          <span style={{ color: 'var(--border)' }}>|</span>
                          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--positive-hi)' }}>{totalProt}</span>
                            <span style={{ fontSize: 10 }}>{t(lang, 'proteinUnit')}</span>
                          </span>
                        </div>
                      </div>
                      {/* Expand chevron */}
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedGroupId(isExpanded ? null : group.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: minimal ? 4 : 6, display: 'flex', borderRadius: 8, flexShrink: 0 }}
                        aria-label={isExpanded ? t(lang, 'collapseGroup') : t(lang, 'expandGroup')}
                      >
                        <span className="icon icon-chevron" style={{ transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={e => { e.stopPropagation(); handleRemoveGroup(group.id, group.name) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: minimal ? 4 : 6, display: 'flex', borderRadius: 8, flexShrink: 0 }}
                        aria-label={t(lang, 'delete')}
                      >
                        <span className="icon icon-sm">delete</span>
                      </button>
                    </div>
                    {/* Expanded ingredient list */}
                    {isExpanded && (
                      <div style={{
                        background: 'var(--composed-tint)',
                        borderTop: '1px solid var(--border)',
                        borderBottom: minimal ? '1px solid var(--border)' : undefined,
                        marginInline: minimal ? -16 : -12,
                        paddingInlineStart: minimal ? 28 : 24,
                        paddingInlineEnd: minimal ? 28 : 24,
                        paddingBlock: '0 8px',
                      }}>
                        {groupMeals.map((meal, mi) => (
                          <div key={meal.id} style={{ borderTop: mi === 0 ? 'none' : '1px dashed var(--border)', padding: '6px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--composed-border-hi)', flexShrink: 0 }} />
                              <span style={{ flexShrink: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meal.name}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {meal.fluid_ml && !meal.fluid_excluded ? `${Math.round(meal.fluid_ml)}ml` : `${Math.abs(meal.grams)}${t(lang, 'gramsUnit')}`}
                              </span>
                              <span style={{ flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, paddingInlineStart: 9 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                                {Math.round(meal.calories)}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                                {Math.round(meal.protein * 10) / 10}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
                              </span>
                              {meal.fat != null && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning-hi)', opacity: 0.85, display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                                  {meal.fat}{t(lang, 'fatUnit')}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'fat')}</span>
                                </span>
                              )}
                              {meal.carbs != null && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--library-hi)', opacity: 0.85, display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                                  {meal.carbs}{t(lang, 'carbsUnit')}<span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>{t(lang, 'carbs')}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {/* Edit/add button */}
                        {onSaveComposedGroup && (
                          <button
                            onClick={() => openRecipeEditor(group, groupMeals)}
                            style={{
                              marginTop: 6, width: '100%', background: 'transparent',
                              border: '1px dashed var(--composed-glow)', borderRadius: 8,
                              padding: '6px 10px', fontFamily: 'inherit',
                              fontSize: 11, fontWeight: 600, color: 'var(--composed)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                            }}
                          >
                            <span className="icon" style={{ fontSize: 14 }}>edit</span>
                            {group.ingredients?.length ? t(lang, 'editRecipe') : t(lang, 'addIngredient')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {visibleGroupCount < historyGroups.length && (
                <button
                  onClick={() => {
                    scrollBeforeLoad.current = scrollAreaRef.current?.scrollHeight ?? 0
                    setVisibleGroupCount(c => c + HIST_PAGE)
                  }}
                  style={{
                    display: 'block', width: '100%', padding: '12px 14px',
                    background: 'transparent', border: 'none', borderTop: '1px solid var(--border)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)',
                    textAlign: 'center', borderRadius: 0,
                  }}
                >
                  {t(lang, 'showMorePrefix')}{Math.min(HIST_PAGE, historyGroups.length - visibleGroupCount)}{t(lang, 'showMoreSuffix')}
                </button>
              )}
            </div>
          )
          }
        </>
      )}

      {filter === 'all' && q && historyGroups.length === 0 && filteredGroups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
          <span className="icon" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>search_off</span>
          <p style={{ fontSize: 13, margin: 0 }}>{t(lang, 'noResults')}</p>
        </div>
      )}

      </div>{/* /scroll inner */}
      </div>{/* /scroll wrapper with fades */}
    </div>

    {/* Edit recipe modal — opened from composed group rows */}
    {editingRecipeGroup && onSaveComposedGroup && (
      <EditRecipeModal
        group={editingRecipeGroup}
        lang={lang}
        history={history}
        getSuggestions={getHistorySuggestions}
        onSave={updated => { onSaveComposedGroup(updated); setEditingRecipeGroup(null) }}
        onClose={() => setEditingRecipeGroup(null)}
      />
    )}
    </>
  )
}

// ── Library Screen ────────────────────────────────────────────────────────────

const LIBRARY_CATEGORIES_HE: Record<string, string> = {
  vegetable: 'ירקות', fruit: 'פירות', protein_meat: 'עוף ובשר',
  protein_fish: 'דגים', egg_dairy: 'ביצים ויוגורט', cheese: 'גבינות',
  nuts: 'אגוזים ופיצוחים', grain: 'דגנים', legume: 'קטניות',
  oil_fat: 'שמנים ושומנים', sauce_spread: 'רטבים וממרחים', beverage: 'משקאות', soup: 'מרקים',
  alcohol: 'משקאות אלכוהוליים',
}
const LIBRARY_CATEGORIES_EN: Record<string, string> = {
  vegetable: 'Vegetables', fruit: 'Fruits', protein_meat: 'Chicken & Meat',
  protein_fish: 'Fish', egg_dairy: 'Eggs & Dairy', cheese: 'Cheeses',
  nuts: 'Nuts & Seeds', grain: 'Grains', legume: 'Legumes',
  oil_fat: 'Oils & Fats', sauce_spread: 'Sauces & Spreads', beverage: 'Beverages', soup: 'Soups',
  alcohol: 'Alcoholic Drinks',
}
const CATEGORY_ORDER = ['protein_meat', 'protein_fish', 'egg_dairy', 'cheese', 'vegetable', 'fruit', 'grain', 'legume', 'nuts', 'oil_fat', 'sauce_spread', 'beverage', 'soup', 'alcohol']

function LibraryScreen({ lang }: { lang: Lang }) {
  const { library, loading } = useFoodLibrary()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const chipScrollRef = useRef<HTMLDivElement>(null)
  const [chipCanScrollLeft,  setChipCanScrollLeft]  = useState(false)
  const [chipCanScrollRight, setChipCanScrollRight] = useState(false)
  const updateChipScroll = (el: HTMLElement) => {
    if (lang === 'he') {
      setChipCanScrollLeft(el.scrollLeft > -(el.scrollWidth - el.clientWidth - 2))
      setChipCanScrollRight(el.scrollLeft < -2)
    } else {
      setChipCanScrollLeft(el.scrollLeft > 2)
      setChipCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
    }
  }
  useEffect(() => {
    const el = chipScrollRef.current
    if (el) updateChipScroll(el)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useCallback(() => CATEGORY_ORDER, [])()
  const catLabels = lang === 'he' ? LIBRARY_CATEGORIES_HE : LIBRARY_CATEGORIES_EN
  const isRTL = lang === 'he'

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    library.forEach(item => { counts[item.category] = (counts[item.category] ?? 0) + 1 })
    return counts
  }, [library])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const catFilter = (item: typeof library[0]) => !activeCategory || item.category === activeCategory
    if (!q) return library.filter(catFilter)
    return library
      .map(item => ({
        item,
        score: Math.max(fuzzyScore(q, item.name_he), fuzzyScore(q, item.name_en)),
      }))
      .filter(({ item, score }) => catFilter(item) && score >= SEARCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)
  }, [library, search, activeCategory])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Sticky top: title + search + chips */}
      <div style={{ flexShrink: 0, padding: '12px 16px 0', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0, flex: 1 }}>
            {t(lang, 'foodLibrary')}
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {library.length} {t(lang, 'items')}
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span className="icon icon-sm" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(isRTL ? { right: 10 } : { left: 10 }), color: 'var(--text-3)', pointerEvents: 'none' }}>search</span>
          <input
            className="inp"
            type="text"
            placeholder={t(lang, 'searchFood')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingInlineStart: 34, paddingInlineEnd: search ? 32 : 12 }}
          />
          {search && (
            <button
              onMouseDown={e => { e.preventDefault(); setSearch('') }}
              tabIndex={-1}
              style={{ position: 'absolute', ...(isRTL ? { left: 0 } : { right: 0 }), top: 0, bottom: 0, width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <span className="icon icon-sm">close</span>
            </button>
          )}
        </div>

        {/* Category chips */}
        <div style={{ position: 'relative' }}>
          {chipCanScrollLeft  && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 10, width: 24, background: 'linear-gradient(to right, var(--bg), transparent)', zIndex: 1 /* local stacking */, pointerEvents: 'none' }} />}
          {chipCanScrollRight && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 10, width: 24, background: 'linear-gradient(to left, var(--bg), transparent)', zIndex: 1 /* local stacking */, pointerEvents: 'none' }} />}
          <div
            ref={chipScrollRef}
            onScroll={e => updateChipScroll(e.currentTarget)}
            style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}
          >
            {[{ cat: null, label: `${t(lang, 'all')} (${library.length})` },
              ...categories.filter(c => categoryCounts[c]).map(c => ({ cat: c, label: `${catLabels[c] ?? c} (${categoryCounts[c]})` }))
            ].map(({ cat, label }) => (
              <button
                key={cat ?? '__all'}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background .12s, color .12s',
                  background: activeCategory === cat ? 'var(--accent)' : 'var(--surface-2)',
                  color: activeCategory === cat ? 'var(--on-color)' : 'var(--text-2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable results */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20, background: 'linear-gradient(to bottom, var(--bg), transparent)', zIndex: 2 /* local stacking */, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'linear-gradient(to top, var(--bg), transparent)', zIndex: 2 /* local stacking */, pointerEvents: 'none' }} />
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '4px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
            <span className="icon" style={{ fontSize: 24, display: 'block', marginBottom: 8, animation: 'spin 0.7s linear infinite' }}>progress_activity</span>
            {t(lang, 'loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 13 }}>
            <span className="icon" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: 0.4 }}>help_outline</span>
            <p style={{ margin: 0 }}>{t(lang, 'unknownFood')}</p>
            <p style={{ fontSize: 12, margin: '4px 0 0', opacity: 0.7 }}>{t(lang, 'unknownFoodSub')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filtered.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 4px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                {(() => {
                  const ss       = item.serving_size ?? 100
                  const su       = (item.serving_unit ?? 'g') as UnitId
                  const isVolume = su in UNITS && UNITS[su].type === 'volume'
                  const isWeight = su === 'g' || su === 'oz'
                  const grams    = isVolume
                    ? mlToGrams(toBase(ss, su), item.density ?? 1)
                    : isWeight ? toBase(ss, su) : ss
                  const cal   = Math.round(item.calories_per_100g * grams / 100)
                  const prot  = Math.round(item.protein_per_100g  * grams / 100 * 10) / 10
                  const fat   = item.fat_per_100g   != null ? Math.round(item.fat_per_100g   * grams / 100 * 10) / 10 : null
                  const carbs = item.carbs_per_100g != null ? Math.round(item.carbs_per_100g * grams / 100 * 10) / 10 : null
                  const servingUnitLabel = isWeight
                    ? t(lang, 'gramsUnit')
                    : su === 'cup'   ? t(lang, 'unitOptCup')
                    : su === 'ml'    ? t(lang, 'unitOptMl')
                    : su === 'fl_oz' ? t(lang, 'unitOptFlOz')
                    : su === 'tbsp'  ? t(lang, 'unitOptTbsp')
                    : su === 'tsp'   ? t(lang, 'unitOptTsp')
                    : su === 'oz'    ? t(lang, 'unitOptOz')
                    : su
                  return (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {isRTL ? item.name_he : item.name_en}
                          {' · '}
                          <span dir="ltr" style={{ display: 'inline-flex', alignItems: 'baseline', fontSize: 11, fontWeight: 400, color: 'var(--text-3)' }}><span>{ss}</span><span>{servingUnitLabel}</span></span>
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                          {catLabels[item.category] ?? item.category}
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center', flexShrink: 0, maxWidth: 'calc(100% - 80px)' }}>
                        {isRTL ? (
                          // Hebrew LTR visual order: carbs · fat · protein · calories
                          // Within each group: number · unit · label
                          <>
                            {carbs != null && <>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--library-hi)' }}>{carbs}</span>
                              <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--library-hi)' }}>{t(lang, 'carbsUnit')}</span>
                              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, color: 'var(--library-hi)' }}>{t(lang, 'carbs')}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 2px' }}>·</span>
                            </>}
                            {fat != null && <>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning-hi)' }}>{fat}</span>
                              <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--warning-hi)' }}>{t(lang, 'fatUnit')}</span>
                              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, color: 'var(--warning-hi)' }}>{t(lang, 'fat')}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 2px' }}>·</span>
                            </>}
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive-hi)' }}>{prot}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--positive-hi)' }}>{t(lang, 'proteinUnit')}</span>
                            <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, color: 'var(--positive-hi)' }}>{t(lang, 'protein')}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 2px' }}>·</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hi)' }}>{cal}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--accent-hi)' }}>{t(lang, 'caloriesUnit')}</span>
                          </>
                        ) : (
                          // English LTR visual order: calories · protein · fat · carbs
                          // Within each group: number · unit (cal/prot), label · number · unit (fat/carbs)
                          <>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hi)' }}>{cal}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--accent-hi)' }}>{t(lang, 'caloriesUnit')}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 2px' }}>·</span>
                            <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, color: 'var(--positive-hi)' }}>{t(lang, 'protein')}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--positive-hi)' }}>{prot}</span>
                            <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--positive-hi)' }}>{t(lang, 'proteinUnit')}</span>
                            {fat != null && <>
                              <span style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 2px' }}>·</span>
                              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, color: 'var(--warning-hi)' }}>{t(lang, 'fat')}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning-hi)' }}>{fat}</span>
                              <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--warning-hi)' }}>{t(lang, 'fatUnit')}</span>
                            </>}
                            {carbs != null && <>
                              <span style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 2px' }}>·</span>
                              <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75, color: 'var(--library-hi)' }}>{t(lang, 'carbs')}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--library-hi)' }}>{carbs}</span>
                              <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, color: 'var(--library-hi)' }}>{t(lang, 'carbsUnit')}</span>
                            </>}
                          </>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>{/* /scroll inner */}
      </div>{/* /scroll wrapper with fades */}
    </div>
  )
}

// ── Preferences Screen ────────────────────────────────────────────────────────

function PreferencesScreen({ lang, profile, onSave, showToast, saveRef, onSaveDone }: {
  lang:      Lang
  profile:   UserProfile
  onSave:    (updates: Partial<UserProfile>) => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  saveRef:    React.MutableRefObject<(() => void) | null>
  onSaveDone: () => void
}) {
  const [draft, setDraft] = useState({
    weightUnit:          profile.weightUnit,
    volumeUnit:          profile.volumeUnit,
    fluidThresholdMl:    profile.fluidThresholdMl,
    fluidZeroCalOnly:    profile.fluidZeroCalOnly,
    defaultServingGrams: profile.defaultServingGrams,
  })

  const set = <K extends keyof typeof draft>(key: K, val: typeof draft[K]) =>
    setDraft(p => ({ ...p, [key]: val }))

  const handleSave = () => {
    onSave(draft)
    onSaveDone()
    showToast(t(lang, 'preferencesSaved'), 'success')
  }
  saveRef.current = handleSave

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5,
  }

  return (
    <>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 18px' }}>
        {t(lang, 'preferences')}
      </h2>

      {/* Units */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>
        {t(lang, 'unitsLabel')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
        <div>
          <label style={labelStyle}>{t(lang, 'weight')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['g', 'oz'] as const).map(u => (
              <button
                key={u}
                onClick={() => set('weightUnit', u)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, fontFamily: 'inherit',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: draft.weightUnit === u ? 'var(--accent-select)' : 'var(--bg-card)',
                  border: `1.5px solid ${draft.weightUnit === u ? 'var(--accent)' : 'var(--border)'}`,
                  color: draft.weightUnit === u ? 'var(--accent-hi)' : 'var(--text-2)',
                  transition: 'all .15s',
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t(lang, 'volume')}</label>
          <select
            className="inp"
            value={draft.volumeUnit}
            onChange={e => set('volumeUnit', e.target.value as UserProfile['volumeUnit'])}
            style={{ cursor: 'pointer', padding: '0 10px', height: 40, fontSize: 16 }}
          >
            {(['ml', 'cup', 'tbsp', 'tsp', 'fl_oz'] as const).map(u => (
              <option key={u} value={u}>{u === 'fl_oz' ? 'fl oz' : u}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Fluid detection */}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 18px' }} />
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 14px' }}>
        {t(lang, 'fluidThreshold')}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input
          type="number"
          inputMode="numeric"
          className="inp"
          style={{ width: 70, textAlign: 'center', flexShrink: 0, fontSize: 16 }}
          value={draft.fluidThresholdMl}
          onChange={e => set('fluidThresholdMl', Number(e.target.value) || 100)}
        />
        <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>ml</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>
          {t(lang, 'zerocalOnly')}
        </span>
        <button
          onClick={() => set('fluidZeroCalOnly', !draft.fluidZeroCalOnly)}
          aria-label={t(lang, 'toggle')}
          style={{
            width: 44, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: draft.fluidZeroCalOnly ? 'var(--accent)' : 'var(--neutral-glow)',
            position: 'relative', transition: 'background .2s',
          }}
        >
          <span style={{
            position: 'absolute', width: 18, height: 18, borderRadius: '50%', background: 'var(--toggle-knob)',
            top: 4, insetInlineEnd: draft.fluidZeroCalOnly ? 4 : 22,
            transition: 'inset-inline-end .2s',
          }} />
        </button>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 28px', lineHeight: 1.5 }}>
        {lang === 'he'
          ? 'כשהמתג דלוק — רק נוזלים עם 0 קלוריות יחושבו ליעד (מים, סודה, קפה שחור...).'
          : 'When enabled — only zero-calorie fluids count toward your goal (water, soda, black coffee...).'}
      </p>

      {/* Default serving size */}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 18px' }} />
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 14px' }}>
        {t(lang, 'defaultServingGrams')}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input
          type="number"
          inputMode="numeric"
          className="inp"
          style={{ width: 80, textAlign: 'center', flexShrink: 0, fontSize: 16 }}
          min={10}
          max={500}
          value={draft.defaultServingGrams}
          onChange={e => set('defaultServingGrams', Math.min(500, Math.max(10, Number(e.target.value) || 150)))}
        />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>g</span>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 28px', lineHeight: 1.5 }}>
        {lang === 'he'
          ? 'כמות הגרמים שתחושב כ"מנה אחת" כשאין מידע ספציפי בספריית המזונות.'
          : 'The gram amount used as "1 serving" when no specific library data is available.'}
      </p>

    </>
  )
}

// ── My Foods Screen ───────────────────────────────────────────────────────────

function AddFoodForm({ lang, onSave, onCancel }: {
  lang:     Lang
  onSave:   (item: Omit<UserFoodItem, 'id' | 'user_id' | 'created_at'>) => Promise<unknown>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const editor = useNutritionAmountEditor({ initialAmount: '100', initialUnit: 'g', initialCalories: 0, initialProtein: 0, initialSg: 100, enableScaling: true })

  const handleSave = async () => {
    const amt  = parseFloat(editor.amountStr) || 100
    const calN = Number(editor.calories) || 0
    const protN= Number(editor.protein)  || 0
    if (!name.trim() || !calN) return
    const isVol = editor.unit !== 'pcs' && UNITS[editor.unit as UnitId].type === 'volume'
    const base  = editor.unit === 'pcs' ? amt : toBase(amt, editor.unit as UnitId)
    const cal100 = base > 0 ? Math.round(calN  * 100 / base) : calN
    const prot100= base > 0 ? Math.round(protN * 100 / base * 10) / 10 : protN
    setSaving(true)
    await onSave({
      name:              name.trim(),
      calories_per_100g: cal100,
      protein_per_100g:  prot100,
      fat_per_100g:      null,
      carbs_per_100g:    null,
      default_unit:      isVol ? editor.unit : editor.unit === 'pcs' ? 'pcs' : 'g',
      default_amount:    amt,
    })
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
      {/* Name */}
      <input
        className="inp"
        placeholder={t(lang, 'foodName')}
        value={name}
        onChange={e => setName(e.target.value)}
        dir={dir(lang)}
        style={{ fontSize: 16 }}
        autoFocus
      />
      {/* Cal · Prot · Amount · Unit — same 4-col grid as MealCard edit */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{t(lang, 'calories')}</label>
          <input type="number" inputMode="numeric" className="inp" style={{ fontSize: 16 }}
            value={editor.calories} placeholder="0"
            onChange={e => editor.setCalories(e.target.value === '' ? '' : Number(e.target.value))}
            onFocus={() => { if (editor.calories === 0) editor.setCalories('') }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--positive-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{t(lang, 'proteinGramsLabel')}</label>
          <input type="number" inputMode="decimal" step="0.1" className="inp inp-green" style={{ fontSize: 16 }}
            value={editor.protein} placeholder="0"
            onChange={e => editor.setProtein(e.target.value === '' ? '' : Number(e.target.value))}
            onFocus={() => { if (editor.protein === 0) editor.setProtein('') }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{t(lang, 'amount')}</label>
          <input type="number" inputMode="decimal" className="inp" style={{ fontSize: 16 }}
            value={editor.amountStr} placeholder="100"
            onChange={e => editor.handleAmountChange(e.target.value)}
            onFocus={e => e.target.select()}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{t(lang, 'unitSingular')}</label>
          <select className="inp" style={{ fontSize: 16 }} value={editor.unit}
            onChange={e => editor.handleUnitChange(e.target.value as Parameters<typeof editor.handleUnitChange>[0])}>
            <optgroup label={t(lang, 'unitGroupWeight')}>
              <option value="g">{t(lang, 'unitOptG')}</option>
              <option value="oz">{t(lang, 'unitOptOz')}</option>
            </optgroup>
            <optgroup label={t(lang, 'unitGroupVolume')}>
              <option value="ml">{t(lang, 'unitOptMl')}</option>
              <option value="cup">{t(lang, 'unitOptCup')}</option>
              <option value="tbsp">{t(lang, 'unitOptTbsp')}</option>
              <option value="tsp">{t(lang, 'unitOptTsp')}</option>
            </optgroup>
            <optgroup label={t(lang, 'unitGroupCount')}>
              <option value="pcs">{t(lang, 'serving')}</option>
            </optgroup>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} disabled={saving || !name.trim() || !editor.calories} className="btn-confirm" style={{ flex: 1 }}>
          {t(lang, 'save')}
        </button>
        <button onClick={onCancel} className="btn-ghost" style={{ flex: 1 }}>
          {t(lang, 'cancel')}
        </button>
      </div>
    </div>
  )
}

function MyFoodsScreen({ lang, items, onAdd, onDelete, showToast }: {
  lang:       Lang
  items:      UserFoodItem[]
  onAdd?:     (item: Omit<UserFoodItem, 'id' | 'user_id' | 'created_at'>) => Promise<unknown>
  onDelete?:  (id: string) => void
  showToast:  (msg: string, type: Toast['type']) => void
}) {
  const [adding, setAdding] = useState(false)

  const handleSave = async (item: Omit<UserFoodItem, 'id' | 'user_id' | 'created_at'>) => {
    if (!onAdd) return
    const err = await onAdd(item)
    if (!err) { showToast(t(lang, 'myFoodAdded'), 'success'); setAdding(false) }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '12px 16px 0', background: 'var(--bg)', borderBottom: adding ? 'none' : '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0, flex: 1 }}>
            {t(lang, 'myFoods')}
          </h2>
          {onAdd && items.length > 0 && (
            <button
              onClick={() => setAdding(a => !a)}
              style={{ background: adding ? 'transparent' : 'var(--accent)', color: adding ? 'var(--text-3)' : 'var(--on-color)', border: adding ? '1px solid var(--border)' : 'none', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <span className="icon icon-sm">{adding ? 'close' : 'add'}</span>
              {t(lang, adding ? 'cancel' : 'addMyFood')}
            </button>
          )}
        </div>
      </div>

      {/* Add form — same as MealCard edit, shown inline below header */}
      {adding && onAdd && (
        <AddFoodForm lang={lang} onSave={handleSave} onCancel={() => setAdding(false)} />
      )}

      {/* List / empty state */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0 && !adding ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: '0 32px' }}>
            <span className="icon" style={{ fontSize: 48, color: 'var(--text-3)', opacity: 0.5 }}>bookmark_border</span>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 6px' }}>{t(lang, 'myFoodsEmpty')}</p>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>{t(lang, 'myFoodsEmptySub')}</p>
            </div>
            {onAdd && (
              <button
                onClick={() => setAdding(true)}
                style={{ background: 'var(--accent)', color: 'var(--on-color)', border: 'none', borderRadius: 24, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}
              >
                <span className="icon">add</span>
                {t(lang, 'addMyFood')}
              </button>
            )}
          </div>
        ) : items.map(item => {
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir={dir(lang)}>
                  {item.name}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0' }}>
                  <span style={{ color: 'var(--accent-hi)', fontWeight: 600 }}>{Math.round(item.calories_per_100g)}</span>
                  {' '}{t(lang, 'cal100g')} · <span style={{ color: 'var(--positive-hi)', fontWeight: 600 }}>{Math.round(item.protein_per_100g * 10) / 10}</span>
                  {' '}{t(lang, 'prot100g')} · {item.default_amount}{item.default_unit !== 'pcs' ? item.default_unit : ` ${t(lang, 'serving')}`}
                </p>
              </div>
              {onDelete && (
                <button
                  className="icon-btn danger"
                  onClick={() => { onDelete(item.id); showToast(t(lang, 'myFoodDeleted'), 'info') }}
                  aria-label={t(lang, 'delete')}
                  style={{ flexShrink: 0 }}
                >
                  <span className="icon icon-sm">delete</span>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── SettingsSheet ─────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  isOpen:          boolean
  onClose:         () => void
  lang:            Lang
  connected:       boolean
  profile:         UserProfile
  onSaveProfile:   (updates: Partial<UserProfile>) => void | Promise<void>
  goals:           Goal | null
  onSaveGoals:     (updates: Partial<Goal>) => void
  onToggleLang:    () => void
  onSignOut:       () => void
  onLinkGoogle?:   () => void
  hasGoogleLinked?: boolean
  theme:               'dark' | 'light'
  styleMode:           'classic' | 'minimal'
  onToggleTheme:       () => void
  onSelectStyleMode:   (m: 'classic' | 'minimal') => void
  showToast:          (message: string, type: Toast['type']) => void
  history:            FoodHistory[]
  onDeleteHistory:    (id: string) => void
  onRestoreHistory?:  (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>) => void
  onUpdateHistory:    (id: string, updates: Partial<Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>>) => void
  composedGroups:        ComposedGroup[]
  onRemoveGroup:         (id: string) => void
  onSaveComposedGroup?:  (group: ComposedGroup) => void
  meals:                 Meal[]
  onUpdateMeal:          (id: string, updates: Partial<Meal>) => void
  weightLogEntries?: import('../types').WeightLog[]
  onLogWeight?:      (weight_kg: number, date?: string) => Promise<void>
  onDeleteWeightEntry?: (id: string) => Promise<void>
  onExportCsv?:      () => void
  userFoodItems?:    import('../types').UserFoodItem[]
  onAddUserFood?:    (item: Omit<import('../types').UserFoodItem, 'id' | 'user_id' | 'created_at'>) => Promise<unknown>
  onDeleteUserFood?: (id: string) => void
}

export function SettingsSheet({
  isOpen, onClose, lang, connected, profile, onSaveProfile, goals, onSaveGoals, onToggleLang, onSignOut, onLinkGoogle, hasGoogleLinked, theme, styleMode, onToggleTheme, onSelectStyleMode, showToast,
  history, onDeleteHistory, onRestoreHistory, onUpdateHistory, composedGroups, onRemoveGroup, onSaveComposedGroup, meals,
  weightLogEntries = [], onLogWeight, onDeleteWeightEntry, onExportCsv,
  userFoodItems = [], onAddUserFood, onDeleteUserFood,
}: SettingsSheetProps) {
  const [screen, setScreen] = useState<Screen>('main')
  useLockBodyScroll(isOpen)
  const { scrollRef, scrolledDown, onScroll } = useSheetScroll()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const isDragging = dragOffset > 0

  // Shared save-button state for profile / goals / preferences screens
  const [screenSaved, setScreenSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const profileSaveRef = useRef<(() => void) | null>(null)
  const goalsSaveRef   = useRef<(() => void) | null>(null)
  const prefsSaveRef   = useRef<(() => void) | null>(null)

  const handleSaveDone = () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setScreenSaved(true)
    savedTimerRef.current = setTimeout(() => setScreenSaved(false), 2000)
  }

  const triggerScreenSave = () => {
    if (screen === 'profile')     profileSaveRef.current?.()
    else if (screen === 'goals') goalsSaveRef.current?.()
    else if (screen === 'preferences') prefsSaveRef.current?.()
  }

  // Reset saved state when navigating between screens
  useEffect(() => { setScreenSaved(false) }, [screen])

  const handleClose = () => {
    setScreen('main')
    onClose()
  }

  useFocusTrap(sheetRef, isOpen)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (screen !== 'main') { setScreen('main'); return }
      handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, screen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99, // --z-backdrop
          background: 'var(--modal-backdrop)',
          backdropFilter: isOpen ? 'blur(2px)' : 'none',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'all' : 'none',
          transition: 'opacity 0.3s, backdrop-filter 0.3s',
        }}
      />

      {/* Sheet — wrapper centres to app width, inner div animates */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100, // --z-sheet
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
      <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t(lang, 'settings')} style={{
        width: '100%', maxWidth: 560,
        pointerEvents: 'all',
        background: 'var(--bg)',
        outline: 'none',
        borderTop: '1px solid var(--border)',
        borderLeft: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderRadius: '20px 20px 0 0',
        overflow: 'hidden',
        height: 'min(90dvh, 720px)',
        display: 'flex', flexDirection: 'column',
        transform: isOpen ? `translateY(${dragOffset}px)` : 'translateY(105%)',
        transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(.22,.9,.36,1)',
        opacity: isDragging ? Math.max(0.6, 1 - dragOffset / 400) : 1,
      }}>

        <SheetHandle
          scrolledDown={scrolledDown}
          onClose={handleClose}
          onBack={screen !== 'main' ? () => setScreen('main') : undefined}
          isRTL={lang === 'he'}
          onDragOffset={setDragOffset}
        />

        {/* Scrollable screens (main / profile / goals / preferences) */}
        {(screen === 'main' || screen === 'profile' || screen === 'goals' || screen === 'preferences') && (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            style={{
              flex: 1, overflowY: 'auto',
              padding: '20px 16px',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
            }}
          >
            {screen === 'main' && (
              <MainScreen
                lang={lang}
                connected={connected}
                theme={theme}
                styleMode={styleMode}
                showGreeting={profile.showGreeting}
                onProfile={() => setScreen('profile')}
                onGoals={() => setScreen('goals')}
                onFoodHistory={() => setScreen('foodHistory')}
                onLibrary={() => setScreen('library')}
                onMyFoods={() => setScreen('myFoods')}
                onPreferences={() => setScreen('preferences')}
                onToggleLang={onToggleLang}
                onToggleTheme={onToggleTheme}
                onSelectStyleMode={onSelectStyleMode}
                onToggleGreeting={() => onSaveProfile({ showGreeting: !profile.showGreeting })}
                onSignOut={() => { handleClose(); onSignOut() }}
                onLinkGoogle={onLinkGoogle}
                hasGoogleLinked={hasGoogleLinked}
                onExportCsv={onExportCsv}
              />
            )}
            {screen === 'profile' && (
              <ProfileScreen
                lang={lang}
                profile={profile}
                onSave={onSaveProfile}
                showToast={showToast}
                weightLogEntries={weightLogEntries}
                onLogWeight={onLogWeight}
                onDeleteWeightEntry={onDeleteWeightEntry}
                saveRef={profileSaveRef}
                onSaveDone={handleSaveDone}
              />
            )}
            {screen === 'goals' && (
              <GoalsScreen
                lang={lang}
                profile={profile}
                goals={goals}
                onSave={onSaveGoals}
                onSaveProfile={onSaveProfile}
                onSaveFluidGoal={ml => onSaveProfile({ fluidGoalMl: ml })}
                fluidGoalMl={profile.fluidGoalMl}
                showToast={showToast}
                saveRef={goalsSaveRef}
                onSaveDone={handleSaveDone}
              />
            )}
            {screen === 'preferences' && (
              <PreferencesScreen
                lang={lang}
                profile={profile}
                onSave={onSaveProfile}
                showToast={showToast}
                saveRef={prefsSaveRef}
                onSaveDone={handleSaveDone}
              />
            )}
          </div>
        )}

        {/* Footer save button — outside scroll container, always visible */}
        {(screen === 'profile' || screen === 'goals' || screen === 'preferences') && (
          <div style={{
            flexShrink: 0,
            position: 'relative',
            zIndex: 1, // local stacking
            marginTop: -52,
            paddingInline: 16,
            paddingTop: 28,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
            background: 'linear-gradient(to bottom, transparent 0%, var(--bg) 40%)',
            pointerEvents: 'none',
          }}>
            <button
              onClick={triggerScreenSave}
              className={screenSaved ? 'btn-confirm' : 'btn-primary'}
              style={{ width: '100%', height: 48, borderRadius: 12, fontSize: 14, pointerEvents: 'auto' }}
            >
              {screenSaved
                ? <><span className="icon icon-sm" style={{ verticalAlign: 'middle', marginInlineEnd: 4 }}>check</span>
                    {screen === 'profile' ? t(lang, 'profileSaved') : t(lang, 'savedBang')}
                  </>
                : screen === 'profile' ? t(lang, 'saveProfile')
                : screen === 'goals'  ? t(lang, 'saveGoals')
                : t(lang, 'savePreferences')
              }
            </button>
          </div>
        )}

        {/* Self-scrolling screens (library / foodHistory) */}
        {screen === 'foodHistory' && (
          <FoodHistoryScreen
            lang={lang}
            history={history}
            composedGroups={composedGroups}
            meals={meals}
            onDelete={onDeleteHistory}
            onRestore={onRestoreHistory}
            onUpdate={onUpdateHistory}
            onRemoveGroup={onRemoveGroup}
            onSaveComposedGroup={onSaveComposedGroup}
            showToast={showToast}
          />
        )}
        {screen === 'library' && (
          <LibraryScreen lang={lang} />
        )}
        {screen === 'myFoods' && (
          <MyFoodsScreen
            lang={lang}
            items={userFoodItems}
            onAdd={onAddUserFood}
            onDelete={onDeleteUserFood}
            showToast={showToast}
          />
        )}
      </div>
      </div>
    </>
  )
}
