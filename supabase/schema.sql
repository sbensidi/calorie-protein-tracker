-- Calorie & Protein Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor to set up the database.

-- ─────────────────────────────────────────────────────────────
-- meals table
-- ─────────────────────────────────────────────────────────────
create table if not exists meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  date        date not null,
  meal_type   text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name        text not null,
  grams       numeric not null,
  calories    numeric not null,
  protein     numeric not null,
  time_logged time not null,
  created_at  timestamptz default now()
);

-- Row-level security
alter table meals enable row level security;

create policy "Users can manage their own meals"
  on meals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast user+date lookups
create index if not exists meals_user_date_idx on meals (user_id, date desc);

-- ─────────────────────────────────────────────────────────────
-- goals table
-- ─────────────────────────────────────────────────────────────
create table if not exists goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null unique,
  default_calories numeric not null default 1700,
  default_protein  numeric not null default 160,
  weekly_overrides jsonb default '{}',
  updated_at       timestamptz default now()
);

alter table goals enable row level security;

create policy "Users can manage their own goals"
  on goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- food_history table (autocomplete cache)
-- ─────────────────────────────────────────────────────────────
create table if not exists food_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  grams       numeric not null,
  calories    numeric not null,
  protein     numeric not null,
  use_count   integer default 1,
  last_used   timestamptz default now(),
  unique (user_id, name, grams)
);

alter table food_history enable row level security;

create policy "Users can manage their own food history"
  on food_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists food_history_user_idx on food_history (user_id, use_count desc, last_used desc);

-- ─────────────────────────────────────────────────────────────
-- Enable Realtime for all tables
-- ─────────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → Database → Replication → enable for meals, goals, food_history
-- Or via SQL:
alter publication supabase_realtime add table meals;
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table food_history;
