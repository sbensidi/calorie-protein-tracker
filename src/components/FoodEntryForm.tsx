import { useState, useCallback, useRef, useEffect } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { FoodHistory, FoodLibraryItem, Meal, NutritionResult } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir, currentTime, today } from '../lib/i18n'
import { calculateNutrition, AiRateLimitError, AiParseError } from '../lib/ai'
import { BarcodeScanner } from './BarcodeScanner'
import type { BarcodeScannerHandle } from './BarcodeScanner'
import { ErrorBoundary } from './ErrorBoundary'
import type { BarcodeProduct } from '../lib/barcodeApi'
import { FoodHistoryModal } from './FoodHistoryModal'
import { UNITS, toBase, mlToGrams } from '../lib/units'
import type { UnitId } from '../lib/units'

type EntryUnit = UnitId | 'pcs'

type EntryMode = 'manual' | 'scan'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'beverage'

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
  onUpsertHistory: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fluid_ml'>) => void
  onTouchHistory?: (id: string) => void
  defaultMealType?: MealType
  composedEntries?: ComposedEntry[]
  onAddComposed?: (composedId: string) => void
  fluidGoalMl?: number
  fluidThresholdMl?: number
  fluidZeroCalOnly?: boolean
  isOpen?: boolean
}

export function FoodEntryForm({ lang, history, getSuggestions, searchLibrary, defaultWeightUnit = 'g', defaultVolumeUnit: _defaultVolumeUnit = 'ml', onAdd, onUpsertHistory, onTouchHistory, defaultMealType, composedEntries, onAddComposed, fluidThresholdMl = 100, fluidZeroCalOnly = true, isOpen }: FoodEntryFormProps) {
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

  // Stop camera stream when the parent sheet closes (sheet stays mounted via CSS transform, so
  // unmount cleanup never fires — this effect is the only reliable trigger)
  useEffect(() => {
    if (isOpen === false) scannerRef.current?.stop()
  }, [isOpen])

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
  const [aiError, setAiError]         = useState<'network' | 'notFound' | 'rateLimit' | 'parseError' | null>(null)
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

  const [fluidExcluded, setFluidExcluded] = useState(false)
  // Track if the current form state came from a history selection (to avoid re-inserting)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

  const isPcs        = entryUnit === 'pcs'
  const amountMode: 'g' | 'unit' = isPcs ? 'unit' : 'g'
  const numericAmount = Number(amountStr) || (isPcs ? 1 : 0)

  const openDropdown = (query: string) => {
    const q = query.trim()
    // Deduplicate by name (case-insensitive) — history is ordered by recency, so first occurrence = most recent
    const base = q ? getSuggestions(q) : history
    const seen = new Set<string>()
    const deduped = base.filter(item => {
      const key = item.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const histItems: CombinedSuggestion[] = deduped
      .slice(0, 6)
      .map(item => ({ source: 'history' as const, item }))
    const libItems: CombinedSuggestion[] = q && searchLibrary
      ? searchLibrary(q).slice(0, 4).map(item => ({ source: 'library' as const, item }))
      : []
    const combined = [...histItems, ...libItems]
    setSuggestions(combined)
    setDropdownOpen(combined.length > 0)
  }

  const handleFoodNameChange = (v: string) => {
    setFoodName(v)
    openDropdown(v)
    setNutrition(null)
    setSelectedHistoryId(null)   // user is typing a new name — no longer a history selection
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
    const isBeverage = item.category === 'beverage' || item.category === 'alcohol'
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
    if (isBeverage) setMealType('beverage')
  }

  const handleComposedSelect = (entry: ComposedEntry) => {
    setDropdownOpen(false)
    setHistoryModalOpen(false)
    setHistorySearch('')
    setPendingComposed(entry)
  }

  const handleSuggestionSelect = (item: FoodHistory) => {
    const isFluidItem = item.fluid_ml != null && item.fluid_ml > 0
    setFoodName(item.name)
    setAmountStr(isFluidItem ? String(Math.round(item.fluid_ml!)) : String(Math.abs(item.grams)))
    setEntryUnit(item.grams < 0 ? 'pcs' : isFluidItem ? 'ml' : defaultWeightUnit)
    setNutrition({ calories: item.calories, protein: item.protein })
    setEditCalories(item.calories || '')
    setEditProtein(item.protein   || '')
    setDropdownOpen(false)
    setQty(1)
    setAiError(null)
    setSelectedHistoryId(item.id)
    inputRef.current?.blur()
    if (isFluidItem) setMealType('beverage')
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
    setSelectedHistoryId(null)

    // Step 2: Food library — try exact-name match before calling AI
    if (searchLibrary && numericAmount > 0) {
      const matches = searchLibrary(foodName)
      const nameLower = foodName.trim().toLowerCase()
      const exact = matches.find(item =>
        item.name_he.toLowerCase() === nameLower ||
        item.name_en.toLowerCase() === nameLower
      ) ?? (matches.length === 1 ? matches[0] : null)
      if (exact) {
        const uid = (entryUnit !== 'pcs' && entryUnit in UNITS) ? entryUnit as UnitId : null
        const baseAmount = uid ? toBase(numericAmount, uid) : numericAmount
        const gramsForNutrition = uid && UNITS[uid].type === 'volume'
          ? mlToGrams(baseAmount, exact.density ?? 1)
          : baseAmount
        const cal  = Math.round(exact.calories_per_100g * gramsForNutrition / 100)
        const prot = Math.round(exact.protein_per_100g  * gramsForNutrition / 100 * 10) / 10
        libraryDensityRef.current = exact.density ?? null
        setNutrition({ calories: cal, protein: prot })
        setEditCalories(cal)
        setEditProtein(prot)
        setCalculating(false)
        return
      }
    }

    // Step 3+: AI (Groq → USDA fallback inside calculateNutrition)
    try {
      const result = await calculateNutrition(foodName, numericAmount, history, amountMode)
      if (result === null) {
        setAiError('notFound')
        setNutrition({ calories: 0, protein: 0 })
        setEditCalories('')
        setEditProtein('')
      } else {
        setNutrition(result)
        setEditCalories(result.calories)
        setEditProtein(result.protein)
        // Auto-switch to ml when AI identifies a zero-cal zero-prot fluid (e.g. water)
        if (result.calories === 0 && result.protein === 0) {
          const currentUnitIsWeight = entryUnit === 'g' || entryUnit === 'oz'
          if (currentUnitIsWeight) setEntryUnit('ml')
        }
      }
    } catch (err) {
      setAiError(err instanceof AiRateLimitError ? 'rateLimit' : err instanceof AiParseError ? 'parseError' : 'network')
      setNutrition({ calories: 0, protein: 0 })
      setEditCalories('')
      setEditProtein('')
    }
    setCalculating(false)
  }, [foodName, numericAmount, history, amountMode, entryUnit, searchLibrary])

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
    setFluidExcluded(false)
    setSelectedHistoryId(null)
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
      date:           today(),
      meal_type:      scanMealType,
      name:           scanProduct.name,
      grams,
      calories,
      protein,
      time_logged:    currentTime(),
      fluid_ml:       null,
      fluid_excluded: false,
    })
    onUpsertHistory({ name: scanProduct.name, grams, calories, protein, fluid_ml: null })
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

  // Fluid detection: volume unit + amount > threshold
  // ml/cup/fl_oz are unambiguous beverage units → always count as fluid above threshold,
  // regardless of calories (coffee, juice, milk all have calories but are still fluids).
  // tbsp/tsp can be condiments/oils → still respect fluidZeroCalOnly for those.
  const isVolumeUnit    = entryUnit !== 'pcs' && entryUnit !== 'g' && entryUnit !== 'oz'
  const detectedFluidMl = isVolumeUnit ? toBase(numericAmount, entryUnit as UnitId) * qty : null
  const calZeroOk       = !fluidZeroCalOnly || numCalories === 0
  const isFluid         = detectedFluidMl !== null && detectedFluidMl >= fluidThresholdMl && calZeroOk

  const handleAdd = () => {
    if (!foodName.trim() || nutrition === null) return
    onAdd({
      date:           today(),
      meal_type:      mealType,
      name:           effectiveName,
      grams:          storedGrams,
      calories:       effectiveCalories,
      protein:        effectiveProtein,
      time_logged:    currentTime(),
      fluid_ml:       isFluid && !fluidExcluded ? detectedFluidMl : null,
      fluid_excluded: false,
    })
    // If the item came from history, just bump its use_count — don't create a new row.
    // If new (AI / library / manual), upsert normally (creates or updates by name+grams).
    if (selectedHistoryId && onTouchHistory) {
      onTouchHistory(selectedHistoryId)
    } else {
      const historyGrams = isPcs ? -numericAmount : numericAmount
      if (historyGrams !== 0) {
        onUpsertHistory({ name: foodName, grams: historyGrams, calories: numCalories, protein: numProtein, fluid_ml: isFluid && !fluidExcluded ? detectedFluidMl : null })
      }
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
    setFluidExcluded(false)
    setSelectedHistoryId(null)
    libraryDensityRef.current = null
  }

  const mealTypeOptions: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: t(lang, 'breakfast') },
    { value: 'lunch',     label: t(lang, 'lunch')     },
    { value: 'dinner',    label: t(lang, 'dinner')    },
    { value: 'snack',     label: t(lang, 'snack')     },
    { value: 'beverage',  label: t(lang, 'beverage')  },
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
          <div style={{ flex: 1, background: 'var(--blue-fill)', border: '1px solid color-mix(in srgb, var(--blue) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-hi)', letterSpacing: '0.04em', margin: '0 0 3px' }}>{t(lang, 'calories').toUpperCase()}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{pendingComposed.calories}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{t(lang, 'caloriesUnit')}</p>
          </div>
          <div style={{ flex: 1, background: 'var(--green-fill)', border: '1px solid color-mix(in srgb, var(--green) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
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

    {!pendingComposed && <div className="card" style={{ padding: 16, marginBottom: 20 }}>

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
            border: '1px solid var(--green-select)',
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
              <div style={{ flex: 1, background: 'var(--blue-fill)', border: '1px solid color-mix(in srgb, var(--blue) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-hi)', letterSpacing: '0.04em', marginBottom: 3 }}>{t(lang, 'calories').toUpperCase()}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{scanProduct.caloriesPer100g}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t(lang, 'caloriesUnit')}</p>
              </div>
              <div style={{ flex: 1, background: 'var(--green-fill)', border: '1px solid color-mix(in srgb, var(--green) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
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

      {/* Input form — hidden once nutrition is confirmed (isolation: Issue 8) */}
      {nutrition === null && (
      <>
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
            dir={dir(lang)}
            style={isRTL
              ? { fontSize: 16, paddingLeft: foodName ? 78 : 46, paddingRight: 12 }
              : { fontSize: 16, paddingRight: foodName ? 78 : 46, paddingLeft: 12 }}
          />
          {/* History browse button */}
          <button
            onMouseDown={e => { e.preventDefault(); openHistoryModal() }}
            tabIndex={-1}
            title={t(lang, 'foodHistory')}
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
          style={{ textAlign: 'center', fontSize: 16 }}
          placeholder={(() => {
            const labels: Record<string, { he: string; en: string }> = {
              g:     { he: 'גרם',       en: 'g'     },
              oz:    { he: 'אונקיה',    en: 'oz'    },
              ml:    { he: 'מ"ל',       en: 'ml'    },
              cup:   { he: 'כוס',       en: 'cup'   },
              tbsp:  { he: 'כף',        en: 'tbsp'  },
              tsp:   { he: 'כפית',      en: 'tsp'   },
              fl_oz: { he: "פל.אונ׳",   en: 'fl oz' },
              pcs:   { he: 'יח׳',       en: 'pcs'   },
            }
            return lang === 'he' ? labels[entryUnit].he : labels[entryUnit].en
          })()}
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
          style={{ fontSize: 16, fontWeight: 700, cursor: 'pointer', textOverflow: 'ellipsis', overflow: 'hidden' }}
        >
          {([
            { v: 'g',     he: 'גרם',        en: 'g'     },
            { v: 'oz',    he: 'אונקיה',      en: 'oz'    },
            { v: 'ml',    he: 'מ"ל',         en: 'ml'    },
            { v: 'cup',   he: 'כוס',         en: 'cup'   },
            { v: 'tbsp',  he: 'כף',          en: 'tbsp'  },
            { v: 'tsp',   he: 'כפית',        en: 'tsp'   },
            { v: 'fl_oz', he: 'פל.אונ׳',    en: 'fl oz' },
            { v: 'pcs',   he: 'יח׳',         en: 'pcs'   },
          ] as const).map(u => (
            <option key={u.v} value={u.v}>{lang === 'he' ? u.he : u.en}</option>
          ))}
        </select>

        {/* Row 2 col 1 — meal type */}
        <select
          className="inp"
          style={{ fontSize: 16 }}
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
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--purple-tint)')}
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
                const itemIsUnit  = item.grams < 0
                const itemIsFluid = item.fluid_ml != null && item.fluid_ml > 0
                const amtDisplay  = itemIsUnit  ? `${Math.abs(item.grams)} ${lang === 'he' ? 'יח׳' : 'pcs'}`
                  : itemIsFluid ? (item.fluid_ml! >= 1000 ? `${(item.fluid_ml! / 1000).toFixed(1)}${lang === 'he' ? 'ל׳' : 'L'}` : `${Math.round(item.fluid_ml!)}ml`)
                  : `${item.grams}g`
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
                const item        = s.item
                const unit        = (item.serving_unit as UnitId) in UNITS ? (item.serving_unit as UnitId) : 'g'
                const servingBase = item.serving_size ?? 100
                const gramsForNutrition = item.density
                  ? mlToGrams(toBase(servingBase, unit), item.density)
                  : toBase(servingBase, unit)
                const cal  = Math.round(item.calories_per_100g * gramsForNutrition / 100)
                const prot = Math.round(item.protein_per_100g  * gramsForNutrition / 100 * 10) / 10
                const name = lang === 'he' ? item.name_he : item.name_en
                const amtDisplay = unit === 'g' ? `${servingBase}g`
                  : unit === 'ml' ? `${servingBase}ml`
                  : unit === 'cup' ? `${servingBase} ${lang === 'he' ? 'כוס' : 'cup'}`
                  : unit === 'fl_oz' ? `${servingBase} fl oz`
                  : unit === 'tbsp' ? `${servingBase} ${lang === 'he' ? 'כף' : 'tbsp'}`
                  : unit === 'tsp'  ? `${servingBase} ${lang === 'he' ? 'כפית' : 'tsp'}`
                  : `${servingBase}${unit}`
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
                    <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{amtDisplay}</span>
                    <span style={{ fontSize: 11, color: 'var(--blue-hi)', flexShrink: 0, fontWeight: 600 }}>{cal}</span>
                    <span style={{ fontSize: 11, color: 'var(--green-hi)', flexShrink: 0, fontWeight: 600 }}>{prot}g</span>
                  </button>
                )
              }
            })}
          </div>
        )
      })()}
      </>
      )}

      <div aria-live="polite" aria-atomic="true">
        {aiError && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="icon icon-sm">
              {aiError === 'network' ? 'wifi_off' : aiError === 'rateLimit' ? 'timer_off' : aiError === 'parseError' ? 'error' : 'search_off'}
            </span>
            {t(lang, aiError === 'network' ? 'aiErrorNetwork' : aiError === 'rateLimit' ? 'aiErrorRateLimit' : aiError === 'parseError' ? 'aiErrorParse' : 'aiErrorNotFound')}
          </p>
        )}
      </div>

      {/* Confirmation card */}
      {nutrition !== null && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {/* Food name + amount — shown as header so user knows what they're confirming */}
          {foodName && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {foodName}
              </span>
              {amountStr && (
                <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {amountStr} {entryUnit}
                </span>
              )}
            </div>
          )}
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            {t(lang, 'confirmNutrition')}
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
            {/* Calories — input shows effective total; hint shows per-item base when qty > 1 */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--blue-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'calories')} ({t(lang, 'caloriesUnit')})
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  className="inp"
                  style={{ borderColor: 'var(--blue-glow)', fontSize: 16, ...(isRTL ? { paddingLeft: editCalories !== '' ? 32 : 12 } : { paddingRight: editCalories !== '' ? 32 : 12 }) }}
                  value={editCalories === '' ? '' : effectiveCalories}
                  placeholder="0"
                  onChange={e => setEditCalories(e.target.value === '' ? '' : Math.round(Number(e.target.value) / qty))}
                  onFocus={e => { if (numCalories === 0) setEditCalories(''); else e.target.select() }}
                />
                {editCalories !== '' && (
                  <button onMouseDown={e => { e.preventDefault(); setEditCalories('') }} tabIndex={-1} style={clearBtnStyle()}>
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
              </div>
              {qty > 1 && editCalories !== '' && (
                <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginTop: 3 }}>
                  {lang === 'he' ? `${Math.round(numCalories)} לפריט` : `${Math.round(numCalories)} per item`}
                </span>
              )}
            </div>

            {/* Protein — same pattern as calories */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--green-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {lang === 'he' ? 'חלבון (ג׳)' : 'Protein (g)'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className="inp inp-green"
                  style={{ borderColor: 'var(--green-glow)', fontSize: 16, ...(isRTL ? { paddingLeft: editProtein !== '' ? 32 : 12 } : { paddingRight: editProtein !== '' ? 32 : 12 }) }}
                  value={editProtein === '' ? '' : effectiveProtein}
                  placeholder="0"
                  onChange={e => setEditProtein(e.target.value === '' ? '' : Math.round(Number(e.target.value) / qty * 10) / 10)}
                  onFocus={e => { if (numProtein === 0) setEditProtein(''); else e.target.select() }}
                />
                {editProtein !== '' && (
                  <button onMouseDown={e => { e.preventDefault(); setEditProtein('') }} tabIndex={-1} style={clearBtnStyle()}>
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
              </div>
              {qty > 1 && editProtein !== '' && (
                <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginTop: 3 }}>
                  {lang === 'he' ? `${Math.round(numProtein * 10) / 10}g לפריט` : `${Math.round(numProtein * 10) / 10}g per item`}
                </span>
              )}
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

          {/* Fluid notice — shown when auto-detected */}
          {isFluid && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: fluidExcluded ? 'rgba(107,127,150,0.06)' : 'var(--blue-fill)',
              border: `1px solid ${fluidExcluded ? 'rgba(107,127,150,0.12)' : 'var(--blue-select)'}`,
              borderRadius: 9, padding: '7px 11px',
              margin: '10px 0',
              transition: 'background .2s, border-color .2s',
            }}>
              <span className="icon" style={{ fontSize: 16, color: 'var(--cyan-hi)', flexShrink: 0 }}>water_drop</span>
              <span style={{
                fontSize: 12, fontWeight: 600, flex: 1,
                color: fluidExcluded ? 'var(--text-3)' : 'var(--blue-hi)',
                textDecoration: fluidExcluded ? 'line-through' : 'none',
                opacity: fluidExcluded ? 0.7 : 1,
              }}>
                {lang === 'he'
                  ? `${Math.round(detectedFluidMl!)} מ״ל יתווספו ליעד הנוזלים`
                  : `${Math.round(detectedFluidMl!)} ml will count toward fluid goal`}
              </span>
              {/* Toggle */}
              <button
                onClick={() => setFluidExcluded(v => !v)}
                style={{
                  width: 34, height: 20, borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: fluidExcluded ? 'rgba(107,127,150,0.25)' : 'var(--blue)',
                  position: 'relative', flexShrink: 0, transition: 'background .2s',
                }}
              >
                <span style={{
                  position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: 'var(--toggle-knob)',
                  top: 3, transition: 'right .2s',
                  right: fluidExcluded ? 17 : 3,
                }} />
              </button>
            </div>
          )}

          {/* Quiet hint when volume but cal > 0 */}
          {isVolumeUnit && !isFluid && detectedFluidMl !== null && detectedFluidMl >= fluidThresholdMl && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '10px 0', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="icon" style={{ fontSize: 14, color: 'var(--cyan-hi)' }}>water_drop</span>
              {lang === 'he' ? 'לא יספר לנוזלים — קלוריות > 0' : 'Won\'t count as fluid — calories > 0'}
            </p>
          )}

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
    </div>}

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
