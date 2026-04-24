export type WeightUnit = 'g' | 'oz'
export type VolumeUnit = 'ml' | 'cup' | 'tbsp' | 'tsp' | 'fl_oz'
export type UnitId = WeightUnit | VolumeUnit

export interface UnitDef {
  id: UnitId
  label_he: string
  label_en: string
  abbr_he: string
  abbr_en: string
  /** Multiply user-facing amount by this to get base unit (grams for weight, ml for volume) */
  toBase: number
  type: 'weight' | 'volume'
}

export const UNITS: Record<UnitId, UnitDef> = {
  g:     { id: 'g',     label_he: 'גרם',         label_en: 'Gram',        abbr_he: 'ג׳',    abbr_en: 'g',     toBase: 1,      type: 'weight' },
  oz:    { id: 'oz',    label_he: 'אונקיה',       label_en: 'Ounce',       abbr_he: 'אונ׳',  abbr_en: 'oz',    toBase: 28.3495, type: 'weight' },
  ml:    { id: 'ml',    label_he: 'מ"ל',          label_en: 'Milliliter',  abbr_he: 'מ"ל',   abbr_en: 'ml',    toBase: 1,      type: 'volume' },
  cup:   { id: 'cup',   label_he: 'כוס',          label_en: 'Cup',         abbr_he: 'כוס',   abbr_en: 'cup',   toBase: 240,    type: 'volume' },
  tbsp:  { id: 'tbsp',  label_he: 'כף',           label_en: 'Tablespoon',  abbr_he: 'כף',    abbr_en: 'tbsp',  toBase: 14.787, type: 'volume' },
  tsp:   { id: 'tsp',   label_he: 'כפית',         label_en: 'Teaspoon',    abbr_he: 'כפית',  abbr_en: 'tsp',   toBase: 4.929,  type: 'volume' },
  fl_oz: { id: 'fl_oz', label_he: 'אונ׳ נוזל',   label_en: 'Fl. Oz.',     abbr_he: 'פל.אונ',abbr_en: 'fl oz', toBase: 29.574, type: 'volume' },
}

/** Convert a user-facing amount in the given unit to its base (grams or ml) */
export function toBase(amount: number, unit: UnitId): number {
  return amount * UNITS[unit].toBase
}

/** Convert a base amount (grams or ml) to a user-facing amount in the given unit */
export function fromBase(base: number, unit: UnitId): number {
  return base / UNITS[unit].toBase
}

/** Convert ml to grams using a food's density (g/ml). density=1 for water. */
export function mlToGrams(ml: number, density: number): number {
  return ml * density
}

/** Convert grams to ml using density */
export function gramsToMl(grams: number, density: number): number {
  return grams / density
}

/**
 * Display a gram amount in the user's preferred weight unit.
 * Returns "85g" or "3 oz" depending on unit.
 */
export function formatWeight(grams: number, unit: WeightUnit = 'g'): string {
  if (unit === 'g') return `${Math.round(grams)}g`
  const oz = fromBase(grams, 'oz')
  return `${Math.round(oz * 10) / 10} oz`
}

/**
 * Format an amount with its unit abbreviation.
 * e.g. formatAmount(240, 'ml', 'he') → '240 מ"ל'
 */
export function formatAmount(amount: number, unit: UnitId, lang: 'he' | 'en' = 'en'): string {
  const def = UNITS[unit]
  const abbr = lang === 'he' ? def.abbr_he : def.abbr_en
  const rounded = unit === 'g' || unit === 'ml' ? Math.round(amount) : Math.round(amount * 10) / 10
  return `${rounded} ${abbr}`
}

export const WEIGHT_UNITS: WeightUnit[] = ['g', 'oz']
export const VOLUME_UNITS: VolumeUnit[] = ['ml', 'cup', 'tbsp', 'tsp', 'fl_oz']
export const ALL_ENTRY_UNITS: UnitId[]  = ['g', 'oz', 'ml', 'cup', 'tbsp', 'tsp', 'fl_oz']
