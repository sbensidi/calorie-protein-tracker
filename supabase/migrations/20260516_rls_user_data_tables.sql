-- RLS for core user-data tables.
-- These policies were originally applied via the Supabase dashboard;
-- this migration makes them reproducible for any new deployment.
-- All operations (SELECT/INSERT/UPDATE/DELETE) are restricted to the row's owner.

-- meals
alter table meals enable row level security;

drop policy if exists "Users can manage their own meals" on meals;
create policy "Users can manage their own meals"
  on meals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- goals
alter table goals enable row level security;

drop policy if exists "Users can manage their own goals" on goals;
create policy "Users can manage their own goals"
  on goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- food_history
alter table food_history enable row level security;

drop policy if exists "Users can manage their own food history" on food_history;
create policy "Users can manage their own food history"
  on food_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- composed_groups
alter table composed_groups enable row level security;

drop policy if exists "Users can manage their own composed groups" on composed_groups;
create policy "Users can manage their own composed groups"
  on composed_groups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
