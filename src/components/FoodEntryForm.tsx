import { useState, useCallback, useRef } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { FoodHistory, FoodLibraryItem, Meal, NutritionResult } from '../types'
import type { Lang } from '../lib/i18n'
import { t, currentTime, today } from '../lib/i18n'
import { calculateNutrition } from '../lib/ai'
import { BarcodeScanner } from './BarcodeScanner'
import type { BarcodeScannerHandle } from './BarcodeScanner'
import { ErrorBoundary } from './ErrorBoundary'
import type { BarcodeProduct } from '../lib/barcodeApi'
import { FoodHistoryModal } from './FoodHistoryModal'
import { UNITS, toBase, mlToGrams } from '../lib/units'
import type { UnitId } from '../lib/units'

type EntryUnit = UnitId | 'pcs'

type EntryMode = 'manual' | 'scan'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

function mealTypeByTime(): MealType {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'breakfast'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 15 && h < 21) return 'dinner'
  return 'snack'
}

export interface ComposedEntry {
  id: string
  name: string
  calories: number
  protein: number
}

type CombinedSuggestion =
  | { source: 'history'; item: FoodHistory }
  | { source: 'library'; item: FoodLibraryItem }

interface FoodEntryFormProps {
  lang: Lang
  history: FoodHistory[]
  getSuggestions: (q: string) => FoodHistory[]
  searchLibrary?: (q: string) => FoodLibraryItem[]
  defaultWeightUnit?: 'g' | 'oz'
  defaultVolumeUnit?: 'ml' | 'cup' | 'tbsp' | 'tsp' | 'fl_oz'
  onAdd: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => void
  onUpsertHistory: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein'>) => void
  defaultMealType?: MealType
  composedEntries?: ComposedEntry[]
  onAddComposed?: (composedId: string) => void
}

export function FoodEntryForm({ lang, history, getSuggestions, searchLibrary, defaultWeightUnit = 'g', defaultVolumeUnit: _defaultVolumeUnit = 'ml', onAdd, onUpsertHistory, defaultMealType, composedEntries, onAddComposed }: FoodEntryFormProps) {
  const [mode, setMode]               = useState<EntryMode>(
    () => (localStorage.getItem('entry-mode') as EntryMode) ?? 'scan'
  )
  // Mount BarcodeScanner only once the user has actually visited the scan tab.
  // This prevents getUserMedia from firing when the form opens in manual mode.
  // Once mounted we keep it mounted (just hidden) so the stream stays alive.
  const [scannerMounted, setScannerMounted] = useState(
    () => (localStorage.getItem('entry-mode') as EntryMode) === 'scan'
  )
  const scannerRef  = useRef<BarcodeScannerHandle>(null)
  const [scanProduct,  setScanProduct]  = useState<BarcodeProduct | null>(null)
  const [scanNotFound, setScanNotFound] = useState<string | null>(null) // barcode that wasn't found
  const [scanGrams,    setScanGrams]  = useState('100')
  const [scanMealType, setScanMealType] = useState<MealType>(() => mealTypeByTime())

  const [foodName, setFoodName]       = useState('')
  const [amountStr, setAmountStr]     = useState('')
  const [entryUnit, setEntryUnit]     = useState<EntryUnit>(defaultWeightUnit)
  const [mealType, setMealType]       = useState<MealType>(() => defaultMealType ?? mealTypeByTime())
  const [calculating, setCalculating] = useState(false)
  const [nutrition, setNutrition]     = useState<NutritionResult | null>(null)
  const [editCalories, setEditCalories] = useState<number | ''>('')
  const [editProtein,  setEditProtein]  = useState<number | ''>('')
  const [qty, setQty]                 = useState(1)
  const [aiError, setAiError]         = useState<'network' | 'notFound' | null>(null)
  const libraryDensityRef             = useRef<number | null>(null) // density from library selection

  // Dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [suggestions,  setSuggestions]  = useState<CombinedSuggestion[]>([])
  const inputRef    = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const lastCalcRef = useRef(0)  // debounce: timestamp of last calculate call

  // Composed entry pending confirmation
  const [pendingComposed, setPendingComposed] = useState<ComposedEntry | null>(null)

  // History modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  useLockBodyScroll(historyModalOpen)
  const [historySearch,    setHistorySearch]    = useState('')

  const isPcs        = entryUnit === 'pcs'
  const amountMode: 'g' | 'unit' = isPcs ? 'unit' : 'g'
  const numericAmount = Number(amountStr) || (isPcs ? 1 : 0)

  const openDropdown = (query: string) => {
    const q = query.trim()
    const histItems: CombinedSuggestion[] = (q ? getSuggestions(q) : history.slice(0, 6))
      .map(item => ({ source: 'history' as const, item }))
    const histNames = new Set(histItems.map(s => (s.item as FoodHistory).name.toLowerCase()))
    const libItems: CombinedSuggestion[] = q && searchLibrary
      ? searchLibrary(q).filter(li => !histNames.has(li.name_he.toLowerCase())).slice(0, 4).map(item => ({ source: 'library' as const, item }))
      : []
    const combined = [...histItems, ...libItems]
    setSuggestions(combined)
    setDropdownOpen(combined.length > 0)
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

  const openHistoryModal = () => {
    setHistorySearch('')
    setHistoryModalOpen(true)
    setDropdownOpen(false)
  }

  const handleHistorySelect = (item: FoodHistory) => {
    handleSuggestionSelect(item)
    setHistoryModalOpen(false)
    setHistorySearch('')
  }

  const handleLibrarySelect = (item: FoodLibraryItem) => {
    const preferredUnit: EntryUnit = (item.serving_unit as UnitId) in UNITS ? (item.serving_unit as UnitId) : defaultWeightUnit
    const servingBase = item.serving_size ?? 100
    const gramsForNutrition = item.density
      ? mlToGrams(toBase(servingBase, preferredUnit as UnitId), item.density)
      : toBase(servingBase, preferredUnit as UnitId)
    const cal  = Math.round(item.calories_per_100g * gramsForNutrition / 100)
    const prot = Math.round(item.protein_per_100g  * gramsForNutrition / 100 * 10) / 10
    const name = lang === 'he' ? item.name_he : item.name_en
    libraryDensityRef.current = item.density ?? null
    setEntryUnit(preferredUnit)
    setFoodName(name)
    setAmountStr(String(servingBase))
    setNutrition({ calories: cal, protein: prot })
    setEditCalories(cal)
    setEditProtein(prot)
    setDropdownOpen(false)
    setQty(1)
    setAiError(null)
    inputRef.current?.blur()
  }

  const handleComposedSelect = (entry: ComposedEntry) => {
    setDropdownOpen(false)
    setHistoryModalOpen(false)
    setHistorySearch('')
    setPendingComposed(entry)
  }

  const handleSuggestionSelect = (item: FoodHistory) => {
    setFoodName(item.name)
    setAmountStr(String(Math.abs(item.grams)))
    setEntryUnit(item.grams < 0 ? 'pcs' : defaultWeightUnit)
    setNutrition({ calories: item.calories, protein: item.protein })
    setEditCalories(item.calories || '')
    setEditProtein(item.protein   || '')
    setDropdownOpen(false)
    setQty(1)
    setAiError(null)
    inputRef.current?.blur()
  }

  const handleCalculate = useCallback(async () => {
    if (!foodName.trim()) return
    // Debounce: ignore if called within 3 seconds of last successful call
    const now = Date.now()
    if (now - lastCalcRef.current < 3000) return
    lastCalcRef.current = now
    setCalculating(true)
    setAiError(null)
    setDropdownOpen(false)
    try {
      const result = await calculateNutrition(foodName, numericAmount, history, amountMode)
      setNutrition(result)
      setEditCalories(result.calories || '')
      setEditProtein(result.protein   || '')
      if (result.calories === 0 && result.protein === 0) setAiError('notFound')
    } catch {
      setAiError('network')
      setNutrition({ calories: 0, protein: 0 })
      setEditCalories('')
      setEditProtein('')
    }
    setCalculating(false)
  }, [foodName, numericAmount, history, amountMode])

  const handleCancelNutrition = () => {
    setFoodName('')
    setAmountStr('')
    setNutrition(null)
    setEditCalories('')
    setEditProtein('')
    setAiError(null)
    setQty(1)
    setDropdownOpen(false)
    setSuggestions([])
    setEntryUnit(defaultWeightUnit)
    libraryDensityRef.current = null
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
    scannerRef.current?.reset()
  }

  const switchMode = (m: EntryMode) => {
    if (m === 'scan') setScannerMounted(true)
    if (m === 'manual') scannerRef.current?.stop()
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
  const amountInGrams: number = (() => {
    if (isPcs) return 0
    const uid = entryUnit as UnitId
    const baseAmount = toBase(numericAmount, uid)
    if (UNITS[uid].type === 'volume') {
      return mlToGrams(baseAmount, libraryDensityRef.current ?? 1)
    }
    return baseAmount
  })()
  const storedGrams = isPcs
    ? -(numericAmount * qty)
    : Math.round(amountInGrams * qty)
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
    const historyGrams = isPcs ? -numericAmount : numericAmount
    if (historyGrams !== 0) {
      onUpsertHistory({ name: foodName, grams: historyGrams, calories: numCalories, protein: numProtein })
    }
    // Reset
    setFoodName('')
    setAmountStr('')
    setNutrition(null)
    setQty(1)
    setDropdownOpen(false)
    setSuggestions([])
    setAiError(null)
    setEditCalories('')
    setEditProtein('')
    setEntryUnit(defaultWeightUnit)
    libraryDensityRef.current = null
  }

  const mealTypeOptions: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: t(lang, 'breakfast') },
    { value: 'lunch',     label: t(lang, 'lunch')     },
    { value: 'dinner',    label: t(lang, 'dinner')    },
    { value: 'snack',     label: t(lang, 'snack')     },
  ]

  const isRTL = lang === 'he'

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
    <>

    {/* ── Composed entry confirmation ───────────────────────── */}
    {pendingComposed && (
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span className="icon icon-sm" style={{ color: 'var(--purple)' }}>restaurant</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
            {pendingComposed.name}
          </span>
          <button
            onMouseDown={e => { e.preventDefault(); setPendingComposed(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-hi)', letterSpacing: '0.04em', margin: '0 0 3px' }}>{t(lang, 'calories').toUpperCase()}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{pendingComposed.calories}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{t(lang, 'caloriesUnit')}</p>
          </div>
          <div style={{ flex: 1, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.14)', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-hi)', letterSpacing: '0.04em', margin: '0 0 3px' }}>{t(lang, 'protein').toUpperCase()}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{pendingComposed.protein}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{t(lang, 'proteinUnit')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-confirm"
            style={{ flex: 1 }}
            onClick={() => { onAddComposed?.(pendingComposed.id); setPendingComposed(null) }}
          >
            {t(lang, 'add')}
          </button>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setPendingComposed(null)}>
            {t(lang, 'cancel')}
          </button>
        </div>
      </div>
    )}

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
      {/* Mounted only after the user first visits the scan tab, then kept
          mounted (hidden via CSS) so the stream survives mode switches. */}
      {scannerMounted && (
        <div style={{ display: mode === 'scan' && !scanProduct && !scanNotFound ? undefined : 'none' }}>
          <ErrorBoundary>
            <BarcodeScanner
              ref={scannerRef}
              lang={lang}
              onResult={handleScanResult}
              onNotFound={handleScanNotFound}
            />
          </ErrorBoundary>
        </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                className="qty-btn"
                onClick={() => setScanGrams(g => String(Math.max(10, Math.round((Number(g) || 0) - 10))))}
              >−</button>
              <input
                type="number"
                inputMode="decimal"
                className="inp"
                style={{ width: 64, textAlign: 'center', padding: '0 4px' }}
                value={scanGrams}
                onFocus={e => e.target.select()}
                onChange={e => setScanGrams(e.target.value)}
              />
              <button
                className="qty-btn"
                onClick={() => setScanGrams(g => String((Number(g) || 0) + 10))}
              >+</button>
            </div>
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
              background: 'var(--surface-1)',
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
      <div style={{ position: 'relative' }}>
      {/* Row 1: [food name (1fr)] [amount (64px)] [unit dropdown (84px)]
          Row 2: [meal type (col 1)] [calculate (cols 2+3)] */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 84px', gap: 8 }}>

        {/* Row 1 col 1 — food name */}
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
              ? { paddingLeft: foodName ? 78 : 46, paddingRight: 12 }
              : { paddingRight: foodName ? 78 : 46, paddingLeft: 12 }}
          />
          {/* History browse button */}
          <button
            onMouseDown={e => { e.preventDefault(); openHistoryModal() }}
            tabIndex={-1}
            title={lang === 'he' ? 'היסטוריית מזונות' : 'Food history'}
            style={{
              position: 'absolute',
              ...(isRTL ? { left: 0 } : { right: 0 }),
              top: 0, bottom: 0, width: 42,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...(isRTL
                ? { borderRight: '1px solid var(--border)' }
                : { borderLeft:  '1px solid var(--border)' }),
            }}
          >
            <span className="icon icon-sm">manage_search</span>
          </button>
          {foodName && (
            <button
              onMouseDown={e => { e.preventDefault(); handleFoodNameChange(''); setNutrition(null); inputRef.current?.focus() }}
              style={{
                position: 'absolute',
                ...(isRTL ? { left: 42 } : { right: 42 }),
                top: 0, bottom: 0, width: 32,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-3)', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              tabIndex={-1}
            >
              <span className="icon icon-sm">close</span>
            </button>
          )}
        </div>

        {/* Row 1 col 2 — numeric amount */}
        <input
          type="number"
          inputMode="decimal"
          className="inp"
          style={{ textAlign: 'center' }}
          placeholder={isPcs ? (lang === 'he' ? 'יח׳' : 'pcs') : t(lang, 'grams')}
          value={amountStr}
          onFocus={e => e.target.select()}
          onChange={e => { setAmountStr(e.target.value); setNutrition(null) }}
        />

        {/* Row 1 col 3 — unit dropdown */}
        <select
          className="inp"
          value={entryUnit}
          onChange={e => {
            const next = e.target.value as EntryUnit
            setEntryUnit(next)
            setAmountStr('')
            setNutrition(null)
            libraryDensityRef.current = null
          }}
          style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '0 6px', textAlign: 'center' }}
        >
          <option value="g">g</option>
          <option value="oz">oz</option>
          <option value="ml">ml</option>
          <option value="cup">{lang === 'he' ? 'כוס' : 'cup'}</option>
          <option value="tbsp">{lang === 'he' ? 'כף' : 'tbsp'}</option>
          <option value="tsp">{lang === 'he' ? 'כפית' : 'tsp'}</option>
          <option value="fl_oz">fl oz</option>
          <option value="pcs">{lang === 'he' ? 'יח׳' : 'pcs'}</option>
        </select>

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

        {/* Row 2 cols 2+3 — calculate button */}
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

      {/* History dropdown — full container width */}
      {dropdownOpen && (() => {
        const q = foodName.trim().toLowerCase()
        const matchedComposed = composedEntries
          ? composedEntries.filter(e => !q || e.name.toLowerCase().includes(q))
          : []
        if (suggestions.length === 0 && matchedComposed.length === 0) return null
        return (
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: 'calc(46px + 4px)',
              left: 0, right: 0,
              background: 'var(--bg-card2)',
              border: '1px solid var(--border-hi)',
              borderRadius: 10,
              overflow: 'hidden',
              zIndex: 50,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {/* Composed dishes at top */}
            {matchedComposed.map(entry => (
              <button
                key={entry.id}
                onMouseDown={() => handleComposedSelect(entry)}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  padding: '9px 12px', background: 'transparent', border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="icon icon-sm" style={{ color: 'var(--purple)', flexShrink: 0 }}>restaurant</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--blue-hi)', flexShrink: 0, fontWeight: 600 }}>{entry.calories}</span>
                <span style={{ fontSize: 11, color: 'var(--green-hi)', flexShrink: 0, fontWeight: 600 }}>{entry.protein}g</span>
              </button>
            ))}
            {/* Food history + library items */}
            {suggestions.map((s, i) => {
              const isLast = i === suggestions.length - 1
              if (s.source === 'history') {
                const item = s.item
                const itemIsUnit = item.grams < 0
                const amtDisplay = itemIsUnit ? `${Math.abs(item.grams)} ${lang === 'he' ? 'יח׳' : 'pcs'}` : `${item.grams}g`
                return (
                  <button
                    key={`h-${item.id}`}
                    onMouseDown={() => handleSuggestionSelect(item)}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      padding: '9px 12px', background: 'transparent', border: 'none',
                      borderBottom: isLast ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
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
              } else {
                const item = s.item
                const grams = item.serving_size ?? 100
                const cal   = Math.round(item.calories_per_100g * grams / 100)
                const prot  = Math.round(item.protein_per_100g  * grams / 100 * 10) / 10
                const name  = lang === 'he' ? item.name_he : item.name_en
                return (
                  <button
                    key={`lib-${item.id}`}
                    onMouseDown={() => handleLibrarySelect(item)}
                    style={{
                      display: 'flex', alignItems: 'center', width: '100%',
                      padding: '9px 12px', background: 'rgba(245,158,11,0.04)', border: 'none',
                      borderBottom: isLast ? 'none' : '1px solid var(--border)',
                      cursor: 'pointer', gap: 10, textAlign: 'start', fontFamily: 'inherit',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.10)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.04)')}
                  >
                    <span className="icon icon-sm" style={{ color: 'var(--amber)', flexShrink: 0 }}>menu_book</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{grams}g</span>
                    <span style={{ fontSize: 11, color: 'var(--blue-hi)', flexShrink: 0, fontWeight: 600 }}>{cal}</span>
                    <span style={{ fontSize: 11, color: 'var(--green-hi)', flexShrink: 0, fontWeight: 600 }}>{prot}g</span>
                  </button>
                )
              }
            })}
          </div>
        )
      })()}

      <div aria-live="polite" aria-atomic="true">
        {aiError && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="icon icon-sm">{aiError === 'network' ? 'wifi_off' : 'search_off'}</span>
            {t(lang, aiError === 'network' ? 'aiErrorNetwork' : 'aiErrorNotFound')}
          </p>
        )}
      </div>

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
                  inputMode="numeric"
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
                  inputMode="decimal"
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
                <button className="qty-btn" onClick={() => setQty(q => Math.max(0.1, Math.round((q - 0.1) * 10) / 10))}>−</button>
                <input
                  type="number"
                  inputMode="decimal"
                  className="inp"
                  style={{ width: 52, textAlign: 'center', padding: '0 4px', height: 34, fontSize: 14, fontWeight: 700 }}
                  value={qty}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (!isNaN(v) && v > 0) setQty(Math.round(v * 10) / 10)
                  }}
                />
                <button className="qty-btn" onClick={() => setQty(q => Math.round((q + 0.1) * 10) / 10)}>+</button>
              </div>
            </div>
          </div>

          {/* Primary + secondary action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-confirm" onClick={handleAdd} style={{ flex: 1 }} disabled={calculating}>
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

    {/* ── Food history modal ──────────────────────────────────── */}

    {historyModalOpen && (
      <FoodHistoryModal
        lang={lang}
        history={history}
        composedEntries={composedEntries}
        search={historySearch}
        onSearchChange={setHistorySearch}
        onClose={() => setHistoryModalOpen(false)}
        onSelectHistory={handleHistorySelect}
        onSelectComposed={handleComposedSelect}
      />
    )}
    </>
  )
}
