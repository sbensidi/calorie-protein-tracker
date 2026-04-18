import { useState, useCallback, useRef } from 'react'
import type { FoodHistory, Meal, NutritionResult } from '../types'
import type { Lang } from '../lib/i18n'
import { t, currentTime, today } from '../lib/i18n'
import { calculateNutrition } from '../lib/ai'
import { BarcodeScanner } from './BarcodeScanner'
import type { BarcodeProduct } from '../lib/barcodeApi'

type EntryMode = 'manual' | 'scan'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface FoodEntryFormProps {
  lang: Lang
  history: FoodHistory[]
  getSuggestions: (q: string) => FoodHistory[]
  onAdd: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => void
  onUpsertHistory: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>) => void
  defaultMealType?: MealType
}

export function FoodEntryForm({ lang, history, getSuggestions, onAdd, onUpsertHistory, defaultMealType }: FoodEntryFormProps) {
  const [mode, setMode]               = useState<EntryMode>(
    () => (localStorage.getItem('entry-mode') as EntryMode) ?? 'scan'
  )
  const [scanKey,      setScanKey]    = useState(0)   // increment to remount BarcodeScanner
  const [scanProduct,  setScanProduct]  = useState<BarcodeProduct | null>(null)
  const [scanNotFound, setScanNotFound] = useState<string | null>(null) // barcode that wasn't found
  const [scanGrams,    setScanGrams]  = useState('100')
  const [scanMealType, setScanMealType] = useState<MealType>('lunch')

  const [foodName, setFoodName]       = useState('')
  const [gramsStr, setGramsStr]       = useState('')
  const [unitsStr, setUnitsStr]       = useState('')
  const [mealType, setMealType]       = useState<MealType>(defaultMealType ?? 'lunch')
  const [calculating, setCalculating] = useState(false)
  const [nutrition, setNutrition]     = useState<NutritionResult | null>(null)
  const [editCalories, setEditCalories] = useState<number | ''>('')
  const [editProtein,  setEditProtein]  = useState<number | ''>('')
  const [qty, setQty]                 = useState(1)
  const [aiError, setAiError]         = useState(false)

  // Dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [suggestions,  setSuggestions]  = useState<FoodHistory[]>([])
  const inputRef       = useRef<HTMLInputElement>(null)
  const dropdownRef    = useRef<HTMLDivElement>(null)
  const lastCalcRef    = useRef(0)  // debounce: timestamp of last calculate call

  // Derived mode — whichever field has a value wins; both empty = grams mode (AI guesses portion)
  const amountMode: 'g' | 'unit' = unitsStr ? 'unit' : 'g'
  const numericAmount = amountMode === 'unit' ? (Number(unitsStr) || 1) : (Number(gramsStr) || 0)

  const openDropdown = (query: string) => {
    const q = query.trim()
    const items = q ? getSuggestions(q) : history.slice(0, 6)
    setSuggestions(items)
    setDropdownOpen(items.length > 0)
  }

  const handleFoodNameChange = (v: string) => {
    setFoodName(v)
    openDropdown(v)
    setNutrition(null)
  }

  const handleFocus = () => { openDropdown(foodName) }

  const handleBlur = (_e: React.FocusEvent) => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setDropdownOpen(false)
      }
    }, 150)
  }

  const handleSuggestionSelect = (item: FoodHistory) => {
    setFoodName(item.name)
    if (item.grams < 0) {
      setUnitsStr(String(Math.abs(item.grams)))
      setGramsStr('')
    } else {
      setGramsStr(String(item.grams))
      setUnitsStr('')
    }
    setNutrition({ calories: item.calories, protein: item.protein })
    setEditCalories(item.calories || '')
    setEditProtein(item.protein   || '')
    setDropdownOpen(false)
    setQty(1)
    setAiError(false)
    inputRef.current?.blur()
  }

  const handleCalculate = useCallback(async () => {
    if (!foodName.trim()) return
    // Debounce: ignore if called within 3 seconds of last successful call
    const now = Date.now()
    if (now - lastCalcRef.current < 3000) return
    lastCalcRef.current = now
    setCalculating(true)
    setAiError(false)
    setDropdownOpen(false)
    try {
      const result = await calculateNutrition(foodName, numericAmount, history, amountMode)
      setNutrition(result)
      setEditCalories(result.calories || '')
      setEditProtein(result.protein   || '')
      if (result.calories === 0 && result.protein === 0) setAiError(true)
    } catch {
      setAiError(true)
      setNutrition({ calories: 0, protein: 0 })
      setEditCalories('')
      setEditProtein('')
    }
    setCalculating(false)
  }, [foodName, numericAmount, history, amountMode])

  const handleCancelNutrition = () => {
    setFoodName('')
    setGramsStr('')
    setUnitsStr('')
    setNutrition(null)
    setEditCalories('')
    setEditProtein('')
    setAiError(false)
    setQty(1)
    setDropdownOpen(false)
    setSuggestions([])
  }

  // ── Barcode scan handlers ─────────────────────────────────────
  const handleScanResult = useCallback((product: BarcodeProduct) => {
    setScanProduct(product)
    setScanGrams('100')
  }, [])

  const handleScanNotFound = useCallback((barcode: string) => {
    setScanProduct(null)
    setScanNotFound(barcode)
  }, [])

  const handleScanAdd = () => {
    if (!scanProduct) return
    const grams = Number(scanGrams) || 100
    const calories = Math.round(scanProduct.caloriesPer100g * grams / 100)
    const protein  = Math.round(scanProduct.proteinPer100g  * grams / 100 * 10) / 10
    onAdd({
      date:        today(),
      meal_type:   scanMealType,
      name:        scanProduct.name,
      grams,
      calories,
      protein,
      time_logged: currentTime(),
    })
    onUpsertHistory({ name: scanProduct.name, grams, calories, protein })
    // Reset scan state
    setScanProduct(null)
    setScanGrams('100')
    setMode('manual')
  }

  const handleScanAgain = () => {
    setScanProduct(null)
    setScanNotFound(null)
    setScanKey(k => k + 1)  // remount BarcodeScanner → fresh camera stream
  }

  const switchMode = (m: EntryMode) => {
    setMode(m)
    localStorage.setItem('entry-mode', m)
    setScanProduct(null)
    setScanNotFound(null)
    setScanGrams('100')
  }

  const numCalories = Number(editCalories) || 0
  const numProtein  = Number(editProtein)  || 0
  const effectiveCalories = Math.round(numCalories * qty)
  const effectiveProtein  = Math.round(numProtein  * qty * 10) / 10
  const storedGrams = amountMode === 'unit'
    ? -(numericAmount * qty)
    : Math.round(numericAmount * qty)
  const effectiveName = qty !== 1
    ? `${foodName} ×${qty % 1 === 0 ? qty : qty.toFixed(1)}`
    : foodName

  const handleAdd = () => {
    if (!foodName.trim() || nutrition === null) return
    onAdd({
      date:        today(),
      meal_type:   mealType,
      name:        effectiveName,
      grams:       storedGrams,
      calories:    effectiveCalories,
      protein:     effectiveProtein,
      time_logged: currentTime(),
    })
    const historyGrams = amountMode === 'unit' ? -numericAmount : numericAmount
    if (historyGrams !== 0) {
      onUpsertHistory({ name: foodName, grams: historyGrams, calories: numCalories, protein: numProtein })
    }
    // Reset
    setFoodName('')
    setGramsStr('')
    setUnitsStr('')
    setNutrition(null)
    setQty(1)
    setDropdownOpen(false)
    setSuggestions([])
    setAiError(false)
    setEditCalories('')
    setEditProtein('')
  }

  const mealTypeOptions: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: t(lang, 'breakfast') },
    { value: 'lunch',     label: t(lang, 'lunch')     },
    { value: 'dinner',    label: t(lang, 'dinner')    },
    { value: 'snack',     label: t(lang, 'snack')     },
  ]

  const unitPlaceholder = lang === 'he' ? 'יח׳' : 'pcs'
  const unitLabel       = lang === 'he' ? 'יח׳' : 'pcs'
  const isRTL           = lang === 'he'

  // Clear button — spans full height of wrapper, icon centered via flexbox
  const clearBtnStyle = (): React.CSSProperties => ({
    position: 'absolute',
    ...(isRTL ? { left: 0 } : { right: 0 }),
    top: 0, bottom: 0, width: 32,
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-3)', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  })

  // Scan product computed totals
  const scanG    = Number(scanGrams) || 0
  const scanCal  = scanProduct ? Math.round(scanProduct.caloriesPer100g * scanG / 100) : 0
  const scanProt = scanProduct ? Math.round(scanProduct.proteinPer100g  * scanG / 100 * 10) / 10 : 0

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>

      {/* ── Segmented control ─────────────────────────────────── */}
      <div className="seg-control" style={{ marginBottom: 14 }}>
        <button
          className={`seg-btn ${mode === 'scan' ? 'seg-btn--scan' : ''}`}
          onClick={() => switchMode('scan')}
        >
          <span className="icon icon-sm">barcode_scanner</span>
          {t(lang, 'scanBarcode')}
        </button>
        <button
          className={`seg-btn ${mode === 'manual' ? 'seg-btn--manual' : ''}`}
          onClick={() => switchMode('manual')}
        >
          <span className="icon icon-sm">edit</span>
          {t(lang, 'manualEntry')}
        </button>
      </div>

      {/* ── Scan mode: camera ─────────────────────────────────── */}
      {mode === 'scan' && !scanProduct && !scanNotFound && (
        <BarcodeScanner
          key={scanKey}
          lang={lang}
          onResult={handleScanResult}
          onNotFound={handleScanNotFound}
        />
      )}

      {/* ── Scan mode: not found ──────────────────────────────── */}
      {mode === 'scan' && !scanProduct && scanNotFound && (
        <div className="scanner-error" dir={isRTL ? 'rtl' : 'ltr'}>
          <span className="icon" style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 8 }}>barcode_scanner</span>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', textAlign: 'center', marginBottom: 4 }}>
            {t(lang, 'productNotFound')}
          </p>
          <p dir="ltr" style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, fontFamily: 'monospace' }}>
            {scanNotFound}
          </p>
          <button className="btn-ghost" onClick={handleScanAgain}
            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="icon icon-sm">refresh</span>
            {t(lang, 'scanAgain')}
          </button>
        </div>
      )}

      {/* ── Post-scan confirmation ────────────────────────────── */}
      {mode === 'scan' && scanProduct && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Product found badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.18)',
            borderRadius: 10, padding: '8px 11px',
          }}>
            <span className="icon icon-sm" style={{ color: 'var(--green-hi)' }}>check_circle</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-hi)', flex: 1 }}>
              {t(lang, 'productFound')}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>
              {scanProduct.source === 'openfoodfacts' ? 'Open Food Facts' : 'USDA'}
            </span>
          </div>

          {/* Product name + brand */}
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}
              dir={isRTL ? 'rtl' : 'ltr'}>
              {scanProduct.name}
            </p>
            {scanProduct.brand && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {scanProduct.brand} · {scanProduct.barcode}
              </p>
            )}
          </div>

          {/* Per-100g nutrition chips */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              {t(lang, 'per100g')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-hi)', letterSpacing: '0.04em', marginBottom: 3 }}>{t(lang, 'calories').toUpperCase()}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{scanProduct.caloriesPer100g}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t(lang, 'caloriesUnit')}</p>
              </div>
              <div style={{ flex: 1, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-hi)', letterSpacing: '0.04em', marginBottom: 3 }}>{t(lang, 'protein').toUpperCase()}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{scanProduct.proteinPer100g}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t(lang, 'proteinUnit')}</p>
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Grams + meal type */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', flexShrink: 0 }}>
              {t(lang, 'grams')}
            </span>
            <input
              type="number"
              className="inp"
              style={{ flex: '0 0 80px', textAlign: 'center' }}
              value={scanGrams}
              onFocus={e => e.target.select()}
              onChange={e => setScanGrams(e.target.value)}
            />
            <select
              className="inp"
              style={{ flex: 1 }}
              value={scanMealType}
              onChange={e => setScanMealType(e.target.value as MealType)}
            >
              {mealTypeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Calculated total */}
          {scanG > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 10, padding: '9px 12px',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', flex: 1 }}>
                {t(lang, 'totalGrams').replace('גרמים', '').replace('grams', '').trim() || 'סה״כ'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 15, fontWeight: 800, color: 'var(--blue-hi)' }}>
                {scanCal}
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 15, fontWeight: 800, color: 'var(--green-hi)', marginInlineStart: 8 }}>
                {scanProt}
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
              </span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-confirm" onClick={handleScanAdd} style={{ flex: 1 }} disabled={scanG <= 0}>
              {t(lang, 'add')}
            </button>
            <button className="btn-ghost" onClick={handleScanAgain} style={{ flexShrink: 0, paddingInline: 14 }}>
              <span className="icon icon-sm">barcode_scanner</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Manual mode ───────────────────────────────────────── */}
      {mode === 'manual' && (
      <div>
      {/* Row 1: [food name (1fr)] [grams (72px)] [units (72px)]
          Row 2: [meal type (col 1)]  [calculate (cols 2+3, same total width as grams+units+gap)] */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: 8 }}>

        {/* Row 1 col 1 — food name + dropdown */}
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            className="inp"
            placeholder={t(lang, 'foodName')}
            value={foodName}
            onChange={e => handleFoodNameChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            style={isRTL
              ? { paddingLeft:  foodName ? 36 : 12 }
              : { paddingRight: foodName ? 36 : 12 }}
          />
          {foodName && (
            <button
              onMouseDown={e => { e.preventDefault(); handleFoodNameChange(''); setNutrition(null); inputRef.current?.focus() }}
              style={clearBtnStyle()}
              tabIndex={-1}
            >
              <span className="icon icon-sm">close</span>
            </button>
          )}
          {dropdownOpen && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0, right: 0,
                background: 'var(--bg-card2)',
                border: '1px solid var(--border-hi)',
                borderRadius: 10,
                overflow: 'hidden',
                zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {suggestions.map((item, i) => {
                const itemIsUnit = item.grams < 0
                const amtDisplay = itemIsUnit
                  ? `${Math.abs(item.grams)} ${unitLabel}`
                  : `${item.grams}g`
                return (
                  <button
                    key={item.id}
                    onMouseDown={() => handleSuggestionSelect(item)}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      padding: '9px 12px', background: 'transparent', border: 'none',
                      borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="icon icon-sm" style={{ color: 'var(--text-2)', flexShrink: 0 }}>history</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{amtDisplay}</span>
                    <span style={{ fontSize: 11, color: 'var(--blue-hi)', flexShrink: 0, fontWeight: 600 }}>{Math.round(item.calories)}</span>
                    <span style={{ fontSize: 11, color: 'var(--green-hi)', flexShrink: 0, fontWeight: 600 }}>{Math.round(item.protein * 10) / 10}g</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Row 1 col 2 — grams field; disabled when units filled */}
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            className="inp"
            style={{ textAlign: 'center', opacity: unitsStr ? 0.35 : 1, transition: 'opacity .2s' }}
            placeholder={t(lang, 'grams')}
            value={gramsStr}
            disabled={Boolean(unitsStr)}
            onFocus={e => e.target.select()}
            onChange={e => { setGramsStr(e.target.value); setNutrition(null) }}
          />
          {gramsStr && !unitsStr && (
            <button onMouseDown={e => { e.preventDefault(); setGramsStr(''); setNutrition(null) }} tabIndex={-1} style={clearBtnStyle()}>
              <span className="icon icon-sm">close</span>
            </button>
          )}
        </div>

        {/* Row 1 col 3 — units field; disabled when grams filled */}
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            className="inp"
            style={{ textAlign: 'center', opacity: gramsStr ? 0.35 : 1, transition: 'opacity .2s' }}
            placeholder={unitPlaceholder}
            value={unitsStr}
            disabled={Boolean(gramsStr)}
            onFocus={e => e.target.select()}
            onChange={e => { setUnitsStr(e.target.value); setNutrition(null) }}
          />
          {unitsStr && !gramsStr && (
            <button onMouseDown={e => { e.preventDefault(); setUnitsStr(''); setNutrition(null) }} tabIndex={-1} style={clearBtnStyle()}>
              <span className="icon icon-sm">close</span>
            </button>
          )}
        </div>

        {/* Row 2 col 1 — meal type */}
        <select
          className="inp"
          value={mealType}
          onChange={e => setMealType(e.target.value as MealType)}
        >
          {mealTypeOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Row 2 cols 2+3 — calculate button (same total width as grams+units+gap) */}
        <button
          className="btn-primary"
          onClick={handleCalculate}
          disabled={!foodName.trim() || calculating}
          style={{ gridColumn: '2 / 4', width: '100%' }}
        >
          {calculating
            ? <span className="icon icon-sm" style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>progress_activity</span>
            : t(lang, 'calculate')}
        </button>

      </div>

      {aiError && (
        <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="icon icon-sm">error_outline</span>
          {t(lang, 'aiError')}
        </p>
      )}

      {/* Confirmation card */}
      {nutrition !== null && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            {t(lang, 'confirmNutrition')}
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
            {/* Calories */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'calories')}{qty !== 1 ? ` → ${effectiveCalories}` : ''}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  className="inp"
                  style={{ borderColor: 'rgba(59,130,246,0.25)', ...(isRTL ? { paddingLeft: editCalories !== '' ? 32 : 12 } : { paddingRight: editCalories !== '' ? 32 : 12 }) }}
                  value={editCalories}
                  placeholder="0"
                  onChange={e => setEditCalories(e.target.value === '' ? '' : Number(e.target.value))}
                  onFocus={e => { if (editCalories === 0) setEditCalories(''); else e.target.select() }}
                />
                {editCalories !== '' && (
                  <button onMouseDown={e => { e.preventDefault(); setEditCalories('') }} tabIndex={-1} style={clearBtnStyle()}>
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Protein */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'protein')}{qty !== 1 ? ` → ${effectiveProtein}g` : ''}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.1"
                  className="inp inp-green"
                  style={{ borderColor: 'rgba(16,185,129,0.25)', ...(isRTL ? { paddingLeft: editProtein !== '' ? 32 : 12 } : { paddingRight: editProtein !== '' ? 32 : 12 }) }}
                  value={editProtein}
                  placeholder="0"
                  onChange={e => setEditProtein(e.target.value === '' ? '' : Number(e.target.value))}
                  onFocus={e => { if (editProtein === 0) setEditProtein(''); else e.target.select() }}
                />
                {editProtein !== '' && (
                  <button onMouseDown={e => { e.preventDefault(); setEditProtein('') }} tabIndex={-1} style={clearBtnStyle()}>
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quantity stepper */}
            <div style={{ flexShrink: 0 }}>
              <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'quantity')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 46 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', minWidth: 30, textAlign: 'center' }}>
                  ×{qty % 1 === 0 ? qty : qty.toFixed(1)}
                </span>
                <button className="qty-btn" onClick={() => setQty(q => Math.max(0.5, Math.round((q - 0.5) * 10) / 10))}>−</button>
                <button className="qty-btn" onClick={() => setQty(q => Math.round((q + 0.5) * 10) / 10)}>+</button>
              </div>
            </div>
          </div>

          {/* Primary + secondary action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-confirm" onClick={handleAdd} style={{ flex: 1 }}>
              {t(lang, 'add')}
            </button>
            <button className="btn-ghost" onClick={handleCancelNutrition} style={{ flex: 1 }}>
              {t(lang, 'cancel')}
            </button>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  )
}
