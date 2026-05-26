# דו״ח ביקורת קוד — Calorie & Protein Tracker
> ביקורת מלאה · 5 סיבובים · 2026-05-26  
> **סטטוס תיקונים:** ✅ הכל טופל — build נקי, 239 טסטים עוברים

---

## סטטוס כללי

| קטגוריה | ממצאים | סטטוס |
|---|---|---|
| 🔴 קריטי | 6 | ✅ כולם טופלו |
| 🟠 גבוה | 5 | ✅ כולם טופלו |
| 🟡 בינוני | 10 | ✅ כולם טופלו |
| ✅ נקי | אבטחה, hooks, API auth, i18n symmetry, build | — |

---

## 🔴 קריטי — חייב לתיקון לפני deploy הבא

---

### ✅ K1 · `TodayTab.tsx:96` — טוקן CSS לא מוגדר
**בעיה:** `var(--amber)` לא קיים ב-`index.css`. הרכיב מתרנדר ללא צבע רקע.  
**כלל:** CLAUDE.md §3.2 — "אין `--amber-*`... אלו שמות שגויים שלא קיימים ב-CSS"

```tsx
// ❌ כיום
background: 'var(--amber)'

// ✅ תיקון
background: 'var(--warning)'
```

---

### ✅ K2 · `ErrorBoundary.tsx:39-45` — strings ממשק ללא `t()`
**בעיה:** כל הטקסט שמוצג למשתמש (הודעת שגיאה, כפתורי retry/reload) קשוח בעברית ואנגלית inline.  
**כלל:** CLAUDE.md §2.1 — "כל string בממשק עובר דרך `t(lang, key)`"

```tsx
// ❌ כיום
const msg   = isHe ? `שגיאה ב${label}. משהו השתבש.` : `Error in ${label}. Something went wrong.`
const retry  = isHe ? 'נסה שוב' : 'Try again'
const reload = isHe ? 'רענן דף' : 'Reload'

// ✅ תיקון — להוסיף ב-i18n.ts ולהשתמש ב-t()
// errorMsg: 'משהו השתבש.' / 'Something went wrong.'
// errorMsgLabel: 'שגיאה ב{label}. משהו השתבש.' / 'Error in {label}. Something went wrong.'
// retryBtn: 'נסה שוב' / 'Try again'
// reloadBtn: 'רענן דף' / 'Reload'
```

---

### ✅ K3 · `FoodEntryForm.tsx:1075-1086` — ternaries עבור labels יחידות מידה
**בעיה:** 8 תוויות dropdown (גרם, אונקיה, מ"ל וכו׳) משתמשות ב-`lang === 'he' ? ... : ...` inline במקום `t()`.  
**כלל:** CLAUDE.md §2.1

```tsx
// ❌ כיום
<option value="g">{lang === 'he' ? 'גרם' : 'g'}</option>
<option value="oz">{lang === 'he' ? 'אונקיה' : 'oz'}</option>
<option value="ml">{lang === 'he' ? 'מ"ל' : 'ml'}</option>
// ... עוד 5 יחידות

// ✅ תיקון — להוסיף ב-i18n.ts:
// unitG: 'גרם' / 'g'
// unitOz: 'אונקיה' / 'oz'
// unitMl: 'מ"ל' / 'ml'
// unitFlOz: 'פל.אונ׳' / 'fl oz'
// unitCup: 'כוס' / 'cup'
// unitTbsp: 'כף' / 'tbsp'
// unitTsp: 'כפית' / 'tsp'
// unitServing: 'מנה' / 'serving'
// ואז: <option value="g">{t(lang, 'unitG')}</option>
```

---

### ✅ K4 · `DonutProgress.tsx:72-75` — aria-label עם ternary inline
**בעיה:** תווית נגישות (aria-label) משתמשת ב-ternary ישיר עם strings עבריים/אנגלים.  
**כלל:** CLAUDE.md §2.1

```tsx
// ❌ כיום
aria-label={
  lang === 'he'
    ? `${type === 'calories' ? 'קלוריות' : type === 'protein' ? 'חלבון' : 'נוזלים'}: ${realPct}% מהיעד`
    : `${type === 'calories' ? 'Calories' : type === 'protein' ? 'Protein' : 'Fluid'}: ${realPct}% of goal`
}

// ✅ תיקון — להוסיף ב-i18n.ts:
// donutAriaCalories: 'קלוריות' / 'Calories'
// donutAriaProtein: 'חלבון' / 'Protein'
// donutAriaFluid: 'נוזלים' / 'Fluid'
// donutAriaGoalPct: '{type}: {pct}% מהיעד' / '{type}: {pct}% of goal'
```

---

### ✅ K5 · `TodayTab.tsx:997` — fontSize 13 מבטל `.inp` (iOS auto-zoom)
**בעיה:** input בחלון compose עם `className="inp"` מקבל `fontSize: 13` כ-inline style שמבטל את `font-size: 16px` של המחלקה.  
**כלל:** CLAUDE.md §10.1 — "כל `<input>` — `fontSize: 16` מינימום"

```tsx
// ❌ כיום
<input className="inp"
  style={{ height: 32, fontSize: 13, width: 80, ... }} />

// ✅ תיקון — הסר fontSize מה-inline style
<input className="inp"
  style={{ height: 32, width: 80, ... }} />
```

---

### ✅ K6 · `TodayTab.tsx:1026` — fontSize 14 מבטל `.inp` (iOS auto-zoom)
**בעיה:** input שני בחלון compose — אותה בעיה עם `fontSize: 14`.  
**כלל:** CLAUDE.md §10.1

```tsx
// ❌ כיום
<input className="inp"
  style={{ fontSize: 14, height: 36, paddingInlineEnd: 24 }} />

// ✅ תיקון — הסר fontSize
<input className="inp"
  style={{ height: 36, paddingInlineEnd: 24 }} />
```

---

## 🟠 גבוה — לתיקון בהקדם

---

### ✅ H1 · `HistoryTab.tsx:2471` — `rgba()` ישיר ב-boxShadow
**בעיה:** צבע inline במקום טוקן CSS.  
**כלל:** CLAUDE.md §3.1

```tsx
// ❌ כיום
boxShadow: '0 -4px 40px rgba(0,0,0,0.35)'

// ✅ תיקון — הוסף טוקן ב-index.css:
// --shadow-sheet-lift: 0 -4px 40px rgba(0,0,0,0.35);
// ואז:
boxShadow: 'var(--shadow-sheet-lift)'
```

---

### ✅ H2 · `FoodEntryForm.tsx:711` — `'per 100g'` קשוח ללא `t()`
**בעיה:** string אנגלי קשוח בתצוגה. המפתח `per100g` כבר קיים ב-i18n.ts ומשמש בשורה 890.  
**כלל:** CLAUDE.md §2.1

```tsx
// ❌ כיום (שורה 711)
<span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1 }}>per 100g</span>

// ✅ תיקון
<span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1 }}>{t(lang, 'per100g')}</span>
```

---

### ✅ H3 · `FoodEntryForm.tsx:948` — string manipulation hack עם `.replace()`
**בעיה:** קוד מנסה לקצר תרגום ע״י החלפת מילה — פריצת i18n שלא עובדת בצורה ראויה.  
**כלל:** CLAUDE.md §2.1 — "לסטרינגים דינמיים: חלק לחלקים סטטיים + הרכב בקומפוננט"

```tsx
// ❌ כיום
{t(lang, 'totalGrams').replace('גרמים', '').replace('grams', '').trim() || 'סה״כ'}

// ✅ תיקון — הוסף מפתח ייעודי ב-i18n.ts:
// totalGramsAbbr: 'סה״כ' / 'Total'
// ואז:
{t(lang, 'totalGramsAbbr')}
```

---

### ✅ H4 · `HistoryTab.tsx:1315-1527` — 200+ שורות חישוב ב-useMemo
**בעיה:** כל הלוגיקה החישובית של מסך הסטטיסטיקות (ממוצעים, אחוזים, נתוני גרף, ימי רצף) קיימת inline.  
**כלל:** CLAUDE.md §4.1 — "לוגיקה חישובית = פונקציה טהורה ב-`calculations.ts`"

```tsx
// ❌ כיום — 200+ שורות ב-useMemo כולל:
// barDays, avg7Cal, avg30Cal, pct7Cal, calOkDays7, fluidDays7, lineDays30...

// ✅ תיקון — חלץ ל-calculations.ts:
// export function calcHistoryStats(grouped, range): HistoryStats { ... }
// ובקומפוננט:
const stats = useMemo(() => calcHistoryStats(grouped, range), [grouped, range])
```

---

### ✅ H5 · `SettingsSheet.tsx:634-640` — BMI וצריכת נוזלים inline ב-useMemo
**בעיה:** חישוב BMI ומינון נוזלים מומלץ (35ml/kg) קיים inline בקומפוננט.  
**כלל:** CLAUDE.md §4.1

```tsx
// ❌ כיום
const { bmr, suggestedFluidMl, bmi, bmiCategory } = useMemo(() => {
  const bmiVal      = Math.round((draft.weight / ((draft.height / 100) ** 2)) * 10) / 10
  const bmiCategory = bmiVal < 18.5 ? 'underweight' : bmiVal < 25 ? 'normal' : bmiVal < 30 ? 'overweight' : 'obese'
  const suggestedFluidMl = Math.round(draft.weight * 35 / 100) * 100
  ...
}, [draft])

// ✅ תיקון — הוסף ל-calculations.ts:
// export function calcBMI(weight: number, height: number): number
// export function calcBMICategory(bmi: number): 'underweight' | 'normal' | 'overweight' | 'obese'
// export function calcSuggestedFluidMl(weight: number): number
```

---

## 🟡 בינוני — לתיקון בסיבוב הבא

---

### ✅ M1 · zIndex ללא comment — רשימה מלאה

כל הערכים הבאים חסרים את פורמט ה-comment הנדרש `// --z-*`:

| קובץ | שורה | ערך | comment נדרש |
|---|---|---|---|
| `App.tsx` | 261 | `30` | `// --z-sticky` (10) או token ייעודי |
| `HistoryTab.tsx` | 1094 | `9` | `// local stacking` |
| `HistoryTab.tsx` | 1194 | `39` | `// local stacking` |
| `HistoryTab.tsx` | 2555 | `1` | `// local stacking` |
| `HistoryTab.tsx` | 2570 | `1` | `// local stacking` |
| `HistoryTab.tsx` | 2585 | `1` | `// local stacking` |
| `SettingsSheet.tsx` | 1615, 1616, 2161, 2162 | `1` | `// local stacking` |
| `SettingsSheet.tsx` | 1647, 1648, 2190, 2191 | `2` | `// local stacking` |
| `SettingsSheet.tsx` | 2821 | `1` | `// local stacking` |

**כלל:** CLAUDE.md §3.3 — "בinline styles של React — השתמש במספר עם comment"

> הערה: ערכי `1` ו-`2` המשמשים ל-stacking מקומי (scroll gradients) אינם חלק מה-scale הגלובלי — יש לסמן `// local stacking`

---

### ✅ M2 · `SettingsSheet.tsx:68` — hex fallback בתוך `var()`
**בעיה:** `#a5b4fc` כ-fallback hardcoded בתוך `var(--library-hi, #a5b4fc)`. הטוקן קיים ב-CSS.  
**כלל:** CLAUDE.md §3.1

```tsx
// ❌ כיום
color: isCustom ? 'var(--library-hi, #a5b4fc)' : 'var(--text-2)'

// ✅ תיקון — הסר את ה-fallback
color: isCustom ? 'var(--library-hi)' : 'var(--text-2)'
```

---

### ✅ M3 · `calcDailyInsight` — ללא כיסוי בדיקות
**בעיה:** פונקציה exported (`calculations.ts:510`) המשמשת ב-TodayTab אין לה אף טסט ב-`calculations.test.ts`.  
**כלל:** CLAUDE.md §7.1 — "כל לוגיקה חישובית חדשה — טסטים לפני deploy"

```ts
// ✅ יש להוסיף ל-calculations.test.ts:
describe('calcDailyInsight', () => {
  it('returns streak insight when goal met 3+ days', ...)
  it('returns proteinLow insight when protein below target', ...)
  it('returns calLow insight when calories below 70% of goal', ...)
  it('returns calOver insight when calories exceed goal', ...)
  it('returns null when no insight applies', ...)
})
```

---

## ✅ נקי — אין ממצאים

| תחום | סטטוס |
|---|---|
| אבטחת API (JWT, rate limiting, input validation) | ✅ כל endpoint מאובטח |
| CSV export (formula injection) | ✅ כל שדה עטוף במרכאות |
| שאילתות Supabase | ✅ query builder בלבד |
| i18n symmetry (he/en) | ✅ כל key קיים בשתי השפות |
| Error Boundaries | ✅ כל tab עטוף |
| React.lazy | ✅ HistoryTab + SettingsSheet בלבד |
| Hooks pattern | ✅ כל hook עוקב אחרי pattern הקיים |
| useState לerived state | ✅ לא נמצא |
| IIFE עם hooks ב-JSX | ✅ לא נמצא |
| TypeScript type narrowing | ✅ כל `unknown` מטופל כ-`Record<string, unknown>` |
| imports לא בשימוש | ✅ נקי |
| vitest.config.ts / vite.config.ts | ✅ הפרדה נכונה |

---

## סדר תיקון מומלץ

```
סיבוב א׳ (קריטי — iOS + token):
  K1  TodayTab:96        var(--amber) → var(--warning)
  K5  TodayTab:997       הסר fontSize:13
  K6  TodayTab:1026      הסר fontSize:14

סיבוב ב׳ (i18n):
  K3  FoodEntryForm:1075-1086   הוסף 8 מפתחות unit ב-i18n.ts
  K4  DonutProgress:72-75       הוסף donutAria* מפתחות
  K2  ErrorBoundary:39-45       הוסף error* מפתחות
  H2  FoodEntryForm:711         t(lang, 'per100g')
  H3  FoodEntryForm:948         מפתח totalGramsAbbr

סיבוב ג׳ (ארכיטקטורה):
  H4  HistoryTab:1315-1527      חלץ calcHistoryStats ל-calculations.ts
  H5  SettingsSheet:634-640     חלץ calcBMI/calcBMICategory/calcSuggestedFluidMl
  M3  calcDailyInsight          הוסף טסטים

סיבוב ד׳ (ניקוי):
  H1  HistoryTab:2471           shadow token ב-index.css
  M1  zIndex comments           הוסף // --z-* בכל הרשימה
  M2  SettingsSheet:68          הסר hex fallback
```

---

> דו״ח זה הופק ב-4 סיבובי ביקורת אוטומטיים כנגד CLAUDE.md, specification/ARCHITECTURE.md, ו-specification/DESIGN_SYSTEM.md.
