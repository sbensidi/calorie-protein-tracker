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
    const n = numericAmount

    if (enableScaling && ratios.current != null && ratios.current.calPerUnit > 0) {
      if (oldIsPcs !== newIsPcs) {
        // pcs↔weight boundary: update ratio and recalculate cal/prot for the new unit.
        // Amount never changes — if user had 300 and switches to pcs, they now have 300 servings.
        if (oldIsPcs) {
          const newCal  = ratios.current.calPerUnit  / sg.current
          const newProt = ratios.current.protPerUnit / sg.current
          ratios.current = { calPerUnit: newCal, protPerUnit: newProt, perServing: false }
          if (n > 0) {
            setCalories(Math.round(n * newCal))
            setProtein(Math.round(n * newProt * 10) / 10)
          }
        } else {
          const newCal  = ratios.current.calPerUnit  * sg.current
          const newProt = ratios.current.protPerUnit * sg.current
          ratios.current = { calPerUnit: newCal, protPerUnit: newProt, perServing: true }
          if (n > 0) {
            setCalories(Math.round(n * newCal))
            setProtein(Math.round(n * newProt * 10) / 10)
          }
        }
      } else if (n > 0 && !newIsPcs) {
        // Non-pcs↔non-pcs: keep amount, recalculate nutrition for the new unit.
        // e.g. 1 tbsp → 1 cup: same number, different physical amount → correct new cal/prot.
        const uid = newUnit as UnitId
        const b = toBase(n, uid)
        const base = UNITS[uid].type === 'volume' ? mlToGrams(b, density.current) : b
        setCalories(Math.round(base * ratios.current.calPerUnit))
        setProtein(Math.round(base * ratios.current.protPerUnit * 10) / 10)
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
