# Claude Code — Initial Prompt

---

Use the **frontend skill** throughout this entire project.

Build a complete, production-ready web app based on the full specification at:
`/Users/sbs/Projects/Calorie & Protein Tracker/specification/SPEC.md`

Read the spec file fully before writing any code.

---

## Project

A bilingual (Hebrew/English) mobile-first calorie and protein tracker.
Users log meals by typing a food name + grams. AI calculates nutrition values automatically.
All data syncs in real time across devices via Supabase.

---

## Stack

- React + Vite + TypeScript
- Tailwind CSS (mobile-first, RTL support)
- Supabase — auth, Postgres DB, Realtime sync
- Groq API — free AI inference for nutrition calculation (model: llama3-8b-8192)
- Vercel — deployment

---

## Instructions

1. Scaffold the project with Vite: `npm create vite@latest . -- --template react-ts`
2. Install dependencies: `tailwindcss`, `@supabase/supabase-js`, `react-router-dom`
3. Set up Tailwind with RTL support
4. Create the full file structure as described in Section 9 of the spec
5. Implement all features from Section 5 and Section 10 (V1 scope)
6. Follow the mobile-first design system in Section 7 exactly — colors, spacing, border-radius, font sizes, tap target sizes
7. Implement Supabase Realtime sync as described in Section 8
8. Implement the AI nutrition prompt from Section 6 using Groq API, with the fallback chain
9. Use environment variables for all secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GROQ_API_KEY`
10. Generate the Supabase schema SQL from Section 4 into a file: `supabase/schema.sql`

---

## Key behaviors to get right

- RTL layout flips completely when Hebrew is selected (`dir="rtl"` on root, `ms-`/`me-` margins)
- Autocomplete suggestions appear from personal food history as the user types, ordered by use frequency
- After AI calculates nutrition — show editable fields before confirming (user can correct)
- Quantity multiplier scales calories + protein in real time, appends ×N to meal name
- Edit mode is inline — no modals, no separate pages
- Daily summary card is always visible at the bottom of the Today tab
- Progress bars cap visually at 100% but show the real percentage in the badge

---

## Definition of done

The app runs on `localhost:5173`, passes mobile viewport at 390px with no horizontal scroll,
supports Hebrew RTL and English LTR, logs meals with AI nutrition, syncs across devices in real time.
