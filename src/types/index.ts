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
  time_logged: string
  created_at: string
  fluid_ml:       number | null
  fluid_excluded: boolean
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
  use_count: number
  last_used: string
}

export interface DayTotals {
  date: string
  calories: number
  protein: number
  meals: Meal[]
}

export interface NutritionResult {
  calories: number
  protein: number
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
}

/** Client-side only — persisted in localStorage, not Supabase */
export interface ComposedGroup {
  id: string
  name: string
  mealIds: string[]  // ordered list of Meal.id values that belong to this group
}
