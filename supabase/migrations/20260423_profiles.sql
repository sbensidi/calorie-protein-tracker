-- Run this in your Supabase SQL editor:
-- https://supabase.com/dashboard/project/aduwnjejyiviegrrmbzi/sql

create table if not exists profiles (
  id             uuid references auth.users on delete cascade primary key,
  sex            text    check (sex in ('m', 'f')) default 'm',
  age            int     check (age > 0 and age < 130) default 30,
  height         numeric check (height > 0) default 170,
  weight         numeric check (weight > 0) default 70,
  activity_level int     check (activity_level between 0 and 4) default 1,
  goal_type      text    check (goal_type in ('lose', 'maintain', 'gain')) default 'maintain',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can upsert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);
