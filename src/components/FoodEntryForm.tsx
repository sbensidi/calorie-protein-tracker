import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { FoodHistory, FoodLibraryItem, Meal, NutritionResult, UserFoodItem } from '../types'
import type { Lang } from '../lib/i18n'
import { t, dir, currentTime, today } from '../lib/i18n'
import { calculateNutrition, AiRateLimitError, AiParseError } from '../lib/ai'
import { PhotoNutritionCapture } from './PhotoNutritionCapture'
import type { VisionNutritionResult } from '../lib/aiVision'
import { FEATURES } from '../lib/featureFlags'
import type { BarcodeScannerHandle } from './BarcodeScanner'
import { ErrorBoundary } from './ErrorBoundary'
import type { BarcodeProduct } from '../lib/barcodeApi'

const BarcodeScanner = lazy(() => import('./BarcodeScanner').then(m => ({ default: m.BarcodeScanner })))
import { FoodHistoryModal } from './FoodHistoryModal'
import { UNITS, toBase, mlToGrams } from '../lib/units'
import type { UnitId } from '../lib/units'
import { fuzzyMatchLibrary } from '../lib/fuzzyMatch'
import type { LibraryMatch } from '../lib/fuzzyMatch'
import { useAppContext } from '../context/AppContext'
import { useNutritionAmountEditor } from '../hooks/useNutritionAmountEditor'
import type { EntryUnit } from '../hooks/useNutritionAmountEditor'

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
  batchWeightG?: number | null
}

type CombinedSuggestion =
  | { source: 'history';      item: FoodHistory }
  | { source: 'library';      item: FoodLibraryItem }
  | { source: 'fuzzy';        item: FoodLibraryItem }
  | { source: 'user_library'; item: UserFoodItem }

interface FoodEntryFormProps {
  lang: Lang
  history: FoodHistory[]
  getSuggestions: (q: string) => FoodHistory[]
  searchLibrary?: (q: string) => FoodLibraryItem[]
  defaultWeightUnit?: 'g' | 'oz'
  defaultVolumeUnit?: 'ml' | 'cup' | 'tbsp' | 'tsp' | 'fl_oz'
  onAdd: (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => void
  onUpsertHistory: (item: Pick<FoodHistory, 'name' | 'grams' | 'calories' | 'protein' | 'fat' | 'carbs' | 'fluid_ml'>) => void
  onTouchHistory?: (id: string) => void
  defaultMealType?: MealType
  composedEntries?: ComposedEntry[]
  onAddComposed?: (composedId: string, mealType: MealType) => void
  onAddRecipePortion?: (composedId: string, mealType: MealType, portionG: number) => void
  fluidGoalMl?: number
  fluidThresholdMl?: number
  fluidZeroCalOnly?: boolean
  isOpen?: boolean
  defaultServingGrams?: number
  library?: FoodLibraryItem[]
  searchUserLibrary?: (q: string) => UserFoodItem[]
  onDeleteHistory?: (id: string) => void
  dateOverride?: string
}

export function FoodEntryForm({ lang, history, getSuggestions, searchLibrary, searchUserLibrary, defaultWeightUnit = 'g', onAdd, onUpsertHistory, onTouchHistory, onDeleteHistory, defaultMealType, composedEntries, onAddComposed, onAddRecipePortion, fluidThresholdMl = 100, fluidZeroCalOnly = true, isOpen, defaultServingGrams = 150, library = [], dateOverride }: FoodEntryFormProps) {
  const [mode, setMode]               = useState<EntryMode>(
    () => (localStorage.getItem('entry-mode') as EntryMode) ?? 'scan'
  )
  // Mount BarcodeScanner only once the sheet is actually open AND the user visits scan mode.
  // Starting as false prevents getUserMedia from firing while the sheet is still offscreen.
  const [scannerMounted, setScannerMounted] = useState(false)
  const scannerRef  = useRef<BarcodeScannerHandle>(null)

  // When the sheet opens in scan mode, mount the scanner for the first time.
  // When the sheet closes, stop the camera stream (sheet stays in DOM via CSS transform,
  // so unmount cleanup never fires — this effect is the only reliable trigger).
  useEffect(() => {
    if (isOpen) {
      if (mode === 'scan') setScannerMounted(true)
    } else {
      scannerRef.current?.stop()
    }
  }, [isOpen, mode])

  const [scanProduct,  setScanProduct]  = useState<BarcodeProduct | null>(null)
  const [scanNotFound, setScanNotFound] = useState<string | null>(null) // barcode that wasn't found
  const [scanGrams,    setScanGrams]  = useState('100')
  const [scanMealType, setScanMealType] = useState<MealType>(() => mealTypeByTime())

  const [foodName, setFoodName]       = useState('')
  const [mealType, setMealType]       = useState<MealType>(() => defaultMealType ?? mealTypeByTime())

  useEffect(() => {
    if (isOpen) {
      const t = defaultMealType ?? mealTypeByTime()
      setMealType(t)
      setScanMealType(t)
      setComposedMealType(t)
    }
  }, [isOpen, defaultMealType])

  const [calculating, setCalculating] = useState(false)
  const [nutrition, setNutrition]     = useState<NutritionResult | null>(null)
  const [photoSource, setPhotoSource] = useState<'label' | 'dish' | null>(null)
  const editor = useNutritionAmountEditor({
    initialAmount:   '',
    initialUnit:     defaultWeightUnit,
    initialCalories: '',
    initialProtein:  '',
    initialSg:       defaultServingGrams,
  })
  const [editFat,      setEditFat]      = useState<number | null>(null)
  const [editCarbs,    setEditCarbs]    = useState<number | null>(null)
  const [mealNotes,    setMealNotes]    = useState('')
  const [aiError, setAiError]         = useState<'network' | 'notFound' | 'rateLimit' | 'parseError' | null>(null)
  const libraryDensityRef             = useRef<number | null>(null) // density from library selection
  const matchedLibraryItemRef         = useRef<LibraryMatch | null>(null)
  const [matchedLib, setMatchedLib]   = useState<LibraryMatch | null>(null)
  const servingGramsRef               = useRef(defaultServingGrams) // kept fresh for use inside useCallback

  // Dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [suggestions,  setSuggestions]  = useState<CombinedSuggestion[]>([])
  const inputRef    = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const lastCalcRef = useRef(0)  // debounce: timestamp of last calculate call

  // Composed entry pending confirmation
  const [pendingComposed, setPendingComposed]       = useState<ComposedEntry | null>(null)
  const [composedMealType, setComposedMealType]     = useState<MealType>(() => defaultMealType ?? mealTypeByTime())
  const [portionStr, setPortionStr]                 = useState('')

  // History modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  useLockBodyScroll(historyModalOpen)
  const [historySearch,    setHistorySearch]    = useState('')

  const [fluidExcluded, setFluidExcluded] = useState(false)
  // Track if the current form state came from a history selection (to avoid re-inserting)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const isPcs        = editor.unit === 'pcs'
  const amountMode: 'g' | 'unit' = isPcs ? 'unit' : 'g'
  const numericAmount = editor.numericAmount || (isPcs ? 1 : 0)

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
      .slice(0, 5)
      .map(item => ({ source: 'history' as const, item }))
    const userItems: CombinedSuggestion[] = q && searchUserLibrary
      ? searchUserLibrary(q).slice(0, 3).map(item => ({ source: 'user_library' as const, item }))
      : []
    const libItems: CombinedSuggestion[] = q && searchLibrary
      ? searchLibrary(q).slice(0, 4).map(item => ({ source: 'library' as const, item }))
      : []
    const combined = [...userItems, ...histItems, ...libItems]
    setSuggestions(combined)
    const hasComposed = composedEntries?.some(e => !q || e.name.toLowerCase().includes(q)) ?? false
    setDropdownOpen(combined.length > 0 || hasComposed)
  }

  // Debounced fuzzy match: prepend best-guess library item into the dropdown so
  // the user can pick it explicitly. Exact matches are applied immediately (reliable).
  useEffect(() => {
    if (!foodName.trim() || library.length === 0) return
    if (matchedLibraryItemRef.current?.confidence === 'exact') return
    const timer = setTimeout(() => {
      const match = fuzzyMatchLibrary(foodName, library, lang)
      if (!match) return
      if (match.confidence === 'exact') {
        matchedLibraryItemRef.current = match
        setMatchedLib(match)
      } else {
        // Fuzzy: inject into dropdown as first item (deduplicated)
        setSuggestions(prev => {
          const alreadyIn = prev.some(s =>
            (s.source === 'library' || s.source === 'fuzzy') && s.item.id === match.item.id
          )
          if (alreadyIn) return prev
          return [{ source: 'fuzzy' as const, item: match.item }, ...prev.filter(s => s.source !== 'fuzzy')]
        })
        setDropdownOpen(true)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [foodName, library, lang])

  const handleFoodNameChange = (v: string) => {
    setFoodName(v)
    openDropdown(v)
    setNutrition(null)
    setPhotoSource(null)

    setSelectedHistoryId(null)   // user is typing a new name — no longer a history selection
    if (!v.trim()) { matchedLibraryItemRef.current = null; setMatchedLib(null) }
  }

  const handleFocus = () => { openDropdown(foodName) }

  const handleBlur = () => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setDropdownOpen(false)
      }
    }, 150)
  }

  const openHistoryModal = () => {
    // Blur active input before opening modal so iOS Safari resets zoom first
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
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
    matchedLibraryItemRef.current = { item, confidence: 'exact' }
    setMatchedLib({ item, confidence: 'exact' })
    editor.ratios.current = {
      calPerUnit:  gramsForNutrition > 0 ? cal  / gramsForNutrition : 0,
      protPerUnit: gramsForNutrition > 0 ? prot / gramsForNutrition : 0,
      perServing:  false,
    }
    editor.setUnit(preferredUnit)
    setFoodName(name)
    editor.setAmountStr(String(servingBase))
    setNutrition({ calories: cal, protein: prot })
    editor.setCalories(cal)
    editor.setProtein(prot)
    setDropdownOpen(false)

    setAiError(null)
    inputRef.current?.blur()
    if (isBeverage) setMealType('beverage')
  }

  const handleUserLibrarySelect = (item: UserFoodItem) => {
    const unit: EntryUnit = (item.default_unit as UnitId) in UNITS ? (item.default_unit as UnitId) : defaultWeightUnit
    const amt     = item.default_amount || 100
    const base    = toBase(amt, unit as UnitId)
    const cal     = Math.round(item.calories_per_100g * base / 100)
    const prot    = Math.round(item.protein_per_100g  * base / 100 * 10) / 10
    editor.ratios.current = { calPerUnit: base > 0 ? cal / base : 0, protPerUnit: base > 0 ? prot / base : 0, perServing: false }
    editor.setUnit(unit)
    editor.setAmountStr(String(amt))
    setFoodName(item.name)
    setNutrition({ calories: cal, protein: prot })
    editor.setCalories(cal)
    editor.setProtein(prot)
    setDropdownOpen(false)
    setAiError(null)
    inputRef.current?.blur()
  }

  const handleComposedSelect = (entry: ComposedEntry) => {
    setDropdownOpen(false)
    setHistoryModalOpen(false)
    setHistorySearch('')
    setPortionStr('')
    setPendingComposed(entry)
  }

  const handleSuggestionSelect = (item: FoodHistory) => {
    const isFluidItem = item.fluid_ml != null && item.fluid_ml > 0
    const unitAmount = isFluidItem ? Math.round(item.fluid_ml!) : Math.abs(item.grams)
    const rawCal  = item.calories / (unitAmount || 1)
    const rawProt = item.protein  / (unitAmount || 1)
    // Guard: >12 cal/gram is physically impossible for food (max is ~9 for pure fat).
    // This catches old history entries that stored display-unit amount instead of actual grams.
    // Reset to 0 so live scaling is disabled rather than producing absurd numbers.
    const calPerUnit  = (!isFluidItem && item.grams > 0 && rawCal  > 12) ? 0 : rawCal
    const protPerUnit = (!isFluidItem && item.grams > 0 && rawCal  > 12) ? 0 : rawProt
    editor.ratios.current = {
      calPerUnit,
      protPerUnit,
      perServing:  item.grams < 0 && !isFluidItem,  // pcs items: ratio is cal/serving
    }
    matchedLibraryItemRef.current = null
    setMatchedLib(null)
    setFoodName(item.name)
    editor.setAmountStr(String(unitAmount))
    editor.setUnit(item.grams < 0 ? 'pcs' : isFluidItem ? 'ml' : defaultWeightUnit)
    setNutrition({ calories: item.calories, protein: item.protein })
    editor.setCalories(item.calories || '')
    editor.setProtein(item.protein   || '')
    setEditFat(item.fat   ?? null)
    setEditCarbs(item.carbs ?? null)
    setDropdownOpen(false)

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
        let cal: number
        let prot: number

        if (isPcs) {
          // "N מנות" → convert to grams using the item's serving_size
          const servUnit = (exact.serving_unit as UnitId) in UNITS ? (exact.serving_unit as UnitId) : 'g'
          const gramsPerServing = exact.density
            ? mlToGrams(toBase(Number(exact.serving_size ?? servingGramsRef.current), servUnit), exact.density)
            : toBase(Number(exact.serving_size ?? servingGramsRef.current), servUnit)
          const totalGrams = numericAmount * gramsPerServing
          cal  = Math.round(exact.calories_per_100g * totalGrams / 100)
          prot = Math.round(exact.protein_per_100g  * totalGrams / 100 * 10) / 10
          editor.ratios.current = {
            calPerUnit:  numericAmount > 0 ? cal  / numericAmount : 0,
            protPerUnit: numericAmount > 0 ? prot / numericAmount : 0,
            perServing:  true,
          }
        } else {
          const uid = editor.unit in UNITS ? editor.unit as UnitId : null
          const baseAmount = uid ? toBase(numericAmount, uid) : numericAmount
          const gramsForNutrition = uid && UNITS[uid].type === 'volume'
            ? mlToGrams(baseAmount, exact.density ?? 1)
            : baseAmount
          cal  = Math.round(exact.calories_per_100g * gramsForNutrition / 100)
          prot = Math.round(exact.protein_per_100g  * gramsForNutrition / 100 * 10) / 10
          editor.ratios.current = {
            calPerUnit:  gramsForNutrition > 0 ? cal  / gramsForNutrition : 0,
            protPerUnit: gramsForNutrition > 0 ? prot / gramsForNutrition : 0,
            perServing:  false,
          }
        }

        libraryDensityRef.current = exact.density ?? null
        matchedLibraryItemRef.current = { item: exact, confidence: 'exact' }
        setMatchedLib({ item: exact, confidence: 'exact' })
        // Compute fat/carbs using same gram basis as cal/prot
        const libGrams = (() => {
          if (isPcs) {
            const servUnit = (exact.serving_unit as UnitId) in UNITS ? (exact.serving_unit as UnitId) : 'g'
            const gpServing = exact.density
              ? mlToGrams(toBase(Number(exact.serving_size ?? servingGramsRef.current), servUnit), exact.density)
              : toBase(Number(exact.serving_size ?? servingGramsRef.current), servUnit)
            return numericAmount * gpServing
          }
          const uid = editor.unit in UNITS ? editor.unit as UnitId : null
          const baseAmt = uid ? toBase(numericAmount, uid) : numericAmount
          return uid && UNITS[uid].type === 'volume' ? mlToGrams(baseAmt, exact.density ?? 1) : baseAmt
        })()
        const fatVal  = exact.fat_per_100g   != null ? Math.round(exact.fat_per_100g   * libGrams / 100 * 10) / 10 : null
        const carbVal = exact.carbs_per_100g != null ? Math.round(exact.carbs_per_100g * libGrams / 100 * 10) / 10 : null
        setNutrition({ calories: cal, protein: prot, fat: fatVal ?? undefined, carbs: carbVal ?? undefined })

        editor.setCalories(cal)
        editor.setProtein(prot)
        setEditFat(fatVal)
        setEditCarbs(carbVal)
        setCalculating(false)
        return
      }
    }

    // Step 3+: AI (Groq → USDA fallback inside calculateNutrition)
    // Convert user amount to grams — AI always expects grams (amountMode='g')
    const amountForAI = (() => {
      if (isPcs) return numericAmount
      const uid = editor.unit as UnitId
      const base = toBase(numericAmount, uid)
      return UNITS[uid].type === 'volume' ? mlToGrams(base, libraryDensityRef.current ?? 1) : base
    })()
    try {
      const result = await calculateNutrition(foodName, amountForAI, history, amountMode)
      if (result === null) {
        setAiError('notFound')
        setNutrition({ calories: 0, protein: 0 })
        editor.setCalories('')
        editor.setProtein('')
        setEditFat(null)
        setEditCarbs(null)
      } else {
        editor.ratios.current = {
          calPerUnit:  amountForAI > 0 ? result.calories / amountForAI : 0,
          protPerUnit: amountForAI > 0 ? result.protein  / amountForAI : 0,
          perServing:  isPcs,  // AI calculated in pcs mode → ratio is cal/serving, not cal/gram
        }
        setNutrition(result)

        editor.setCalories(result.calories)
        editor.setProtein(result.protein)
        setEditFat(result.fat   != null ? result.fat   : null)
        setEditCarbs(result.carbs != null ? result.carbs : null)
        // Auto-switch to ml when AI identifies a zero-cal zero-prot fluid (e.g. water)
        if (result.calories === 0 && result.protein === 0) {
          const currentUnitIsWeight = editor.unit === 'g' || editor.unit === 'oz'
          if (currentUnitIsWeight) editor.setUnit('ml')
        }
      }
    } catch (err) {
      setAiError(err instanceof AiRateLimitError ? 'rateLimit' : err instanceof AiParseError ? 'parseError' : 'network')
      setNutrition({ calories: 0, protein: 0 })
      editor.setCalories('')
      editor.setProtein('')
      setEditFat(null)
      setEditCarbs(null)
    }
    setCalculating(false)
  }, [foodName, numericAmount, history, amountMode, editor.unit, isPcs, searchLibrary])

  const handleCancelNutrition = () => {
    setFoodName('')
    editor.setAmountStr('')
    setNutrition(null)
    setPhotoSource(null)

    editor.setCalories('')
    editor.setProtein('')
    setEditFat(null)
    setEditCarbs(null)
    setMealNotes('')
    setAiError(null)

    setDropdownOpen(false)
    setSuggestions([])
    editor.setUnit(defaultWeightUnit)
    setFluidExcluded(false)
    setSelectedHistoryId(null)
    libraryDensityRef.current = null
    matchedLibraryItemRef.current = null
    setMatchedLib(null)
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
      date:           dateOverride ?? today(),
      meal_type:      scanMealType,
      name:           scanProduct.name,
      grams,
      calories,
      protein,
      fat:            scanProduct.fatPer100g   != null ? Math.round(scanProduct.fatPer100g   * grams / 100 * 10) / 10 : null,
      carbs:          scanProduct.carbsPer100g != null ? Math.round(scanProduct.carbsPer100g * grams / 100 * 10) / 10 : null,
      notes:          null,
      time_logged:    currentTime(),
      fluid_ml:       null,
      fluid_excluded: false,
      display_unit:   null,
      display_amount: null,
    })
    onUpsertHistory({ name: scanProduct.name, grams, calories, protein, fat: scanProduct.fatPer100g != null ? Math.round(scanProduct.fatPer100g * grams / 100 * 10) / 10 : null, carbs: scanProduct.carbsPer100g != null ? Math.round(scanProduct.carbsPer100g * grams / 100 * 10) / 10 : null, fluid_ml: null })
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

  // ── Photo nutrition handlers ──────────────────────────────────
  const handlePhotoResult = useCallback((result: VisionNutritionResult) => {
    // Pre-fill manual entry fields and switch to manual mode for user verification
    editor.ratios.current = {
      calPerUnit:  result.calories_per_100g / 100,
      protPerUnit: result.protein_per_100g  / 100,
      perServing:  false,
    }
    editor.setUnit(defaultWeightUnit)
    editor.setAmountStr('100')
    editor.setCalories(result.calories_per_100g)
    editor.setProtein(result.protein_per_100g)
    setFoodName(result.identified)
    setNutrition({ calories: result.calories_per_100g, protein: result.protein_per_100g })
    setPhotoSource(result.source)
    matchedLibraryItemRef.current = null
    setAiError(null)
    setMode('manual')
    localStorage.setItem('entry-mode', 'manual')
  }, [editor, defaultWeightUnit])

  const switchMode = (m: EntryMode) => {
    if (m === 'scan') setScannerMounted(true)
    if (m === 'manual') scannerRef.current?.stop()
    setMode(m)
    localStorage.setItem('entry-mode', m)
    setScanProduct(null)
    setScanNotFound(null)
    setScanGrams('100')
  }

  const numCalories = Math.max(0, Number(editor.calories) || 0)
  const numProtein  = Math.max(0, Number(editor.protein)  || 0)
  const amountInGrams: number = (() => {
    if (isPcs) return 0
    const uid = editor.unit as UnitId
    const baseAmount = toBase(numericAmount, uid)
    if (UNITS[uid].type === 'volume') {
      return mlToGrams(baseAmount, libraryDensityRef.current ?? 1)
    }
    return baseAmount
  })()
  const storedGrams = isPcs ? -numericAmount : Math.round(amountInGrams)

  // Fluid detection: volume unit + amount > threshold
  // ml/cup/fl_oz are unambiguous beverage units → always count as fluid above threshold,
  // regardless of calories (coffee, juice, milk all have calories but are still fluids).
  // tbsp/tsp can be condiments/oils → still respect fluidZeroCalOnly for those.
  const isVolumeUnit      = editor.unit !== 'pcs' && editor.unit !== 'g' && editor.unit !== 'oz'
  const detectedFluidMl   = isVolumeUnit ? toBase(numericAmount, editor.unit as UnitId) : null
  // ml/cup/fl_oz are unambiguous drinks → always fluid regardless of calories.
  // tbsp/tsp could be condiments/oils → respect fluidZeroCalOnly for those.
  const isClearBeverageUnit = editor.unit === 'ml' || editor.unit === 'cup' || editor.unit === 'fl_oz'
  const calZeroOk           = isClearBeverageUnit || !fluidZeroCalOnly || numCalories === 0
  const isFluid             = detectedFluidMl !== null && detectedFluidMl >= fluidThresholdMl && calZeroOk

  const handleAdd = () => {
    if (!foodName.trim() || nutrition === null) return
    onAdd({
      date:           dateOverride ?? today(),
      meal_type:      mealType,
      name:           foodName,
      grams:          storedGrams,
      calories:       numCalories,
      protein:        numProtein,
      fat:            editFat,
      carbs:          editCarbs,
      notes:          mealNotes.trim() || null,
      time_logged:    currentTime(),
      fluid_ml:       isFluid && !fluidExcluded ? detectedFluidMl : null,
      fluid_excluded: false,
      display_unit:   editor.unit !== 'g' && editor.unit !== 'pcs' ? editor.unit : null,
      display_amount: editor.unit !== 'g' && editor.unit !== 'pcs' ? numericAmount : null,
    })
    // If the item came from history, just bump its use_count — don't create a new row.
    // If new (AI / library / manual), upsert normally (creates or updates by name+grams).
    if (selectedHistoryId && onTouchHistory) {
      onTouchHistory(selectedHistoryId)
    } else {
      const historyGrams = storedGrams
      if (historyGrams !== 0) {
        onUpsertHistory({ name: foodName, grams: historyGrams, calories: numCalories, protein: numProtein, fat: editFat, carbs: editCarbs, fluid_ml: isFluid && !fluidExcluded ? detectedFluidMl : null })
      }
    }
    // Reset
    setFoodName('')
    editor.setAmountStr('')
    setNutrition(null)
    setPhotoSource(null)

    setDropdownOpen(false)
    setSuggestions([])
    setAiError(null)
    editor.setCalories('')
    editor.setProtein('')
    setEditFat(null)
    setEditCarbs(null)
    setMealNotes('')
    editor.setUnit(defaultWeightUnit)
    setFluidExcluded(false)
    setSelectedHistoryId(null)
    libraryDensityRef.current = null
    matchedLibraryItemRef.current = null
    setMatchedLib(null)
  }

  const mealTypeOptions: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: t(lang, 'breakfast') },
    { value: 'lunch',     label: t(lang, 'lunch')     },
    { value: 'dinner',    label: t(lang, 'dinner')    },
    { value: 'snack',     label: t(lang, 'snack')     },
    { value: 'beverage',  label: t(lang, 'beverage')  },
  ]

  const isRTL = lang === 'he'
  const { styleMode } = useAppContext()
  const minimal = styleMode === 'minimal'

  // Clear button — spans full height of wrapper, icon centered via flexbox
  const clearBtnStyle = (): React.CSSProperties => ({
    position: 'absolute',
    ...(isRTL ? { left: 0 } : { right: 0 }),
    top: 0, bottom: 0, width: 32,
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-3)', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  })

  // Serving unit gram value: used when editor.unit === 'pcs' to show gram anchor hint
  const servingGrams = (() => {
    if (matchedLib?.item.countable && matchedLib.item.serving_size != null) {
      return Number(matchedLib.item.serving_size)  // DB may return string — coerce to number
    }
    return defaultServingGrams
  })()
  servingGramsRef.current = servingGrams  // keep ref fresh for use inside useCallback
  editor.sg.current      = servingGrams
  editor.density.current = libraryDensityRef.current ?? 1

  // Scan product computed totals
  const scanG    = Number(scanGrams) || 0
  const scanCal  = scanProduct ? Math.round(scanProduct.caloriesPer100g * scanG / 100) : 0
  const scanProt = scanProduct ? Math.round(scanProduct.proteinPer100g  * scanG / 100 * 10) / 10 : 0
  const scanFat  = scanProduct?.fatPer100g   != null ? Math.round(scanProduct.fatPer100g   * scanG / 100 * 10) / 10 : null
  const scanCarb = scanProduct?.carbsPer100g != null ? Math.round(scanProduct.carbsPer100g * scanG / 100 * 10) / 10 : null

  return (
    <>

    {/* ── Composed entry confirmation ───────────────────────── */}
    {pendingComposed && (() => {
      const isRecipe = !!pendingComposed.batchWeightG
      const portionG = parseFloat(portionStr)
      const ratio    = isRecipe && portionG > 0 ? portionG / pendingComposed.batchWeightG! : 1
      const dispCal  = isRecipe ? (portionG > 0 ? Math.round(pendingComposed.calories * ratio) : '—') : pendingComposed.calories
      const dispProt = isRecipe ? (portionG > 0 ? Math.round(pendingComposed.protein  * ratio * 10) / 10 : '—') : pendingComposed.protein
      const per100Cal  = isRecipe ? Math.round(pendingComposed.calories / pendingComposed.batchWeightG! * 100) : null
      const per100Prot = isRecipe ? Math.round(pendingComposed.protein  / pendingComposed.batchWeightG! * 100 * 10) / 10 : null

      const handleAdd = () => {
        if (isRecipe) {
          if (!portionG || portionG <= 0) return
          onAddRecipePortion?.(pendingComposed.id, composedMealType, portionG)
        } else {
          onAddComposed?.(pendingComposed.id, composedMealType)
        }
        setPendingComposed(null)
      }

      return (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="icon icon-sm" style={{ color: 'var(--composed)' }}>restaurant</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{pendingComposed.name}</span>
            {isRecipe && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--composed)', background: 'var(--composed-tint)', border: '1px solid var(--composed-border)', borderRadius: 6, padding: '2px 6px' }}>
                {t(lang, 'recipeLabel')}
              </span>
            )}
            <button onMouseDown={e => { e.preventDefault(); setPendingComposed(null) }}
              aria-label={t(lang, 'close')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex' }}>
              <span className="icon icon-sm">close</span>
            </button>
          </div>

          {/* Recipe: per-100g strip + gram input */}
          {isRecipe && (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1 }}>{t(lang, 'per100g')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)' }}>{per100Cal} {t(lang, 'caloriesUnit')}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--positive-hi)', marginInlineStart: 8 }}>{per100Prot} {t(lang, 'proteinUnit')}</span>
              </div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  className="inp"
                  style={{ fontSize: 16, paddingInlineEnd: portionStr ? 28 : undefined }}
                  placeholder={t(lang, 'recipePortionQ')}
                  value={portionStr}
                  autoFocus
                  onFocus={e => e.target.select()}
                  onChange={e => setPortionStr(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                />
                {portionStr && (
                  <button onMouseDown={e => { e.preventDefault(); setPortionStr('') }} tabIndex={-1}
                    aria-label={t(lang, 'clearField')}
                    style={{ position: 'absolute', insetInlineEnd: 0, top: 0, bottom: 0, width: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Cal / Prot tiles */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: 'var(--accent-fill)', border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-hi)', letterSpacing: '0.04em', margin: '0 0 3px' }}>{t(lang, 'calories').toUpperCase()}</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{dispCal}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{t(lang, 'caloriesUnit')}</p>
            </div>
            <div style={{ flex: 1, background: minimal ? 'var(--accent-fill)' : 'var(--positive-fill)', border: `1px solid color-mix(in srgb, ${minimal ? 'var(--accent)' : 'var(--positive)'} 14%, transparent)`, borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: minimal ? 'var(--accent-hi)' : 'var(--positive-hi)', letterSpacing: '0.04em', margin: '0 0 3px' }}>{t(lang, 'protein').toUpperCase()}</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{dispProt}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0' }}>{t(lang, 'proteinUnit')}</p>
            </div>
          </div>

          {/* Meal type selector */}
          <select className="inp" style={{ width: '100%', fontSize: 16, marginBottom: 14 }}
            value={composedMealType} onChange={e => setComposedMealType(e.target.value as MealType)}>
            {mealTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-confirm" style={{ flex: 1 }}
              disabled={isRecipe && (!portionG || portionG <= 0)}
              onClick={handleAdd}>
              {t(lang, 'add')}
            </button>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setPendingComposed(null)}>
              {t(lang, 'cancel')}
            </button>
          </div>
        </div>
      )
    })()}

    {!pendingComposed && <div className="card" style={{ padding: 16, marginBottom: 20 }}>

      {/* ── Segmented control: manual first → right in RTL, left in LTR ── */}
      <div className="seg-control" style={{ marginBottom: 14 }}>
        <button
          className={`seg-btn ${mode === 'manual' ? 'seg-btn--manual' : ''}`}
          onClick={() => switchMode('manual')}
        >
          <span className="icon icon-sm">edit</span>
          {t(lang, 'manualEntry')}
        </button>
        <button
          className={`seg-btn ${mode === 'scan' ? 'seg-btn--scan' : ''}`}
          onClick={() => switchMode('scan')}
        >
          <span className="icon icon-sm">barcode_scanner</span>
          {t(lang, 'scanBarcode')}
        </button>
      </div>

      {/* ── Scan mode: camera ─────────────────────────────────── */}
      {/* Mounted only after the user first visits the scan tab, then kept
          mounted (hidden via CSS) so the stream survives mode switches. */}
      {scannerMounted && (
        <div style={{ display: mode === 'scan' && !scanProduct && !scanNotFound ? undefined : 'none' }}>
          <ErrorBoundary>
            <Suspense fallback={null}>
              <BarcodeScanner
                ref={scannerRef}
                lang={lang}
                onResult={handleScanResult}
                onNotFound={handleScanNotFound}
              />
            </Suspense>
          </ErrorBoundary>
          {FEATURES.photoNutrition && (
            <PhotoNutritionCapture
              lang={lang}
              onResult={handlePhotoResult}
              onSwitchManual={() => switchMode('manual')}
            />
          )}
        </div>
      )}

      {/* ── Scan mode: not found ──────────────────────────────── */}
      {mode === 'scan' && !scanProduct && scanNotFound && (
        <div className="scanner-error" dir={isRTL ? 'rtl' : 'ltr'}>
          <span className="icon" style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 6 }}>barcode_scanner</span>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', textAlign: 'center', marginBottom: 4 }}>
            {t(lang, 'productNotFound')}
          </p>
          <p dir="ltr" style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, fontFamily: 'monospace' }}>
            {scanNotFound}
          </p>
          {FEATURES.photoNutrition ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: '0 0 12px', lineHeight: 1.5 }}>
                {t(lang, 'barcodeNotFoundHint')}
              </p>
              <PhotoNutritionCapture
                lang={lang}
                onResult={handlePhotoResult}
                onSwitchManual={() => switchMode('manual')}
              />
              <button className="btn-ghost" onClick={handleScanAgain}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', marginTop: 4 }}>
                <span className="icon icon-sm">refresh</span>
                {t(lang, 'scanAgain')}
              </button>
            </>
          ) : (
            <button className="btn-ghost" onClick={handleScanAgain}
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span className="icon icon-sm">refresh</span>
              {t(lang, 'scanAgain')}
            </button>
          )}
        </div>
      )}

      {/* ── Post-scan confirmation ────────────────────────────── */}
      {mode === 'scan' && scanProduct && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Product found badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: minimal ? 'var(--accent-fill)' : 'var(--positive-fill)',
            border: `1px solid ${minimal ? 'var(--accent-select)' : 'var(--positive-select)'}`,
            borderRadius: 10, padding: '8px 11px',
          }}>
            <span className="icon icon-sm" style={{ color: minimal ? 'var(--accent-hi)' : 'var(--positive-hi)' }}>check_circle</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: minimal ? 'var(--accent-hi)' : 'var(--positive-hi)', flex: 1 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, background: 'var(--accent-fill)', border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-hi)', letterSpacing: '0.04em', marginBottom: 3 }}>{t(lang, 'calories').toUpperCase()}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{scanProduct.caloriesPer100g}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t(lang, 'caloriesUnit')}</p>
                </div>
                <div style={{ flex: 1, background: minimal ? 'var(--accent-fill)' : 'var(--positive-fill)', border: `1px solid color-mix(in srgb, ${minimal ? 'var(--accent)' : 'var(--positive)'} 14%, transparent)`, borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: minimal ? 'var(--accent-hi)' : 'var(--positive-hi)', letterSpacing: '0.04em', marginBottom: 3 }}>{t(lang, 'protein').toUpperCase()}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{scanProduct.proteinPer100g}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t(lang, 'proteinUnit')}</p>
                </div>
              </div>
              {(scanProduct.fatPer100g != null || scanProduct.carbsPer100g != null) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {scanProduct.fatPer100g != null && (
                    <div style={{ flex: 1, background: 'var(--warning-fill)', border: '1px solid color-mix(in srgb, var(--warning) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning-hi)', letterSpacing: '0.04em', marginBottom: 3 }}>{t(lang, 'fat').toUpperCase()}</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{scanProduct.fatPer100g}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t(lang, 'fatUnit')}</p>
                    </div>
                  )}
                  {scanProduct.carbsPer100g != null && (
                    <div style={{ flex: 1, background: 'var(--accent-fill)', border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius: 10, padding: '10px 12px' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-hi)', letterSpacing: '0.04em', marginBottom: 3 }}>{t(lang, 'carbs').toUpperCase()}</p>
                      <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1 }}>{scanProduct.carbsPer100g}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t(lang, 'carbsUnit')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Weight + meal type row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', width: 110, flexShrink: 0 }}>
              <input
                type="number"
                inputMode="decimal"
                className="inp"
                style={{ textAlign: 'center', paddingInlineEnd: 28, fontSize: 16 }}
                value={scanGrams}
                onFocus={e => e.target.select()}
                onChange={e => setScanGrams(e.target.value)}
              />
              <span style={{
                position: 'absolute', insetInlineEnd: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11, fontWeight: 600, color: 'var(--text-3)', pointerEvents: 'none',
              }}>
                {t(lang, 'proteinUnit')}
              </span>
            </div>
            <select
              className="inp"
              style={{ flex: 1, fontSize: 16 }}
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
                {t(lang, 'totalGramsAbbr')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 15, fontWeight: 800, color: 'var(--accent-hi)' }}>
                {scanCal}
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{t(lang, 'caloriesUnit')}</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 15, fontWeight: 800, color: 'var(--positive-hi)', marginInlineStart: 8 }}>
                {scanProt}
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{t(lang, 'proteinUnit')}</span>
                <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.55 }}>{t(lang, 'protein')}</span>
              </span>
              {scanFat != null && (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 15, fontWeight: 800, color: 'var(--warning-hi)', marginInlineStart: 8 }}>
                  {scanFat}
                  <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{t(lang, 'fatUnit')}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.55 }}>{t(lang, 'fat')}</span>
                </span>
              )}
              {scanCarb != null && (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 15, fontWeight: 800, color: 'var(--accent-hi)', marginInlineStart: 8 }}>
                  {scanCarb}
                  <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{t(lang, 'carbsUnit')}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.55 }}>{t(lang, 'carbs')}</span>
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button className="btn-confirm" onClick={handleScanAdd} style={{ flex: 1 }} disabled={scanG <= 0}>
              {t(lang, 'add')}
            </button>
            <button className="btn-ghost" onClick={handleScanAgain} style={{ flexShrink: 0, paddingInline: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Row 1 — food name (full width) */}
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
            style={{ fontSize: 16, paddingInlineStart: 12, paddingInlineEnd: foodName ? 78 : 46 }}
          />
          {/* History browse button */}
          <button
            onMouseDown={e => { e.preventDefault(); openHistoryModal() }}
            tabIndex={-1}
            aria-label={t(lang, 'foodHistory')}
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
              aria-label={t(lang, 'clearSearch')}
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

        {/* Row 2 — amount | unit | meal type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>

          {/* Col 1 — numeric amount */}
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
                pcs:   { he: 'מנה',       en: 'serving' },
              }
              return lang === 'he' ? labels[editor.unit].he : labels[editor.unit].en
            })()}
            value={editor.amountStr}
            onFocus={e => e.target.select()}
            onChange={e => { editor.setAmountStr(e.target.value); setNutrition(null) }}
          />

          {/* Col 2 — unit dropdown */}
          <select
            className="inp"
            value={editor.unit}
            onChange={e => {
              const next = e.target.value as EntryUnit
              editor.setUnit(next)
              setNutrition(null)
              libraryDensityRef.current = null
            }}
            style={{ fontSize: 16, fontWeight: 700, cursor: 'pointer', textOverflow: 'ellipsis', overflow: 'hidden' }}
          >
            <optgroup label={t(lang, 'unitGroupWeight')}>
              <option value="g">{t(lang, 'unitOptG')}</option>
              <option value="oz">{t(lang, 'unitOptOz')}</option>
            </optgroup>
            <optgroup label={t(lang, 'unitGroupVolume')}>
              <option value="ml">{t(lang, 'unitOptMl')}</option>
              <option value="fl_oz">{t(lang, 'unitOptFlOz')}</option>
              <option value="cup">{t(lang, 'unitOptCup')}</option>
              <option value="tbsp">{t(lang, 'unitOptTbsp')}</option>
              <option value="tsp">{t(lang, 'unitOptTsp')}</option>
            </optgroup>
            <optgroup label={t(lang, 'unitGroupCount')}>
              <option value="pcs">{t(lang, 'unitOptPcs')}</option>
            </optgroup>
          </select>

          {/* Col 3 — meal type */}
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

        </div>

        {/* Row 3 — calculate (full width, primary) */}
        <button
          className="btn-primary"
          onClick={handleCalculate}
          disabled={!foodName.trim() || calculating}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: calculating ? 0.8 : 1 }}
        >
          {calculating && (
            <span className="icon icon-sm" style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>progress_activity</span>
          )}
          {calculating ? t(lang, 'calculating') : t(lang, 'calculate')}
        </button>

      </div>

      {/* Serving hint */}
      {editor.unit === 'pcs' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '3px 8px',
          }}>
            {`${t(lang, 'serving')} ≈ ${servingGrams}${t(lang, 'proteinUnit')}`}
            {matchedLib?.item.countable && matchedLib.item.serving_size != null && (
              <span style={{ marginInlineStart: 4, color: 'var(--accent-hi)', opacity: 0.8 }}>
                <span className="icon" style={{ fontSize: 10, verticalAlign: 'middle' }}>library_books</span>
              </span>
            )}
          </span>
        </div>
      )}

      {/* History dropdown — full container width */}
      {dropdownOpen && (() => {
        const q = foodName.trim().toLowerCase()
        const composedFiltered = composedEntries
          ? composedEntries.filter(e => !q || e.name.toLowerCase().includes(q))
          : []
        // Deduplicate by name when no query — keep first (most recent)
        const matchedComposed = q ? composedFiltered : (() => {
          const seen = new Set<string>()
          return composedFiltered.filter(e => {
            const key = e.name.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        })()
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
              zIndex: 50, // --z-dropdown
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Composed dishes at top */}
            {matchedComposed.map(entry => (
              <button
                key={entry.id}
                onMouseDown={() => handleComposedSelect(entry)}
                style={{
                  display: 'block', width: '100%',
                  padding: minimal ? '8px 12px' : '9px 12px', background: 'transparent', border: 'none',
                  borderBottom: minimal ? '1px dashed var(--border)' : '1px solid var(--border)',
                  cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--composed-tint)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {minimal ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{entry.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--composed)', whiteSpace: 'nowrap', flexShrink: 0 }}>{t(lang, 'composedDishChip')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                        {entry.calories}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                        {entry.protein}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'gProteinLabel')}</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="icon icon-sm" style={{ color: 'var(--composed)', flexShrink: 0 }}>restaurant</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--accent-hi)', flexShrink: 0, fontWeight: 600 }}>{entry.calories}</span>
                    <span style={{ fontSize: 11, color: 'var(--positive-hi)', flexShrink: 0, fontWeight: 600 }}>{entry.protein}g</span>
                  </div>
                )}
              </button>
            ))}
            {/* Food history + library items (+ fuzzy best-guess at top) */}
            {suggestions.map((s, i) => {
              const isLast = i === suggestions.length - 1
              if (s.source === 'fuzzy') {
                const item     = s.item
                const name     = lang === 'he' ? item.name_he : item.name_en
                const unit     = (item.serving_unit as UnitId) in UNITS ? (item.serving_unit as UnitId) : 'g'
                const servBase = item.serving_size ?? 100
                const grams    = item.density ? mlToGrams(toBase(servBase, unit), item.density) : toBase(servBase, unit)
                const cal      = Math.round(item.calories_per_100g * grams / 100)
                const prot     = Math.round(item.protein_per_100g  * grams / 100 * 10) / 10
                return (
                  <button
                    key={`fuzzy-${item.id}`}
                    onMouseDown={() => handleLibrarySelect(item)}
                    style={{
                      display: 'block', width: '100%',
                      padding: minimal ? '8px 12px' : '9px 12px', background: 'var(--library-fill)', border: 'none',
                      borderBottom: minimal ? '1px dashed var(--border)' : '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--library-tint)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--library-fill)')}
                  >
                    {minimal ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
                          <span style={{ fontSize: 10, color: 'var(--library-hi)', whiteSpace: 'nowrap', flexShrink: 0 }}>{t(lang, 'libraryCloseBadge')}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {cal}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {prot}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'gProteinLabel')}</span>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="icon icon-sm" style={{ color: 'var(--library)', flexShrink: 0 }}>library_books</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: 'var(--library-hi)',
                          background: 'var(--library-chip)', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                        }}>{t(lang, 'libraryCloseChip')}</span>
                        <span style={{ fontSize: 11, color: 'var(--accent-hi)', flexShrink: 0, fontWeight: 600 }}>{cal}</span>
                        <span style={{ fontSize: 11, color: 'var(--positive-hi)', flexShrink: 0, fontWeight: 600 }}>{prot}g</span>
                      </div>
                    )}
                  </button>
                )
              }
              if (s.source === 'history') {
                const item = s.item
                const itemIsUnit  = item.grams < 0
                const itemIsFluid = item.fluid_ml != null && item.fluid_ml > 0
                const amtDisplay  = itemIsUnit  ? `${Math.abs(item.grams)} ${t(lang, 'unitLabel')}`
                  : itemIsFluid ? (item.fluid_ml! >= 1000 ? `${(item.fluid_ml! / 1000).toFixed(1)}${t(lang, 'litersUnit')}` : `${Math.round(item.fluid_ml!)}ml`)
                  : `${item.grams}g`
                return (
                  <button
                    key={`h-${item.id}`}
                    onMouseDown={() => handleSuggestionSelect(item)}
                    style={{
                      display: 'block', width: '100%',
                      padding: minimal ? '8px 12px' : '9px 12px', background: 'transparent', border: 'none',
                      borderBottom: isLast ? 'none' : (minimal ? '1px dashed var(--border)' : '1px solid var(--border)'),
                      cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {minimal ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {item.name}
                            {item.fluid_ml != null && item.fluid_ml > 0 && <span className="icon" style={{ fontSize: 12, color: 'var(--cyan-hi)', opacity: 0.8, verticalAlign: 'middle', margin: '0 4px' }}>water_drop</span>}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{amtDisplay}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {Math.round(item.calories)}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {Math.round(item.protein * 10) / 10}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'gProteinLabel')}</span>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="icon icon-sm" style={{ color: 'var(--text-2)', flexShrink: 0 }}>history</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{amtDisplay}</span>
                        <span style={{ fontSize: 11, color: 'var(--accent-hi)', flexShrink: 0, fontWeight: 600 }}>{Math.round(item.calories)}</span>
                        <span style={{ fontSize: 11, color: 'var(--positive-hi)', flexShrink: 0, fontWeight: 600 }}>{Math.round(item.protein * 10) / 10}g</span>
                      </div>
                    )}
                  </button>
                )
              } else if (s.source === 'user_library') {
                const item    = s.item
                const unit: UnitId = (item.default_unit as UnitId) in UNITS ? (item.default_unit as UnitId) : 'g'
                const base    = toBase(item.default_amount, unit)
                const cal     = Math.round(item.calories_per_100g * base / 100)
                const prot    = Math.round(item.protein_per_100g  * base / 100 * 10) / 10
                const amtDisp = `${item.default_amount}${item.default_unit}`
                return (
                  <button
                    key={`ul-${item.id}`}
                    onMouseDown={() => handleUserLibrarySelect(item)}
                    style={{
                      display: 'block', width: '100%',
                      padding: minimal ? '8px 12px' : '9px 12px', background: 'var(--accent-fill)', border: 'none',
                      borderBottom: isLast ? 'none' : (minimal ? '1px dashed var(--border)' : '1px solid var(--border)'),
                      cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-tint)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent-fill)')}
                  >
                    {minimal ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{item.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--accent-hi)', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{t(lang, 'myFoodsBadge')}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{amtDisp}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {cal}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {prot}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'gProteinLabel')}</span>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="icon icon-sm" style={{ color: 'var(--accent-hi)', flexShrink: 0 }}>bookmark</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-hi)', background: 'var(--accent-tint)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>{t(lang, 'myFoodsBadge')}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{amtDisp}</span>
                        <span style={{ fontSize: 11, color: 'var(--accent-hi)', flexShrink: 0, fontWeight: 600 }}>{cal}</span>
                        <span style={{ fontSize: 11, color: 'var(--positive-hi)', flexShrink: 0, fontWeight: 600 }}>{prot}g</span>
                      </div>
                    )}
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
                  : unit === 'cup'   ? `${servingBase} ${t(lang, 'unitOptCup')}`
                  : unit === 'fl_oz' ? `${servingBase} ${t(lang, 'unitOptFlOz')}`
                  : unit === 'tbsp'  ? `${servingBase} ${t(lang, 'unitOptTbsp')}`
                  : unit === 'tsp'   ? `${servingBase} ${t(lang, 'unitOptTsp')}`
                  : `${servingBase}${unit}`
                return (
                  <button
                    key={`lib-${item.id}`}
                    onMouseDown={() => handleLibrarySelect(item)}
                    style={{
                      display: 'block', width: '100%',
                      padding: minimal ? '8px 12px' : '9px 12px', background: 'var(--warning-fill)', border: 'none',
                      borderBottom: isLast ? 'none' : (minimal ? '1px dashed var(--border)' : '1px solid var(--border)'),
                      cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--warning-tint)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--warning-fill)')}
                  >
                    {minimal ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{amtDisplay}</span>
                          <span style={{ fontSize: 10, color: 'var(--warning)', whiteSpace: 'nowrap', flexShrink: 0 }}>{t(lang, 'libraryChip')}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {cal}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'caloriesUnit')}</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--positive-hi)', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            {prot}<span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>{t(lang, 'gProteinLabel')}</span>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="icon icon-sm" style={{ color: 'var(--warning)', flexShrink: 0 }}>menu_book</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{amtDisplay}</span>
                        <span style={{ fontSize: 11, color: 'var(--accent-hi)', flexShrink: 0, fontWeight: 600 }}>{cal}</span>
                        <span style={{ fontSize: 11, color: 'var(--positive-hi)', flexShrink: 0, fontWeight: 600 }}>{prot}g</span>
                      </div>
                    )}
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
          <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
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
          {foodName && (
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 10 }}>
              {foodName}
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
              {t(lang, 'confirmNutrition')}
            </p>
            {photoSource && (
              <span style={{
                fontSize: 10, fontWeight: 600, borderRadius: 6, padding: '2px 7px',
                color:      photoSource === 'label' ? 'var(--positive-hi)' : 'var(--accent-hi)',
                background: photoSource === 'label' ? 'var(--positive-fill)' : 'var(--accent-fill)',
                border:     `1px solid ${photoSource === 'label' ? 'var(--positive-border)' : 'var(--accent-border)'}`,
              }}>
                {t(lang, photoSource === 'label' ? 'photoSourceLabel' : 'photoSourceDish')}
              </span>
            )}
          </div>

          {/* 4-column grid: calories | protein | amount | unit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {/* Calories */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--accent-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'calories')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  className="inp"
                  style={{ borderColor: 'var(--accent-glow)', fontSize: 16, paddingInlineEnd: editor.calories !== '' ? 32 : 12 }}
                  value={editor.calories}
                  placeholder="0"
                  onChange={e => editor.setCalories(e.target.value === '' ? '' : Math.round(Number(e.target.value)))}
                  onFocus={e => { if (numCalories === 0) editor.setCalories(''); else e.target.select() }}
                />
                {editor.calories !== '' && (
                  <button onMouseDown={e => { e.preventDefault(); editor.setCalories('') }} tabIndex={-1} aria-label={t(lang, 'clearField')} style={clearBtnStyle()}>
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Protein */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--positive-hi)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'proteinGramsLabel')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className="inp inp-green"
                  style={{ borderColor: 'var(--positive-glow)', fontSize: 16, paddingInlineEnd: editor.protein !== '' ? 32 : 12 }}
                  value={editor.protein}
                  placeholder="0"
                  onChange={e => editor.setProtein(e.target.value === '' ? '' : Math.round(Number(e.target.value) * 10) / 10)}
                  onFocus={e => { if (numProtein === 0) editor.setProtein(''); else e.target.select() }}
                />
                {editor.protein !== '' && (
                  <button onMouseDown={e => { e.preventDefault(); editor.setProtein('') }} tabIndex={-1} aria-label={t(lang, 'clearField')} style={clearBtnStyle()}>
                    <span className="icon icon-sm">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Amount — live scaling */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'amount')}
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="inp"
                style={{ fontSize: 16, textAlign: 'center' }}
                value={editor.amountStr}
                placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => editor.handleAmountChange(e.target.value)}
              />
            </div>

            {/* Unit */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t(lang, 'unitSingular')}
              </label>
              <select
                className="inp"
                style={{ fontSize: 16 }}
                value={editor.unit}
                onChange={e => editor.handleUnitChange(e.target.value as EntryUnit)}
              >
                <optgroup label={t(lang, 'unitGroupWeight')}>
                  <option value="g">{lang === 'he' ? 'גרם' : 'g'}</option>
                  <option value="oz">{lang === 'he' ? 'אונקיה' : 'oz'}</option>
                </optgroup>
                <optgroup label={t(lang, 'unitGroupVolume')}>
                  <option value="ml">{lang === 'he' ? 'מ"ל' : 'ml'}</option>
                  <option value="fl_oz">{lang === 'he' ? 'פל.אונ׳' : 'fl oz'}</option>
                  <option value="cup">{lang === 'he' ? 'כוס' : 'cup'}</option>
                  <option value="tbsp">{lang === 'he' ? 'כף' : 'tbsp'}</option>
                  <option value="tsp">{lang === 'he' ? 'כפית' : 'tsp'}</option>
                </optgroup>
                <optgroup label={t(lang, 'unitGroupCount')}>
                  <option value="pcs">{lang === 'he' ? 'מנה' : 'serving'}</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Serving hint — shown when pcs unit selected */}
          {editor.unit === 'pcs' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '3px 8px',
              }}>
                {`${t(lang, 'serving')} ≈ ${servingGrams}${t(lang, 'proteinUnit')}`}
              </span>
            </div>
          )}

          {/* Fat / Carbs chips — shown when available (AI, library, barcode, or history) */}
          {(editFat != null || editCarbs != null) && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {editFat != null && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--warning-hi)',
                  background: 'var(--warning-tint)', border: '1px solid var(--warning-border)',
                  borderRadius: 8, padding: '3px 8px',
                }}>
                  {t(lang, 'fat')} {editFat}{t(lang, 'fatUnit')}
                </span>
              )}
              {editCarbs != null && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--library-hi)',
                  background: 'var(--library-tint)', border: '1px solid var(--library-border)',
                  borderRadius: 8, padding: '3px 8px',
                }}>
                  {t(lang, 'carbs')} {editCarbs}{t(lang, 'carbsUnit')}
                </span>
              )}
            </div>
          )}

          {/* Notes input */}
          <input
            type="text"
            className="inp"
            style={{ fontSize: 16, marginBottom: 10 }}
            placeholder={t(lang, 'notesPlaceholder')}
            value={mealNotes}
            onChange={e => setMealNotes(e.target.value)}
            maxLength={200}
          />

          {/* Fluid notice — shown when auto-detected */}
          {isFluid && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: fluidExcluded ? 'var(--neutral-fill)' : 'var(--accent-fill)',
              border: `1px solid ${fluidExcluded ? 'var(--neutral-chip)' : 'var(--accent-select)'}`,
              borderRadius: 9, padding: '7px 11px',
              margin: '10px 0',
              transition: 'background .2s, border-color .2s',
            }}>
              <span className="icon" style={{ fontSize: 16, color: 'var(--cyan-hi)', flexShrink: 0 }}>water_drop</span>
              <span style={{
                fontSize: 12, fontWeight: 600, flex: 1,
                color: fluidExcluded ? 'var(--text-3)' : 'var(--accent-hi)',
                textDecoration: fluidExcluded ? 'line-through' : 'none',
                opacity: fluidExcluded ? 0.7 : 1,
              }}>
                {`${Math.round(detectedFluidMl!)}${t(lang, 'fluidGoalSuffix')}`}
              </span>
              {/* Toggle */}
              <button
                onClick={() => setFluidExcluded(v => !v)}
                aria-label={t(lang, 'toggle')}
                aria-pressed={fluidExcluded}
                style={{
                  width: 34, height: 20, borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: fluidExcluded ? 'var(--neutral-glow)' : 'var(--accent)',
                  position: 'relative', flexShrink: 0, transition: 'background .2s',
                }}
              >
                <span style={{
                  position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: 'var(--toggle-knob)',
                  top: 3, insetInlineEnd: fluidExcluded ? 17 : 3,
                  transition: 'inset-inline-end .2s',
                }} />
              </button>
            </div>
          )}

          {/* Quiet hint when volume but cal > 0 */}
          {isVolumeUnit && !isFluid && detectedFluidMl !== null && detectedFluidMl >= fluidThresholdMl && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '10px 0', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="icon" style={{ fontSize: 14, color: 'var(--cyan-hi)' }}>water_drop</span>
              {t(lang, 'fluidExcludeHint')}
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
        onDeleteHistory={onDeleteHistory}
      />
    )}
    </>
  )
}
