import { useState, useRef } from 'react'
import { UNITS, toBase, mlToGrams } from '../lib/units'
import type { UnitId } from '../lib/units'

export type EntryUnit = UnitId | 'pcs'

export interface NutritionRatios {
  calPerUnit:  number
  protPerUnit: number
  perServing:  boolean
}

interface Params {
  initialAmount:   string
  initialUnit:     EntryUnit
  initialCalories: number | ''
  initialProtein:  number | ''
  initialSg:       number
  initialDensity?: number
  enableScaling?:  boolean
}

/**
 * Shared state + handlers for the amount / unit / calories / protein
 * fields used in both FoodEntryForm (add) and MealCard (edit).
 *
 * sg and density are exposed as refs so callers can mutate them
 * whenever a library item is selected without triggering a re-render.
 */
export function useNutritionAmountEditor({
  initialAmount, initialUnit, initialCalories, initialProtein,
  initialSg, initialDensity = 1, enableScaling = true,
}: Params) {
  const [amountStr, setAmountStr] = useState(initialAmount)
  const [unit,      setUnit]      = useState<EntryUnit>(initialUnit)
  const [calories,  setCalories]  = useState<number | ''>(initialCalories)
  const [protein,   setProtein]   = useState<number | ''>(initialProtein)
  const ratios  = useRef<NutritionRatios | null>(null)
  const sg      = useRef(initialSg)
  const density = useRef(initialDensity)

  const numericAmount = parseFloat(amountStr) || 0

  function handleUnitChange(newUnit: EntryUnit) {
    const oldUnit  = unit
    const oldIsPcs = oldUnit === 'pcs'
    const newIsPcs = newUnit === 'pcs'
    let n = numericAmount

    if (enableScaling && ratios.current != null && ratios.current.calPerUnit > 0) {
      if (oldIsPcs !== newIsPcs) {
        if (oldIsPcs) {
          // pcs → weight: keep amount as typed, convert ratio cal/serving → cal/gram
          ratios.current = {
            calPerUnit:  ratios.current.calPerUnit  / sg.current,
            protPerUnit: ratios.current.protPerUnit / sg.current,
            perServing:  false,
          }
        } else {
          // weight → pcs: convert amount proportionally, update ratio cal/gram → cal/serving
          ratios.current = {
            calPerUnit:  ratios.current.calPerUnit  * sg.current,
            protPerUnit: ratios.current.protPerUnit * sg.current,
            perServing:  true,
          }
          n = Math.max(0.1, Math.round(n / sg.current * 10) / 10)
          setAmountStr(String(n))
        }
      }

      if (n > 0) {
        const uid = newUnit as UnitId
        const base = (() => {
          if (ratios.current!.perServing) return n
          if (newIsPcs) return n * sg.current
          const b = toBase(n, uid)
          return UNITS[uid].type === 'volume' ? mlToGrams(b, density.current) : b
        })()
        setCalories(Math.round(base * ratios.current!.calPerUnit))
        setProtein(Math.round(base * ratios.current!.protPerUnit * 10) / 10)
      }
    }

    setUnit(newUnit)
  }

  function handleAmountChange(val: string) {
    setAmountStr(val)
    if (!enableScaling || ratios.current == null || ratios.current.calPerUnit <= 0) return
    const n = parseFloat(val) || 0
    if (n <= 0) return
    const uid = unit as UnitId
    const base = (() => {
      if (ratios.current!.perServing) return n
      if (unit === 'pcs') return n * sg.current
      const b = toBase(n, uid)
      return UNITS[uid].type === 'volume' ? mlToGrams(b, density.current) : b
    })()
    setCalories(Math.round(base * ratios.current!.calPerUnit))
    setProtein(Math.round(base * ratios.current!.protPerUnit * 10) / 10)
  }

  return {
    amountStr, setAmountStr,
    unit,      setUnit,
    calories,  setCalories,
    protein,   setProtein,
    numericAmount,
    ratios,
    sg,
    density,
    handleUnitChange,
    handleAmountChange,
  }
}
