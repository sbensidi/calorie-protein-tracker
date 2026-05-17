# הנחיות פיתוח — Calorie & Protein Tracker

---

## 0. צ׳קליסט — לפני כל כתיבת קוד ולפני כל commit

### לפני שמתחילים לכתוב פיצ'ר חדש

- [ ] האם יש לוגיקה חישובית? → פונקציה טהורה ב-`src/lib/calculations.ts`, לא inline ב-useMemo
- [ ] האם יש string בממשק? → מפתח ב-`i18n.ts` (he + en ביחד), לא ternary inline
- [ ] האם יש צבע? → token מ-`index.css`, לא rgba/hex ישיר
- [ ] האם יש `<input>` או `<select>`? → `fontSize: 16` מינימום (iOS auto-zoom)
- [ ] האם יש hook חדש? → עוקב אחרי pattern הקיים (useState, fetch, realtime, upsert, delete)
- [ ] האם יש קומפוננטה חדשה עם state? → function מוכרזת ב-module level, לא IIFE בתוך JSX

### לפני כל commit

- [ ] `npx tsc -b` — נקי (לא `--noEmit`)
- [ ] `npx vitest run` — כל הטסטים עוברים
- [ ] אין imports שאינם בשימוש
- [ ] אין ternary עם עברית/אנגלית inline — הכל דרך `t(lang, key)`
- [ ] אין rgba() ישיר בקומפוננט — הכל דרך CSS tokens
- [ ] לוגיקה חישובית חדשה — יש לה טסטים ב-`src/test/`
- [ ] כל i18n key קיים גם בעברית גם באנגלית

---

## 1. TypeScript — כללים קריטיים לבילד

### 1.1 תמיד בדוק `tsc -b` לפני push — לא `tsc --noEmit`
הבילד של Vercel מריץ `tsc -b` (project references). הוא מחמיר יותר מ-`tsc --noEmit` ובודק גם קבצי טסט.
```bash
npx tsc -b   # מה שVercel מריץ — זה הtest האמיתי
```

### 1.2 `unknown` type דורש type narrowing — לא גישה ישירה לשדות
```ts
// ❌ שובר בילד
let data: unknown = await res.json()
if (typeof data.calories === 'number') // TS18046

// ✅ נכון
let data: Record<string, unknown> = await res.json()
if (typeof data.calories === 'number') // עובד
```

### 1.3 הסר imports שאינם בשימוש — Vercel מחמיר על TS6133
```ts
// ❌ שובר בילד
import { calculateNutrition, AiNetworkError, AiRateLimitError } from '../lib/ai'

// ✅ רק מה שבאמת משמש
import { calculateNutrition, AiRateLimitError, AiParseError } from '../lib/ai'
```

### 1.4 הפרד בין Vitest config לבין Vite config
- `vite.config.ts` — ללא שום אזכור ל-Vitest
- `vitest.config.ts` — עם `/// <reference types="vitest" />` ו-`import { defineConfig } from 'vitest/config'`

---

## 2. i18n — כללי חובה

### 2.1 כל string בממשק עובר דרך `t(lang, key)` — ללא יוצא מן הכלל

```ts
// ❌ ternary inline — גם אם נראה נוח
showToast(lang === 'he' ? 'הפרופיל נשמר' : 'Profile saved', 'success')
const label = lang === 'he' ? 'ירידה של ~' : '~'

// ✅ תמיד דרך t()
showToast(t(lang, 'profileSaved'), 'success')
const label = t(lang, 'weightLossOf')
```

**לסטרינגים דינמיים** (עם ערכים מוטמעים): חלק את הstring לחלקים סטטיים בi18n + הרכב בקומפוננט:
```ts
// ✅ הרכבה נכונה של string דינמי
`${t(lang, 'weightLossOf')}${weightGrams}${t(lang, 'gramsSuffix')}`
// → עברית: "ירידה של ~150גרם" | אנגלית: "~150g"
```

### 2.2 כל key חייב להופיע בשתי השפות — תמיד בו-זמנית
```ts
// ❌ key רק בעברית → test symmetry נופל
he: { newKey: 'ערך' }
en: { /* חסר! */ }

// ✅ תמיד שתיהן יחד
he: { newKey: 'ערך' }
en: { newKey: 'value' }
```

### 2.3 אסור להשתמש ב-apostrophe בתוך single quotes
```ts
// ❌ Parse error
it('calls insert with today's date', ...)

// ✅
it("calls insert with today's date", ...)
```

---

## 3. Design System — CSS Tokens

### 3.1 אין rgba() ישיר בקומפוננט — תמיד token מ-index.css

```ts
// ❌ hardcoded — לא משתנה עם theme
border: 'rgba(59,130,246,0.35)'
color: '#fff'
background: 'rgba(0,0,0,0.5)'

// ✅ tokens — theme-aware
border: 'var(--blue-border)'
color: 'var(--on-color)'       // לבן על רקע צבעוני (כפתורים, badges)
background: 'var(--backdrop)'
```

אם token מתאים לא קיים — מוסיפים ל-`index.css` ולא כותבים inline.

### 3.2 Scale צבעים קיים — השתמש לפי עוצמה
| token | שימוש |
|---|---|
| `--*-fill` | רקע כרטיס עדין מאוד |
| `--*-tint` | רקע chip/badge |
| `--*-select` | רקע selected state |
| `--*-glow` | box-shadow glow |
| `--*-border` | border רגיל |
| `--*-border-hi` | border active/focus |
| `--*-hi` | טקסט/אייקון צבעוני |

קיים ל: `--blue-*`, `--green-*`, `--red-*`, `--amber-*`, `--cyan-*`, `--indigo-*`

### 3.3 Z-index — scale קבוע
```
--z-sticky: 10   --z-fab: 40   --z-dropdown: 50
--z-backdrop: 99  --z-sheet: 100  --z-toast: 300
```
בinline styles של React — השתמש במספר (`zIndex: 100`) עם comment.

### 3.4 היררכיית ניווט — שלוש רמות
| רמה | שימוש | עיצוב |
|---|---|---|
| ראשי (Tab bar) | היום / היסטוריה | `var(--blue)` מלא, טקסט לבן |
| משני (Toggle) | שבוע / חודש | blue tint pill, עדין |
| שלישוני (In-card) | cal/prot/fluid בגרף | צבע ראשי — שולט על הגרף |

---

## 4. לוגיקה וחישובים — כללי ארכיטקטורה

### 4.1 לוגיקה חישובית = פונקציה טהורה ב-`src/lib/calculations.ts`

```ts
// ❌ לוגיקה inline בתוך useMemo — לא ניתנת לבדיקה, לא ניתנת לשיתוף
const goalStreak = useMemo(() => {
  const byDate = new Map<string, number>()
  meals.forEach(m => { ... })
  // 15 שורות קוד...
}, [meals, getGoalForDate])

// ✅ פונקציה טהורה + useMemo קצר
const goalStreak = useMemo(() => calcGoalStreak(meals, getGoalForDate), [meals, getGoalForDate])
```

כל פונקציה ב-`calculations.ts` חייבת טסט ב-`src/test/calculations.test.ts`.

### 4.2 אל תשכפל לוגיקה — בדוק ב-`calculations.ts` לפני שכותבים מחדש

### 4.3 בדיקת סימן בחישובי גירעון/עודף — שים לב לכיוון

```ts
// dailyDiff = tdee - goal
// positive dailyDiff = גירעון (אוכל פחות מ-TDEE) → ירידה במשקל
// negative dailyDiff = עודף (אוכל יותר מ-TDEE) → עלייה במשקל
// kgDiff = target - current
// negative kgDiff = רוצה לרדת | positive kgDiff = רוצה לעלות

// ✅ תנאי תקינות: כיוונים הפוכים = תקין (גירעון + ירידה, עודף + עלייה)
if (Math.sign(dailyDiff) === Math.sign(kgDiff)) return null // כיוון שגוי
```

---

## 5. קומפוננטות — כללי מבנה

### 5.1 קומפוננטה עם hooks = function מוכרזת ב-module level

```tsx
// ❌ IIFE עם hooks בתוך JSX — שובר את חוקי React Hooks
{(() => {
  const [val, setVal] = React.useState(false)
  return <div>...</div>
})()}

// ✅ קומפוננטה רגילה
function MySection({ lang }: { lang: Lang }) {
  const [val, setVal] = useState(false)
  return <div>...</div>
}
// ואז בJSX: <MySection lang={lang} />
```

### 5.2 State שניתן לגזור — אל תשמור כstate

```ts
// ❌ state כפול
const [totalCal, setTotalCal] = useState(0)
useEffect(() => setTotalCal(meals.reduce(...)), [meals])

// ✅ נגזר ישירות
const totalCal = meals.reduce((s, m) => s + m.calories, 0)
```

---

## 6. אבטחה

### 6.1 CSV export — עטוף כל שדה string במרכאות

```ts
// ❌ שדות string ללא עטיפה — פגיע ל-formula injection
m.date, m.meal_type, m.time_logged

// ✅ כל string עטוף
`"${m.date}"`, `"${m.meal_type}"`, `"${m.time_logged}"`
// שדות חופשיים (name, notes) — גם escape של מרכאות פנימיות:
`"${(m.name ?? '').replace(/"/g, '""')}"`
```

### 6.2 שאילתות Supabase — תמיד דרך query builder (לא raw SQL עם string interpolation)

---

## 7. בדיקות (Vitest)

### 7.1 כל לוגיקה חישובית חדשה — טסטים לפני deploy

מינימום לכל פונקציה חישובית:
- מקרה בסיסי תקין
- קלט ריק / אפס
- ערך גבולי (boundary)
- מקרה שגוי שצריך להחזיר null/0

### 7.2 הגדר `include` ב-vitest.config.ts
```ts
test: { include: ['src/test/**/*.test.{ts,tsx}'] }
```

### 7.3 localStorage mock ב-setup.ts — חובה לסביבת jsdom
(ראה setup.ts הקיים — אין לשנות)

### 7.4 Supabase mock — chain thenable
(ראה pattern הקיים ב-`src/test/hooks/`)

### 7.5 factory functions לכל type — כולל כל השדות
```ts
function fakeMeal(overrides: Partial<Meal> = {}): Meal {
  return { id: 'meal-1', user_id: 'u-1', date: '2026-05-10',
    meal_type: 'lunch', name: 'Chicken', grams: 100,
    calories: 300, protein: 30, fat: null, carbs: null, notes: null,
    time_logged: '12:00:00', created_at: new Date().toISOString(),
    fluid_ml: null, fluid_excluded: false, ...overrides }
}
```

---

## 8. Error Handling

### 8.1 Typed errors — לא swallowing גנרי
```ts
// ✅ pattern
export class AiNetworkError   extends Error {}
export class AiRateLimitError extends Error {}
export class AiParseError     extends Error {}

// בcomponent — map לstate
setAiError(
  err instanceof AiRateLimitError ? 'rateLimit'
  : err instanceof AiParseError  ? 'parseError'
  : 'network'
)
```

### 8.2 HTTP — בדוק status לפני json()
```ts
let data: Record<string, unknown>
try { data = await res.json() } catch { throw new AiParseError() }
```

---

## 9. ארכיטקטורה — מה לשמור

- **hooks**: `useMeals`, `useProfile`, `useGoals`, `useFoodHistory`, `useComposedGroups`, `useWeightLog` — לא לשנות את המבנה, רק להרחיב. hook חדש = אותו pattern.
- **i18n**: `t(lang, key)` + `dir(lang)` — לא ternaries חדשים
- **Supabase Realtime**: כל hook מנהל channel משלו — לא לאחד
- **Error Boundaries**: כל tab עטוף ב-boundary עם `label` + `lang` props
- **React.lazy**: HistoryTab ו-SettingsSheet בלבד
- **AppContext**: `lang`, `theme`, `styleMode` — להעביר כאן, לא כprops
- **calculations.ts**: כל לוגיקה חישובית טהורה כאן

---

## 10. Mobile / iOS

### 10.1 כל `<input>` ו-`<select>` — `fontSize: 16` מינימום
iOS Safari מזום אוטומטית כשfont-size < 16px. מחלקת `.inp` כבר מגדירה זאת — אין לדרוס.

---

## 11. Vercel Deploy

```bash
npx tsc -b && npx vitest run && npx vercel --prod
```

- Vercel **לא** מחובר ל-GitHub — deploy ידני חובה
- `git push` לבד לא מעדכן production
