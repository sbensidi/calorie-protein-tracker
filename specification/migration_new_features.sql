-- ── Migration: new features (feat/new-features) ──────────────────────────────
-- Run this in the Supabase SQL editor BEFORE deploying the new app version.

-- 1. Add fat, carbs, notes columns to meals
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS fat   REAL,
  ADD COLUMN IF NOT EXISTS carbs REAL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Add target_weight_kg to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS target_weight_kg REAL;

-- 3. Create weight_log table
CREATE TABLE IF NOT EXISTS weight_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  weight_kg   REAL        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- Row Level Security on weight_log
ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own weight_log"
  ON weight_log
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS weight_log_user_date ON weight_log (user_id, date DESC);
