export type Lang = 'he' | 'en'

export interface Meal {
  id: string
  user_id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'beverage'
  name: string
  grams: number
  calories: number
  protein: number
  fat:      number | null
  carbs:    number | null
  notes:    string | null
  time_logged: string
  created_at: string
  fluid_ml:       number | null
  fluid_excluded: boolean
  display_unit:   string | null
  display_amount: number | null
}

export interface Goal {
  id: string
  user_id: string
  default_calories: number
  default_protein: number
  weekly_overrides: Record<string, { calories: number; protein: number; fluid_ml?: number }>
  updated_at: string
}

export interface FoodHistory {
  id: string
  user_id: string
  name: string
  grams: number
  calories: number
  protein: number
  fluid_ml: number | null
  use_count: number
  last_used: string
}

export interface DayTotals {
  date: string
  calories: number
  protein: number
  meals: Meal[]
}

export interface DayStats {
  totalCalories: number
  totalProtein:  number
  calOk:         boolean
  protOk:        boolean
}

export interface NutritionResult {
  calories: number
  protein: number
  fat?:   number
  carbs?: number
}

export interface FoodLibraryItem {
  id: string
  name_he: string
  name_en: string
  category: string
  calories_per_100g: number
  protein_per_100g: number
  fat_per_100g: number | null
  carbs_per_100g: number | null
  fiber_per_100g: number | null
  serving_size: number | null
  serving_unit: string
  density: number | null
  countable: boolean
}

export interface UserFoodItem {
  id:                string
  user_id:           string
  name:              string
  calories_per_100g: number
  protein_per_100g:  number
  fat_per_100g:      number | null
  carbs_per_100g:    number | null
  default_unit:      string
  default_amount:    number
  created_at:        string
}

export interface WeightLog {
  id:         string
  user_id:    string
  date:       string   // YYYY-MM-DD
  weight_kg:  number
  created_at: string
}

/** Client-side only — a meal queued for upload while offline */
export interface PendingMeal extends Omit<Meal, 'id' | 'user_id' | 'created_at'> {
  pendingId: string    // local UUID, replaced by server id after drain
  queuedAt:  number   // Date.now() timestamp
}

export type PendingOpType = 'update' | 'delete'

/** Client-side only — an edit/delete queued while offline */
export interface PendingOperation {
  type:     PendingOpType
  mealId:   string
  updates?: Partial<Meal>  // only present for 'update' ops
  queuedAt: number
}

/** One ingredient row in a saved recipe snapshot */
export interface RecipeIngredient {
  name:     string
  grams:    number
  calories: number
  protein:  number
}

export interface ComposedGroup {
  id: string
  name: string
  mealIds: string[]              // today's meal IDs (ingredients or single portion meal)
  batchWeightG?: number | null   // total cooked weight (g); set → scalable recipe
  totalCalories?: number | null  // cached at save time (full batch)
  totalProtein?: number | null   // cached at save time (full batch)
  ingredients?: RecipeIngredient[] | null  // permanent snapshot — always visible
}
