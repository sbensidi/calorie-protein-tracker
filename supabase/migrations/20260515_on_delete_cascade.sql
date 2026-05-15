-- Add ON DELETE CASCADE to all user-data tables so rows are removed
-- automatically when the auth user is deleted (GDPR / data hygiene).

-- meals
ALTER TABLE meals
  DROP CONSTRAINT IF EXISTS meals_user_id_fkey,
  ADD CONSTRAINT meals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- goals
ALTER TABLE goals
  DROP CONSTRAINT IF EXISTS goals_user_id_fkey,
  ADD CONSTRAINT goals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- food_history
ALTER TABLE food_history
  DROP CONSTRAINT IF EXISTS food_history_user_id_fkey,
  ADD CONSTRAINT food_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- composed_groups
ALTER TABLE composed_groups
  DROP CONSTRAINT IF EXISTS composed_groups_user_id_fkey,
  ADD CONSTRAINT composed_groups_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
