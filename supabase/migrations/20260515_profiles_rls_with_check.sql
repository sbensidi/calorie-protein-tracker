-- Add WITH CHECK to profiles UPDATE policy to prevent id column manipulation
-- Without WITH CHECK, the USING clause only filters readable rows, not written values.

drop policy if exists "Users can update own profile" on profiles;

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
