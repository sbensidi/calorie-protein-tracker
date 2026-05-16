-- Explicit grants for all public tables.
-- Required from Oct 30 2026 (Supabase policy change); applied proactively.
-- anon is intentionally omitted — the app requires authentication for all access.

grant select, insert, update, delete on public.meals           to authenticated;
grant select, insert, update, delete on public.goals           to authenticated;
grant select, insert, update, delete on public.food_history    to authenticated;
grant select, insert, update, delete on public.composed_groups to authenticated;
grant select, insert, update, delete on public.profiles        to authenticated;
