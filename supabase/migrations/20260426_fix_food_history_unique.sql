-- Run this in your Supabase SQL editor

-- Fix food_history unique constraint to include fluid_ml so that
-- e.g. "מים 240g" and "מים 240ml" are stored as separate entries
ALTER TABLE food_history DROP CONSTRAINT IF EXISTS food_history_user_id_name_grams_key;
ALTER TABLE food_history ADD CONSTRAINT food_history_user_id_name_grams_fluid_ml_key
  UNIQUE (user_id, name, grams, fluid_ml);
