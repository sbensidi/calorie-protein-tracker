-- Add ingredients snapshot to composed_groups.
-- Stores a JSON array of { name, grams, calories, protein } so the recipe
-- composition is always visible even after the original meal rows are deleted.
ALTER TABLE composed_groups ADD COLUMN IF NOT EXISTS ingredients JSONB;
