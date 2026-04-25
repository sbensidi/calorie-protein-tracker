# תוכנית עבודה — Calorie & Protein Tracker
> נוצר: 2026-04-22 | בסיס: דוח ביקורת UX/UI + ארכיטקטורה

---

## שלב 0 — ניקוי ובסיס (Prerequisites)
> חייב להתבצע ראשון — מסיר חובות טכניים שמשפיעים על כל השלבים הבאים

### PLAN-0.1 · הסרת קוד מת
- [ ] מחק / שלב `GoalsTab.tsx` (לא mounted בשום מקום)
- [ ] הסר `updateLocal()` מ-`useComposedGroups` (פונקציה שלא נקראת)
- [ ] בדוק ומחק כל import שלא בשימוש בכל קבצי הcomponents
- [ ] ודא שאין קבצים עם 0 importers (`Autocomplete`, `ProgressBar`, `QuantitySelector` אם קיימים)

### PLAN-0.2 · ריכוז קבועי i18n
- [ ] הוצא `HE_MONTHS`, `EN_MONTHS` מ-`HistoryTab.tsx` → ייצא מ-`i18n.ts` בלבד
- [ ] הוצא `DAY_SHORT_HE`, `DAY_SHORT_EN` מ-`SettingsSheet.tsx` → ייצא מ-`i18n.ts` בלבד
- [ ] ייצא util `formatDate()` מ-`i18n.ts` ותוודא שכולם משתמשים בו (לא מממשים לוגיקה שלהם)

### PLAN-0.3 · Type safety improvements
- [ ] חזק `isMeal()` type guard ב-`useMeals` — בדוק את כל השדות: `id`, `name`, `calories`, `protein`, `meal_type`, `time_logged`, `created_at`
- [ ] הגדר `type WeekDayIndex = '0'|'1'|'2'|'3'|'4'|'5'|'6'`
- [ ] צור `toWeekIndex(key: DayKey): WeekDayIndex` ו-`fromWeekIndex(idx: WeekDayIndex): DayKey` ב-`src/lib/utils.ts`
- [ ] עדכן `useGoals`, `SettingsSheet`, `GoalsScreen` להשתמש ב-utils החדשים

---

## שלב 1 — תשתית שגיאות ומשוב (Critical Infrastructure)
> בלי זה, המשתמש לא יודע אם כלום עובד

### PLAN-1.1 · Toast / Notification System
- [ ] צור `src/components/Toast.tsx` — רכיב snackbar קל משקל
  - תמיכה ב: `success | error | info`
  - dismiss אוטומטי לאחר 4 שניות
  - dismiss ידני (X)
  - תמיכה ב-RTL
  - מיקום: bottom-center, מעל FAB (z-index: 60)
- [ ] צור `src/hooks/useToast.ts` — hook פשוט עם `showToast(message, type)`
- [ ] הוסף `<ToastContainer>` ב-`App.tsx`

### PLAN-1.2 · Error States בכל ה-hooks
- [ ] הוסף `error: string | null` state ל: `useMeals`, `useGoals`, `useFoodHistory`, `useComposedGroups`, `useProfile`
- [ ] בכל `catch` — הצב הודעת שגיאה ב-state ו-`showToast(error, 'error')`
- [ ] ב-App.tsx: כתוב handler גנרי שמאזין לשגיאות מהhooks ומציג toast

### PLAN-1.3 · Error Boundaries
- [ ] צור `src/components/ErrorBoundary.tsx` — class component עם `componentDidCatch`
- [ ] עטוף את הnode הראשי ב-`App.tsx` ב-`<ErrorBoundary>`
- [ ] עטוף `BarcodeScanner` ב-boundary מקומי
- [ ] עטוף את רשימת ההיסטוריה ב-boundary מקומי

### PLAN-1.4 · Loading States
- [ ] הוסף `loading: boolean` state ל-`useMeals` (initial fetch + each mutation)
- [ ] צור `src/components/SkeletonCard.tsx` — placeholder animation
- [ ] הצג skeleton ב-`TodayTab` עד שהמנות נטענות
- [ ] הצג spinner/disabled על כפתור "הוסף" בזמן שמירה

---

## שלב 2 — נגישות (Accessibility)
> WCAG 2.1 AA compliance

### PLAN-2.1 · Focus Trap במודאלים
- [ ] צור `src/hooks/useFocusTrap.ts`
  - מזהה כל focusable elements בתוך container
  - Tab / Shift+Tab עוברים בתוך המודאל בלבד
  - מחזיר focus לelements שפתח את המודאל לאחר סגירה
- [ ] החל על: `FoodEntryForm` (bottom sheet), `SettingsSheet`, כל הmodals ב-`TodayTab`

### PLAN-2.2 · Escape לסגירת מודאלים
- [ ] הוסף `useEffect` עם `keydown` listener ל-`Escape` בכל bottom sheet ומודאל
- [ ] קבצים לעדכן: `FoodEntryForm`, `SettingsSheet`, compose modal ב-`TodayTab`, history modal ב-`HistoryTab`

### PLAN-2.3 · aria-labels לכפתורי אייקון
- [ ] עבור על כל `<button>` שמכיל רק span של Material Icons (trash, edit, close, etc.)
- [ ] הוסף `aria-label` עם טקסט תיאורי (בשפת ה-lang הנוכחית)
- [ ] קבצים: `MealCard`, `ComposedMealCard`, `TodayTab`, `HistoryTab`, `SettingsSheet`

### PLAN-2.4 · aria-live לתוכן דינמי
- [ ] הוסף `aria-live="polite"` על אזור תוצאות ה-AI ב-`FoodEntryForm`
- [ ] הוסף `aria-live="polite"` על הודעות ה-toast
- [ ] הוסף `aria-busy="true"` בזמן loading states

### PLAN-2.5 · focus-visible styling
- [ ] הוסף לindex.css:
  ```css
  :focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
    border-radius: 6px;
  }
  button:focus:not(:focus-visible) { outline: none; }
  ```

### PLAN-2.6 · prefers-reduced-motion
- [ ] הוסף ל-`index.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
  ```

### PLAN-2.8 · בדיקת קונטרסט צבע ירוק ב-DonutProgress — light mode
- [ ] בדוק את כל ערכי ה-fill color של הדואנט (`--green`, `--green-hi`, `--green-soft`) מול הרקע בlight mode (`--bg-card: #ffffff`)
- [ ] השתמש בכלי WCAG contrast checker (יחס מינימלי: 3:1 לגרפיקה לפי WCAG 2.1 SC 1.4.11)
  - `--green: #059669` על `#ffffff` → יחס ~3.3:1 (גבולי — לבדוק)
  - `--green-soft: #6ee7b7` על `#ffffff` → יחס ~1.9:1 (נכשל — צפוי)
  - `--green-hi: #047857` על `#ffffff` → יחס ~4.6:1 (עובר)
- [ ] אם `--green-soft` נכשל (50% הירידה ב-DonutProgress) — הגדר ערך light-mode נפרד ל-`--green-soft` שעובר קונטרסט (למשל `#10b981` / emerald-500)
- [ ] אם `--green` גבולי — החלט אם להכהות ל-`#047857` במצב light
- [ ] עדכן את הערכים ב-`[data-theme="light"]` ב-`index.css` בהתאם לממצאים
- [ ] בדוק גם את צבעי ה-glow (rgba) — הם לא צריכים לעמוד בקונטרסט אבל כן צריכים להיות בלתי נראים כמעט ב-light mode

### PLAN-2.7 · Color-only badges
- [ ] ב-`DailySummary` ו-`HistoryTab`: לצד badge ירוק/אדום, הוסף טקסט חלופי (`aria-label` עם "חרגת" / "הגעת")
- [ ] וודא שסטטוס ה-day (success/over/under) כולל icon + text, לא רק צבע

---

## שלב 3 — UX / פידבק למשתמש

### PLAN-3.1 · Undo למחיקה
- [ ] ב-`useMeals.deleteMeal()`: לפני מחיקה מ-Supabase — שמור את המנה בזיכרון
- [ ] הצג toast עם כפתור "בטל" ל-4 שניות
- [ ] אם הכפתור נלחץ — קרא ל-`addMeal()` עם הנתונים המקוריים
- [ ] אם הtimer פג — בצע את המחיקה האמיתית

### PLAN-3.2 · Bulk Actions Feedback
- [ ] לאחר מחיקת מרובים: `showToast(\`נמחקו ${count} פריטים\`, 'success')`
- [ ] לאחר duplicate מרובים: `showToast(\`שוכפלו ${count} פריטים\`, 'success')`
- [ ] לאחר "צור ארוחה": `showToast('הארוחה נוצרה בהצלחה', 'success')`

### PLAN-3.3 · שגיאות AI מפורטות
- [ ] ב-`FoodEntryForm` / `src/lib/ai.ts`: הבחן בין סוגי שגיאות:
  - network error → "אין חיבור לאינטרנט"
  - food not found → "המוצר לא נמצא, נסה לחפש בשם אחר"
  - parse error → "לא הצלחנו לקרוא את תוצאות הניתוח"
  - rate limit → "יותר מדי בקשות, נסה שוב בעוד כמה שניות"

### PLAN-3.4 · Empty States
- [ ] `TodayTab` ללא מנות: אייקון `restaurant` + "עדיין לא הוספת ארוחות היום" + כפתור "הוסף ארוחה"
- [ ] `HistoryTab` רשימה ריקה: אייקון `history` + "אין היסטוריה להציג"
- [ ] `HistoryTab` חיפוש ללא תוצאות: "לא נמצאו תוצאות עבור X"
- [ ] Food history modal ריק: "אין פריטים שנסרקו עדיין"

### PLAN-3.5 · Profile → Goals Flow
- [ ] לאחר לחיצה על "החל הצעה" בפרופיל: הצג CTA בולט "עבור להגדרת יעדים"
- [ ] ניתן גם: אחרי apply, עבור אוטומטית ל-screen 'goals' בתוך ה-SettingsSheet

### PLAN-3.6 · שמירת מצב חיפוש ב-HistoryTab
- [ ] הוסף `searchByView: Record<'list'|'cal', string>` state
- [ ] כאשר עוברים בין views — שמור / שחזר את מחרוזת החיפוש לפי view

---

## שלב 4 — ארכיטקטורה: Context + Prop Drilling

### PLAN-4.1 · AppContext
- [ ] צור `src/context/AppContext.tsx`:
  ```tsx
  interface AppContextValue {
    lang: Lang
    theme: 'dark' | 'light'
    session: Session | null
    toggleLang: () => void
    toggleTheme: () => void
  }
  ```
- [ ] עטוף את `App.tsx` ב-`<AppContext.Provider>`
- [ ] החלף prop drilling של `lang` ו-`theme` בכל ה-tree ב-`useAppContext()`

### PLAN-4.2 · GoalsContext (אופציונלי)
- [ ] אם goal נדרש ב-TodayTab ו-HistoryTab גם כן — שקול context נפרד
- [ ] לחלופין: העבר דרך AppContext

---

## שלב 5 — ארכיטקטורה: רכיבים משותפים

### PLAN-5.1 · FoodHistoryModal — רכיב משותף
- [ ] הוצא את "היסטוריית מזון" modal מ-`FoodEntryForm` ל-`src/components/FoodHistoryModal.tsx`
- [ ] הפרמטרים: `isOpen`, `onClose`, `onSelect(item)`, `lang`
- [ ] השתמש בו גם ב-`HistoryTab` (אם רלוונטי) ובכל מקום שמציג אותו modal

### PLAN-5.2 · ClearableInput — רכיב משותף
- [ ] צור `src/components/ClearableInput.tsx`:
  - `<input>` + כפתור X פנימי
  - Props: `value`, `onChange`, `onClear`, `placeholder`, `type`, `className`
- [ ] החלף 3 מימושים זהים ב-`MealCard`
- [ ] החלף מימושים דומים ב-`SettingsSheet`, `FoodEntryForm`

### PLAN-5.3 · StatusBadge — רכיב משותף
- [ ] צור `src/components/StatusBadge.tsx`
  - מקבל `status: 'success' | 'over' | 'under'`, `value`, `unit`, `lang`
  - מציג icon + טקסט + צבע
- [ ] קבועי הצבעים בקובץ `src/lib/constants.ts`
- [ ] השתמש ב-`DailySummary`, `HistoryTab`

---

## שלב 6 — BarcodeScanner Lifecycle

### PLAN-6.1 · ניהול stream מפורש
- [ ] ב-`BarcodeScanner.tsx`: חשוף `start()` / `stop()` methods דרך `useImperativeHandle`
- [ ] ב-`FoodEntryForm`: קרא ל-`stop()` כשעוברים ל-manual mode
- [ ] קרא ל-`start()` כשחוזרים ל-scan mode
- [ ] ב-`useEffect` cleanup של BarcodeScanner: תמיד `stop()` stream
- [ ] הסר את ה-`setScanKey(k => k + 1)` hack

---

## שלב 7 — State: Profile ל-Supabase

### PLAN-7.1 · Supabase profiles table
- [ ] צור migration ב-Supabase: טבלת `profiles` עם schema:
  ```sql
  id uuid references auth.users primary key,
  sex text, age int, height numeric, weight numeric,
  activity_level int, goal_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
  ```
- [ ] הפעל RLS: משתמש יכול לקרוא/לכתוב רק את הפרופיל שלו

### PLAN-7.2 · עדכן useProfile
- [ ] fetch פרופיל מ-Supabase ב-mount (עם fallback ל-localStorage בזמן loading)
- [ ] save → Supabase (primary) + localStorage (cache)
- [ ] הסר את localStorage כ-source of truth
- [ ] הוסף `loading` ו-`error` states

---

## שלב 8 — ביצועים

### PLAN-8.1 · React.memo ל-DonutProgress
- [ ] עטוף `DonutProgress` ב-`React.memo`
- [ ] בדוק אם `DailySummary` גם צריך memo (תלוי אם re-renders מיותרים)

### PLAN-8.2 · Debounce חיפוש היסטוריה
- [ ] צור `src/hooks/useDebounce.ts` (אם לא קיים)
- [ ] ב-`FoodEntryForm` ו-`HistoryTab`: debounce חיפוש ב-150ms לפני filtering

### PLAN-8.3 · useMemo ל-suggestion filtering
- [ ] ב-`useFoodHistory.getSuggestions()`: עטוף את ה-filter ב-`useMemo([search, history])`
- [ ] שקול להגביל ל-top 20 תוצאות (עם "הצג עוד" אם צריך)

### PLAN-8.4 · Supabase Realtime deduplication
- [ ] בדוק כמה channels פתוחים (useMeals, useGoals, useFoodHistory, useComposedGroups)
- [ ] אחד channels על אותה טבלה לchannel אחד ב-`App.tsx`

---

## סיכום: סדר ביצוע מומלץ

```
שלב 0  →  שלב 1  →  שלב 2  →  שלב 3  →  שלב 5  →  שלב 6  →  שלב 4  →  שלב 7  →  שלב 8
ניקוי    תשתית    נגישות    UX/Feedback  רכיבים   Scanner    Context    Supabase   Perf
~2h      ~4h      ~3h       ~4h          ~3h       ~1h        ~2h        ~3h        ~2h
```

**סה"כ הערכה: ~24 שעות עבודה**

---

---

## שלב 9 — UI Polish Sprint (נוסף 2026-04-25)
> 7 פריטים מביקורת UI. ממוינים לפי מורכבות עולה. צבע-תמה (PLAN-2.8) עדיין ממתין — לא בוטל.

### PLAN-9.1 · FAB order in HistoryTab — לוח שנה → רשימה → סטטיסטיקה ✅ pending
- [ ] שנה סדר כפתורים ב-FAB Pill: כרגע [list, cal, stats] → צריך [cal, list, stats]
- [ ] עדכן `fabViewIdx` ל: `{ cal: 0, list: 1, stats: 2 }`
- [ ] עדכן סדר ה-DOM של הכפתורים

### PLAN-9.2 · Food History Edit — labels + unit handling ✅ pending
- [ ] הוסף label מילולי "חלבון / Protein" מעל שדה החלבון (לא רק צבע ירוק)
- [ ] שנה label מעל שדה המשקל: "גרם / יח׳" → הצג גם "מ״ל" אם הערך הוא נוזל
- [ ] כשה-grams שמורים בDB הם בפועל ml (fluid item) — הצג זאת בבירור

### PLAN-9.3 · MealCard Edit — add weight + unit fields ✅ pending
- [ ] הוסף `editGrams: string` state ל-MealCard
- [ ] הוסף שורה שנייה בעריכה: [משקל input] [כפתור g/pcs toggle]
- [ ] `saveEdit` יכלול גם `grams` ב-updates
- [ ] אם המנה היא fluid — הצג ml במקום grams

### PLAN-9.4 · Statistics view — 5 שיפורים ✅ pending
- [ ] **border כחול על fluid cards**: הסר border מיוחד — תן לכל הכרטיסים border אחיד
- [ ] **כרטיסי avg כלחיצים**: לחיצה על Avg Cal/Prot/Fluid → מחליף את `chartMetric`
- [ ] **קווי הפרדה**: הוסף `<hr>` עדין (1px, var(--border)) בין 3 החלקים: יעד יומי | 7 ימים | 30 ימים
- [ ] **banner תובנה לתוך חלק 7-ימים**: העבר את ה-insight note לתוך ה-section הרלוונטי
- [ ] **banner תובנה ל-30 ימים**: הוסף תובנה מקבילה לסקציית 30 הימים

### PLAN-9.5 · Profile page — ארגון מחדש ✅ pending
- [ ] הוסף קווי הפרדה בין סוגי מידע: נתונים בסיסיים | מדדים מחושבים | העדפות
- [ ] היררכיה ברורה: כותרת section → inputs → ערכים מחושבים
- [ ] TDEE/BMR/BMI — הצג בכרטיס נפרד "המדדים שלך" (לא ערבוב עם inputs)
- [ ] יעד פעילות — ויזואל ברור (slider או radio buttons)

### PLAN-9.6 · Goals page — ארגון + fluid בהתאמות שבועיות ✅ pending
- [ ] הוסף קווי הפרדה בין: המלצות | יעדים ברירת מחדל | התאמות שבועיות
- [ ] "פרוס את כל הימים" — הקפא (comment out) — מורכבות מיותרת לרוב המשתמשים
  - `// FROZEN: UI too cluttered for most users. Re-enable if demand arises.`
- [ ] הוסף שדה נוזלים להתאמות שבועיות (DayPanel) לצד קלוריות וחלבון

### PLAN-9.7 · Today tab — donut card overflow fix ✅ pending
- **Option A (scroll)**: הוסף `overflowX: 'auto'` + `scrollSnapType: 'x mandatory'` על מכל הכרטיסים
  - כל כרטיס: `scrollSnapAlign: 'start'`, `minWidth: 140px`, `flexShrink: 0`
- **Option B (single card)**: ביטול כרטיסי משנה — כרטיס אחד עם 3 metrics בשורה אחת
  - רוחב מלא, פחות עמוק, ללא borders פנימיים
  - Layout: [donut small] metric1 · metric2 · metric3 בשורה אחת
- **יישום**: כתוב את שתי החלופות בקוד, השאר את הנוכחית כ-Option B, הוסף Option A
- **החלטה**: בחר לאחר בדיקה ויזואלית

---

## דגלים: מה לא לשנות
- לוגיקת RTL/i18n — עובדת טוב, לא לגעת
- theme system החדש (data-theme) — תקין
- מבנה ה-hooks (useMeals, useGoals, etc.) — שמור, רק הרחב
- מבנה ה-Supabase (tables, RLS) חוץ מהוספת profiles
