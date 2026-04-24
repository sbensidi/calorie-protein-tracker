-- Run this in your Supabase SQL editor:
-- https://supabase.com/dashboard/project/aduwnjejyiviegrrmbzi/sql

-- meals: fluid tracking columns
alter table meals
  add column if not exists fluid_ml      numeric  default null,
  add column if not exists fluid_excluded boolean  default false;

-- profiles: fluid goal settings
alter table profiles
  add column if not exists fluid_goal_ml        int     default 2500,
  add column if not exists fluid_threshold_ml   int     default 100,
  add column if not exists fluid_zero_cal_only  boolean default true;
