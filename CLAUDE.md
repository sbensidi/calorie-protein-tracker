# הנחיות פיתוח — Calorie & Protein Tracker

> נוצר על בסיס תיקונים שנדרשו בפועל. כל סעיף מייצג באג שנפל ותוקן.

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
// ❌ שובר בילד אם AiNetworkError לא משמש בקוד
import { calculateNutrition, AiNetworkError, AiRateLimitError } from '../lib/ai'

// ✅ רק מה שבאמת משמש
import { calculateNutrition, AiRateLimitError, AiParseError } from '../lib/ai'
```

### 1.4 הפרד בין Vitest config לבין Vite config
Vite לא מכיר את `test` property. אם שמים את הכל בvite.config.ts — Vercel נופל.
- `vite.config.ts` — ללא שום אזכור ל-Vitest
- `vitest.config.ts` — עם `/// <reference types="vitest" />` ו-`import { defineConfig } from 'vitest/config'`

---

## 2. בדיקות (Vitest)

### 2.1 הגדר `include` ב-vitest.config.ts — אחרת Vitest מרים קבצי Playwright
```ts
test: {
  include: ['src/test/**/*.test.{ts,tsx}'],  // חובה! בלי זה e2e/*.spec.ts נכלל
}
```

### 2.2 localStorage.clear() לא עובד בסביבת jsdom — הוסף mock ב-setup.ts
```ts
// src/test/setup.ts — חובה להוסיף
const _store: Record<string, string> = {}
const localStorageMock: Storage = {
  getItem:    key       => _store[key] ?? null,
  setItem:    (key, v)  => { _store[key] = String(v) },
  removeItem: key       => { delete _store[key] },
  clear:      ()        => { Object.keys(_store).forEach(k => delete _store[k]) },
  key:        i         => Object.keys(_store)[i] ?? null,
  get length()          { return Object.keys(_store).length },
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })
```

### 2.3 Supabase mock — pattern לbuildablechain
כל שאילתת Supabase היא chain שניתן לawait. המock צריך להיות thenable:
```ts
function makeChain(res: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: res.data ?? null, error: res.error ?? null }
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(resolved)),
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolved).then(onFulfilled, onRejected)
    },
  }
  return chain
}
```
השתמש ב-`vi.resetAllMocks()` בין בדיקות (לא `vi.clearAllMocks`) — reset מנקה גם implementations.

### 2.4 factory functions לסוגי נתונים — כולל כל השדות הנדרשים
```ts
// ❌ Meal factory חסר שדות → TS error בבילד
function fakeMeal(): Meal { return { id: '1', name: 'Chicken', calories: 165 } }

// ✅ כל שדה של הtype חייב להיות נוכח
function fakeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1', user_id: 'user-1', date: '2026-04-26',
    name: 'Chicken', calories: 165, protein: 31, grams: 100,
    meal_type: 'lunch', time_logged: '12:00:00',
    created_at: new Date().toISOString(),
    fluid_ml: null, fluid_excluded: false,
    ...overrides,
  }
}
```

### 2.5 כשיש מספר elements עם אותו טקסט — השתמש ב-getAllBy
```ts
// ❌ נופל כשגם calories וגם protein מציגים "0"
expect(screen.getByText('0')).toBeInTheDocument()

// ✅
expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2)
```

---

## 3. i18n — כללי חובה

### 3.1 כל key חייב להופיע בשתי השפות (he + en) — תמיד בו-זמנית
```ts
// ❌ הוספת key רק בעברית → test symmetry נופל
he: { aiErrorRateLimit: 'יותר מדי בקשות' }
en: { /* חסר! */ }

// ✅ תמיד שתיהן יחד
he: { aiErrorRateLimit: 'יותר מדי בקשות — נסה שוב בעוד כמה שניות' }
en: { aiErrorRateLimit: 'Too many requests — try again in a few seconds' }
```

### 3.2 אסור להשתמש ב-apostrophe (') בתוך string עם single quotes
```ts
// ❌ Parse error! ה-' של "today's" סוגר את ה-string
it('duplicateMeal calls insert with today's date', ...)

// ✅ שנה ל-double quotes כשיש apostrophe
it("duplicateMeal calls insert with today's date", ...)
```

---

## 4. Error Handling — פטרן נכון

### 4.1 typed errors — לא swallowing גנרי
```ts
// ❌ כל שגיאה הופכת ל-'network' — מאבדים מידע
} catch {
  setAiError('network')
}

// ✅ typed error classes שמתפשטות מעלה
export class AiNetworkError   extends Error {}
export class AiRateLimitError extends Error {}
export class AiParseError     extends Error {}

// בcalculator — רק typed errors מתפשטות, שאר נבלעות
} catch (err) {
  if (err instanceof AiNetworkError || err instanceof AiRateLimitError || err instanceof AiParseError) throw err
}

// בcomponent — map לstate
} catch (err) {
  setAiError(err instanceof AiRateLimitError ? 'rateLimit' : err instanceof AiParseError ? 'parseError' : 'network')
}
```

### 4.2 HTTP status codes — בדוק לפני json()
```ts
// ❌ json() יכול לזרוק אם body לא valid JSON
const data = await res.json()

// ✅
let data: Record<string, unknown>
try { data = await res.json() } catch { throw new AiParseError() }
```

---

## 5. Playwright E2E

### 5.1 strict mode — locator חד-משמעי
```ts
// ❌ נופל אם יש 2 כפתורים עם שם דומה
await page.getByRole('button', { name: /Sign In/i }).click()

// ✅ השתמש ב-first() או exact: true
await page.getByRole('button', { name: 'Sign In' }).first().click()
await page.getByRole('button', { name: 'Sign In', exact: true }).click()
// או
await page.locator('button[aria-label="הוסף ארוחה"]').click()
```

### 5.2 mock Supabase session — pattern לbehavior אמיתי בלי credentials
```ts
// 1. Inject session לפני טעינת דף (addInitScript רץ לפני scripts)
await page.addInitScript(({ key, session }) => {
  localStorage.setItem(key, JSON.stringify(session))
}, { key: 'sb-{PROJECT_REF}-auth-token', session: MOCK_SESSION })

// 2. Mock REST API
await page.route('https://{PROJECT}.supabase.co/rest/v1/**', async route => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
})

// 3. Mock auth token refresh
await page.route('https://{PROJECT}.supabase.co/auth/v1/**', async route => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) })
})
```

### 5.3 MOCK_SESSION.expires_at — חייב להיות בעתיד
```ts
const MOCK_SESSION = {
  expires_at: Math.floor(Date.now() / 1000) + 3600, // שעה קדימה — SDK לא ינסה refresh
  // ...
}
```

### 5.4 Hebrew text בselector — exact string, לא regex עם אסטריסק
```ts
// ❌ עלול להכשל בגלל encoding
page.getByText(/עדיין לא הוספת|no meals/i)

// ✅ exact string מהi18n
page.getByText('לא נוספו ארוחות היום')
```

---

## 6. Vercel Deploy

### 6.1 Vercel לא מחובר ל-GitHub — deploy ידני חובה אחרי כל push
```bash
npx vercel --prod
```
זה הפקודה היחידה שמעדכנת production. `git push` לבד לא מספיק.

### 6.2 בדוק `tsc -b` מקומית לפני vercel --prod
```bash
npx tsc -b && echo "✅ ready to deploy"
```
Vercel נופל על TS errors שlocal editor לפעמים מסתיר.

---

## 7. ארכיטקטורה — מה לשמור

- **hook structure**: useMeals, useProfile, useGoals, useFoodHistory, useComposedGroups — לא לשנות את המבנה, רק להרחיב
- **i18n pattern**: `t(lang, key)` + `dir(lang)` — לא להוסיף ternaries חדשים בלי להוסיף key ל-i18n.ts
- **Supabase Realtime**: כל hook מנהל channel משלו על טבלה שלו — זה נכון, לא לאחד
- **Error Boundaries**: כל tab עטוף ב-boundary עם `label` + `lang` props
- **React.lazy**: HistoryTab ו-SettingsSheet בלבד — כבדים מספיק להצדיק
- **AppContext**: `lang`, `theme`, `toggleLang`, `toggleTheme` — להעביר כאן, לא כprops

---

## 8. Design System — CSS Tokens

### 8.1 אל תכתוב rgba() ישירות בקומפוננט — תמיד הוסף token ל-index.css
```ts
// ❌ hardcoded — לא ניתן לשנות בצורה מרוכזת
border: 'rgba(59,130,246,0.35)'

// ✅ CSS token — משתנה עם הtheme, ניתן לשינוי ממקום אחד
border: 'var(--blue-border)'
```

### 8.2 Scale קיים — השתמש לפי עוצמה
| אופציות blue | ערך | שימוש |
|---|---|---|
| `--blue-fill` | 0.07 | רקע כרטיס עדין מאוד |
| `--blue-tint` | 0.10 | רקע chip/badge |
| `--blue-chip` | 0.12 | רקע chip בינוני |
| `--blue-select` | 0.18 | רקע selected state |
| `--blue-glow` | 0.25 | border עדין / box-shadow glow |
| `--blue-border` | 0.35 | border רגיל |
| `--blue-border-hi` | 0.40 | border active/focus |

אותו pattern קיים ל-`--green-*`, `--red-*`, `--amber-*`, `--indigo-*`.

### 8.3 תמיד השתמש ב-token לאלמנטים על רקע צבעוני
```ts
// ❌ לא ברור אם זה נכון ב-light mode
color: '#fff'

// ✅ תמיד לבן על רקע צבעוני (כפתורי brand, badges)
color: 'var(--on-color)'

// ✅ עיגול toggle switch (תמיד לבן)
background: 'var(--toggle-knob)'
```

### 8.4 Z-index — השתמש ב-scale במקום מספרים קסומים
```css
/* ב-CSS */
z-index: var(--z-sheet);   /* 100 */
z-index: var(--z-toast);   /* 300 */

/* הscale המלא (מוגדר ב-:root ב-index.css) */
--z-sticky:   10;  /* sticky header */
--z-fab:      40;  /* floating action button */
--z-dropdown: 50;  /* dropdown/tooltip */
--z-backdrop: 99;  /* modal backdrop */
--z-sheet:   100;  /* bottom sheet */
--z-toast:   300;  /* toast notification */
```
בinline styles של React, השתמש במספר הישיר (`zIndex: 100`) — CSS vars לא עובדים ב-JS inline styles. תיעד את הscale בcomment.
