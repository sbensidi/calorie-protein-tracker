# 📋 Calorie & Protein Tracker — Product Specification

> **For Claude Code:**
> - Use the **frontend skill** when building this project: `claude --skill frontend`
> - This ensures best practices for React, Tailwind, component structure, and accessibility are applied throughout.
> - Build this as a standalone web app. Do NOT generate backend-only or CLI code.
> - All visual decisions should follow the mobile-first design reference in Section 7.

---

## 1. Overview

A bilingual (Hebrew/English) daily calorie and protein tracker with AI-assisted food entry, history, smart autocomplete from past meals, and full cross-device sync via user authentication.

**Core principles:**
- **Mobile-first** — designed and tested on 390px width first, then scales up
- Clean & minimal UI (no clutter, no modals, everything inline)
- RTL support (Hebrew) / LTR (English) toggle
- AI calculates nutrition values; user can always override manually
- All data persists and syncs across devices seamlessly via Supabase Realtime

---

## 2. Tech Stack (Recommended)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React + Vite + TypeScript | Fast, modern, Claude Code frontend skill compatible |
| Styling | Tailwind CSS | Utility-first, excellent RTL support via `dir` attribute |
| Backend / DB | Supabase (free tier) | Auth + Postgres + Realtime, free up to 500MB |
| AI (nutrition) | Groq API (free tier) — see Section 6 | Free inference, no GPU, fast |
| Hosting | Vercel (free tier) | One-click deploy, free SSL |

### AI Model Strategy (Free & Self-Hosted)
- **Option A — Groq API (recommended):** Free tier, fast inference, no GPU needed.
  - Model: `llama3-8b-8192` or `mixtral-8x7b`
  - Endpoint: `https://api.groq.com/openai/v1/chat/completions`
  - Prompt: structured JSON extraction of `{calories, protein}` given food name + grams
- **Option B — Ollama (fully local):** Run `ollama run llama3` locally, point app to `http://localhost:11434`
- **Fallback:** USDA FoodData Central API (completely free, no key needed)
  - Endpoint: `https://api.nal.usda.gov/fdc/v1/foods/search?query=...`

---

## 3. Authentication & Sync

- Supabase Auth: email/password or magic link
- All user data stored in Supabase Postgres under `user_id`
- Realtime subscription via Supabase Realtime → instant cross-device sync (no polling)
- On login from new device: full history + goals load automatically

---

## 4. Database Schema (Supabase / Postgres)

### `meals` table
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users not null
date        date not null                          -- e.g. 2026-04-14
meal_type   text not null                          -- breakfast | lunch | dinner | snack
name        text not null
grams       numeric not null
calories    numeric not null
protein     numeric not null
time_logged time not null
created_at  timestamptz default now()
```

### `goals` table
```sql
id               uuid primary key default gen_random_uuid()
user_id          uuid references auth.users not null unique
default_calories numeric not null default 1700
default_protein  numeric not null default 160
weekly_overrides jsonb default '{}'               -- { "0": {calories,protein}, ... } (0=Sun)
updated_at       timestamptz default now()
```

### `food_history` table (for autocomplete)
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references auth.users not null
name        text not null
grams       numeric not null
calories    numeric not null
protein     numeric not null
use_count   integer default 1
last_used   timestamptz default now()
-- unique constraint on (user_id, name, grams)
```

---

## 5. Features

### 5.1 Food Entry (Today tab)
- Input fields: **food name** (text) + **grams** (number) + **meal type** selector
- **Smart autocomplete:** as user types, suggest from `food_history` ordered by `use_count DESC, last_used DESC`
  - Chips appear below the input — tap to pre-fill name + grams + cached nutrition instantly
  - If grams changed after selection, nutrition scales proportionally
- **AI Calculate button:** sends `{food, grams}` to AI → returns `{calories, protein}`
- After calculation: show **editable** fields for calories + protein before confirming (user can correct AI errors)
- **Quantity multiplier:** − / + buttons, step 0.5 (so ×0.5, ×1, ×1.5, ×2 etc.)
  - All values scale in real time as qty changes
  - Name gets "×N" suffix automatically when qty > 1
  - Shows total grams when qty ≠ 1
- On confirm: save to `meals` + upsert to `food_history` (increment `use_count`)

### 5.2 Meal List (Today)
- Grouped by meal type with colored dot header (see color tokens in Section 7)
- Each row: name, grams, time logged, calories (blue), protein (green)
- Row actions (inline, no modal): 📋 Duplicate | ✏️ Edit | 🗑️ Delete
- Edit mode: expands inline — name field on top, calories + protein side by side below

### 5.3 Daily Summary (Today — pinned at bottom)
- Gradient background card (`#eff6ff` → `#f0fdf4`)
- Date shown in localized long format (weekday + day + month)
- Calories: progress bar (blue) + `consumed / goal kcal` + colored `%` badge
- Protein: progress bar (green) + `consumed / goal g` + colored `%` badge
- Goal values come from `goals` table with per-weekday override support

### 5.4 History Tab
- List of all past days, sorted newest first
- Each day card: date, item count, calories vs goal, protein vs goal, two progress bars
- Expandable `<details>` section per day: full meal list with name, grams, calories, protein
- No separate page navigation — everything in one scrollable list

### 5.5 Goals Tab
- **Default goal:** calories (kcal) + protein (g)
- **Weekly overrides:** per-day inputs for Sun–Sat
  - Grayed background = using default value; white background = custom override
  - "Reset to default" text link per day
- Save button at bottom → upserts to `goals` table

### 5.6 Language Toggle
- He / EN pill button in top-right of header
- Flips entire UI: labels, date formats, number formats, `dir` attribute (`rtl` ↔ `ltr`)
- Preference persisted in localStorage

---

## 6. AI Nutrition Prompt

```
System:
You are a nutrition calculator. Return ONLY valid JSON with no markdown, no explanation.
Format: {"calories": number, "protein": number}
Calories in kcal, protein in grams, for the exact amount specified.

User:
Food: "{foodName}", Amount: {grams}g. What are the total calories and protein?
```

**Fallback chain:**
1. Check `food_history` — if exact match (same name + grams ±5%), use cached values (instant, no API call)
2. Call Groq / Ollama AI
3. If AI fails: pre-fill fields with 0, let user enter manually

---

## 7. Mobile-First UI Design

> Claude Code: implement all styles mobile-first. Start from 390px, use Tailwind `sm:` / `md:` breakpoints only for upscaling. Never assume desktop layout as default.

### Viewport & Layout
- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">`
- Outer container: `max-w-[560px] mx-auto px-4 pb-10` — centered on desktop, full-width on mobile
- No horizontal scroll at any viewport width
- All tap targets minimum **44×44px** (WCAG AA)

### Spacing & Typography (mobile baseline)
- Body font: `font-sans` (system-ui / -apple-system)
- Page padding: `16px` horizontal
- Card border-radius: `10–14px`
- Section spacing: `16–20px` vertical gaps
- Input height: minimum `44px` for comfortable mobile tapping
- Font sizes: 14px base, 12px secondary, 11px metadata

### Header
- Full-width, `flex justify-between items-center`, `mb-5`
- App title: `text-[19px] font-extrabold`
- Language toggle pill: `text-[13px]`, `px-3 py-1.5`
- Sync status indicator: small green dot + "מחובר / Connected" text

### Tab Bar
- Full-width pill switcher: `grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1 mb-5`
- Active tab: white background, subtle shadow
- Inactive: transparent, gray text
- Tabs: היום / Today | היסטוריה / History | יעדים / Goals

### Food Entry Form (mobile optimized)
- Two-column grid: food name input (flex-1) + grams input (fixed 80px)
- Second row: meal type `<select>` (flex-1) + Calculate button
- Inputs: `rounded-[9px] border border-gray-200 px-3 py-2.5 text-sm`
- After AI result: confirmation card slides in below with qty selector + editable fields
- Qty selector: large − / + buttons (min 44px), bold number in center

### Meal Cards
- `bg-[#f9f9f9] border border-[#f0f0f0] rounded-[10px] px-3 py-2.5 mb-1.5`
- Row layout: `flex items-center gap-2`
  - Left: name (bold, truncated) + grams · time (small gray)
  - Right: calories in blue + protein in green
  - Far right: action icons (📋 ✏️ 🗑️), min 28px each
- Edit mode: expands vertically inline — no modal, no navigation

### Meal Type Section Headers
- Colored 8px dot + uppercase label (`text-[12px] font-bold text-gray-500 tracking-wide`)
- Colors: Breakfast `#f59e0b` | Lunch `#10b981` | Dinner `#6366f1` | Snack `#f43f5e`

### Daily Summary Card
- `rounded-[14px] p-4 mt-1 border border-blue-100`
- Background: `linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)`
- Date: long localized format, `text-[14px] font-extrabold text-[#1e3a5f]`
- Progress rows: label left, `value / goal unit XX%` right
- Progress bar: 7px height, `#ececec` track, smooth transition

### History Cards
- Same card style as today summary
- Expandable `<details>` for meal breakdown
- Progress bars identical to daily summary

### Goals Form
- Full-width inputs, min 44px height
- Weekly grid: day label + two number inputs side by side
- Custom overrides: white background; default (inherited): `bg-gray-100` with gray text

### Color Tokens
```
Primary blue:    #2563eb  (calories, primary actions)
Success green:   #16a34a  (protein, confirm actions)
Danger red:      #e53e3e  (errors, delete)
Surface:         #f9f9f9  (cards)
Border:          #f0f0f0  (card borders)
Track:           #ececec  (progress bar background)
Text primary:    #111111
Text secondary:  #666666
Text muted:      #aaaaaa
```

### RTL Specifics
- Apply `dir="rtl"` to root `<div>` when language is Hebrew
- Use `ms-` / `me-` (margin-inline) Tailwind utilities instead of `ml-` / `mr-`
- Progress bars fill left→right regardless of direction
- Icons order in meal rows stays consistent (name left, actions right in LTR; reversed in RTL)

---

## 8. Realtime Sync (Supabase)

```typescript
supabase
  .channel('meals-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'meals',
    filter: `user_id=eq.${userId}`
  }, () => { refetchMeals() })
  .subscribe()

supabase
  .channel('goals-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'goals',
    filter: `user_id=eq.${userId}`
  }, () => { refetchGoals() })
  .subscribe()
```

Changes on any device reflect instantly on all other logged-in devices — no polling, no manual refresh.

---

## 9. File Structure

```
src/
  components/
    TodayTab.tsx
    HistoryTab.tsx
    GoalsTab.tsx
    MealCard.tsx
    FoodEntryForm.tsx
    ProgressBar.tsx
    QuantitySelector.tsx
    Autocomplete.tsx
    DailySummary.tsx
  lib/
    supabase.ts          -- Supabase client init
    ai.ts                -- Groq / Ollama / fallback nutrition lookup
    i18n.ts              -- Hebrew / English translation map + date utils
  hooks/
    useMeals.ts          -- CRUD + realtime subscription
    useGoals.ts          -- goals CRUD
    useFoodHistory.ts    -- autocomplete suggestions
  types/
    index.ts             -- Meal, Goal, FoodHistory, DayTotals, Lang interfaces
  App.tsx                -- auth gate + tab router
  main.tsx
```

---

## 10. V1 Scope (MVP)

- [x] Auth — Supabase email + magic link
- [x] Food entry with AI nutrition calculation (Groq)
- [x] Smart autocomplete from personal food history
- [x] Quantity multiplier (×0.5 steps)
- [x] Edit (name + calories + protein) / duplicate / delete meals
- [x] Daily summary with progress bars + % badges
- [x] Weekly goals with per-day overrides
- [x] History view (expandable day cards)
- [x] Bilingual He / EN with RTL layout flip
- [x] Cross-device realtime sync (Supabase Realtime)
- [x] Mobile-first responsive layout (390px baseline)

### Out of scope for V1
- Barcode scanning
- Photo recognition
- Micronutrients (fat, carbs, vitamins)
- Export to CSV
- Meal templates / meal plans

---

## 11. Key UX Flows

### New user
1. Open URL → sign up (email + magic link)
2. Confirm email → redirected to app
3. Goals pre-filled: 1700 kcal / 160g protein
4. Start logging

### Returning user on new device
1. Open URL → sign in
2. All history + goals load immediately
3. Any new entry syncs to all open devices in real time

### Logging a repeated meal
1. Type food name → autocomplete chips appear from history
2. Tap chip → name + grams + nutrition pre-filled instantly
3. Adjust grams if needed → calories + protein scale proportionally
4. Tap Add → saved, autocomplete `use_count` incremented
