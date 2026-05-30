-- Add fat and carbs to food_history (autocomplete cache).
-- Nullable — existing rows stay untouched; new entries populate these going forward.
ALTER TABLE food_history
  ADD COLUMN IF NOT EXISTS fat   numeric,
  ADD COLUMN IF NOT EXISTS carbs numeric;
