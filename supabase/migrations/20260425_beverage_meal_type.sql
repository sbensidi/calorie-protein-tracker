-- Run this in your Supabase SQL editor:
-- https://supabase.com/dashboard/project/aduwnjejyiviegrrmbzi/sql

-- Add 'beverage' to the allowed meal_type values
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_meal_type_check;
ALTER TABLE meals ADD CONSTRAINT meals_meal_type_check
  CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'beverage'));
