# ארכיטקטורה, שירותים ואבטחת מפתחות

## תוכן עניינים
1. [סקירת ארכיטקטורה](#סקירת-ארכיטקטורה)
2. [שירותים חיצוניים](#שירותים-חיצוניים)
3. [זרימת חישוב תזונה — עברית ואנגלית](#זרימת-חישוב-תזונה)
4. [מפתחות וחיבורים — רשימה מלאה](#מפתחות-וחיבורים)
5. [איך מפתחות עובדים ב-Vite](#איך-מפתחות-עובדים-ב-vite)
6. [מה בטוח ומה לא](#מה-בטוח-ומה-לא)
7. [כללי אצבע לעתיד](#כללי-אצבע-לעתיד)
8. [ממצאי Security Audit](#ממצאי-security-audit)

---

## סקירת ארכיטקטורה

```
┌──────────────────────────────────────────────────────────────┐
│                     דפדפן המשתמש                             │
│   React + Vite + TypeScript (SPA)                            │
│   ──────────────────────────────                             │
│   src/App.tsx             ← ניהול auth + ניתוב               │
│   src/components/         ← ממשק משתמש                      │
│   src/hooks/              ← Supabase CRUD + Realtime         │
│   src/lib/ai.ts           ← fallback chain לחישוב תזונה     │
│   src/lib/hebrewFoods.ts  ← מילון עברית→אנגלית (100+ מאכלים)│
│   src/lib/supabase.ts     ← חיבור ל-Supabase                │
└───────────┬──────────────────────┬───────────────────────────┘
            │                      │
            │ Auth / Data          │ POST /api/nutrition
            │                      │
  ┌─────────▼────────┐   ┌─────────▼──────────────────────────┐
  │   Supabase        │   │   Vercel Edge Function             │
  │   (BaaS)          │   │   api/nutrition.ts                 │
  │   - Auth          │   │   ────────────────────             │
  │   - PostgreSQL    │   │   • Rate limit: 10 req/min/IP      │
  │   - Realtime      │   │   • מילון עברית inline             │
  └──────────────────┘   │   • Google Translate fallback      │
                          │   • Groq AI fallback               │
                          └──────┬────────────┬────────────────┘
                                 │            │
                    ┌────────────▼──┐  ┌──────▼─────────────────┐
                    │  Google Cloud  │  │   Groq AI              │
                    │  Translation   │  │   llama-3.3-70b        │
                    │  API (v2)      │  │   -versatile           │
                    └───────────────┘  └────────────────────────┘
                                                  │ fallback
                                       ┌──────────▼────────────┐
                                       │   USDA FoodData        │
                                       │   Central (DEMO_KEY)   │
                                       └───────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│   Vercel (Hosting + CDN + Edge Functions)                    │
│   https://calorie-protein-tracker-eta.vercel.app             │
│   Build: vite build → dist/ → Edge Network                  │
│   Security headers: vercel.json (CSP, X-Frame-Options, …)   │
└──────────────────────────────────────────────────────────────┘
```

**הסבר הזרימה:**
המשתמש נכנס דרך Vercel (קבצי HTML/JS/CSS סטטיים). לחישוב תזונה — הדפדפן שולח בקשה ל-Edge Function בשרת, שמחזיק את כל מפתחות ה-API. אין מפתח רגיש שנשלח לדפדפן. כל שאר הפעולות (auth, שמירת נתונים) מתבצעות ישירות מהדפדפן מול Supabase עם מפתח anon ציבורי.

---

## שירותים חיצוניים

### 1. Supabase
**תפקיד:** מסד נתונים + אימות משתמשים + עדכונים בזמן אמת

| פרט | ערך |
|-----|-----|
| Project Ref | `aduwnjejyiviegrrmbzi` |
| Region | `us-east-1` (AWS) |
| Dashboard | https://supabase.com/dashboard/project/aduwnjejyiviegrrmbzi |
| API URL | `https://aduwnjejyiviegrrmbzi.supabase.co` |
| Site URL (auth) | `https://calorie-protein-tracker-eta.vercel.app` |

**טבלאות במסד הנתונים:**
```
meals        — ארוחות יומיות (user_id, date, meal_type, name, grams, calories, protein, time_logged)
goals        — יעדים אישיים (default_calories, default_protein, weekly_overrides)
food_history — היסטוריית מאכלים לאוטוקומפליט (name, grams, calories, protein)
```
כל הטבלאות מוגנות עם **Row Level Security (RLS)** — כל משתמש רואה רק את הנתונים שלו.

**אמצעי אימות:**
- Magic Link (קישור למייל)
- Email + Password
- Google OAuth
- Sessions מאוחסנות ב-`localStorage` על ידי Supabase SDK (מנוהל על ידי Supabase, לא code שלנו)

---

### 2. Vercel Edge Function — `api/nutrition.ts`
**תפקיד:** proxy מאובטח בין הדפדפן לשירותי AI — מחזיק את כל מפתחות ה-API בצד השרת

| פרט | ערך |
|-----|-----|
| Runtime | `edge` (Vercel Edge Network) |
| Path | `POST /api/nutrition` |
| Rate Limit | 10 בקשות לדקה לכל IP |
| Body | `{ foodName: string, amount: number, amountType: 'g' | 'unit' }` |
| Response | `{ calories: number, protein: number }` |

**לוגיקת תרגום עברית (בתוך ה-Edge Function):**
```
1. מילון inline (100+ מאכלים ישראליים נפוצים)
   ↓ לא נמצא
2. Google Cloud Translation API → תרגום מדויק
   ↓ שגיאה / לא זמין
3. Groq AI — תרגום כ-fallback (2-4 מילים באנגלית)
```

---

### 3. Groq AI
**תפקיד:** חישוב קלוריות וחלבון לפי שם מאכל באנגלית

| פרט | ערך |
|-----|-----|
| Endpoint | `https://api.groq.com/openai/v1/chat/completions` |
| Model | `llama-3.3-70b-versatile` |
| Dashboard | https://console.groq.com |
| Latency ממוצע | ~0.8 שניות |

**אסטרטגיית שאילתה:**
המודל מתשאל **לפי 100 גרם** (או לפי יחידה), והתוצאה מוכפלת בקוד:
```ts
// שאילתה: "Per 100g of chicken thigh? JSON: {calories, protein}"
// תשובה:   { calories: 209, protein: 26.8 }
// סקיילינג: calories = 209 * (80 / 100) = 167
```

---

### 4. Google Cloud Translation API
**תפקיד:** תרגום שם מאכל עברי לאנגלית — כ-fallback למילון

| פרט | ערך |
|-----|-----|
| Endpoint | `https://translation.googleapis.com/language/translate/v2` |
| GCP Project | GPD-PRO |
| Model | Neural Machine Translation (v2) |
| Free Tier | 500,000 תווים/חודש |
| Budget Alert | $5 (מוגדר ב-Google Cloud Billing) |

**מתי מופעל:** רק כאשר שם המאכל מכיל עברית ולא נמצא במילון המקומי.

---

### 5. USDA FoodData Central
**תפקיד:** fallback לחישוב תזונה לפי משקל בלבד (גרמים בלבד, לא יחידות)

| פרט | ערך |
|-----|-----|
| Endpoint | `https://api.nal.usda.gov/fdc/v1/foods/search` |
| API Key | `DEMO_KEY` (ציבורי, ללא הרשמה) |
| מגבלה | 30 בקשות/IP/שעה עם DEMO_KEY |

`DEMO_KEY` הוא מפתח ציבורי שמספקת USDA — אין סיכון בחשיפתו בקוד.

---

### 6. Vercel
**תפקיד:** Hosting + CDN + CI/CD + Edge Functions

| פרט | ערך |
|-----|-----|
| Organization | `sbensidi-gmailcoms-projects` |
| Project | `calorie-protein-tracker` |
| Production URL | `https://calorie-protein-tracker-eta.vercel.app` |
| Dashboard | https://vercel.com/sbensidi-gmailcoms-projects/calorie-protein-tracker |
| GitHub Repo | https://github.com/sbensidi/calorie-protein-tracker |
| Deploy trigger | כל `git push` לענף `main` |

---

## זרימת חישוב תזונה

### מקרה 1 — מאכל עברי (פרגית, שקשוקה, וכו')

```
המשתמש מזין שם מאכל
         ↓
[src/lib/ai.ts — צד הדפדפן]
    בדיקת היסטוריה מקומית (cache)
         ↓ לא נמצא
    POST /api/nutrition  ──────────────────────────────→ [Edge Function]
                                                              ↓
                                                    מילון עברית→אנגלית
                                                    (100+ מאכלים)
                                                              ↓ לא נמצא
                                                    Google Translate API
                                                              ↓ שגיאה
                                                    Groq AI (תרגום בלבד)
                                                              ↓
                                                    Groq AI — "Per 100g of X?"
                                                              ↓
                                                    { calories, protein } × scale
         ↓ שגיאה מוחלטת
    { calories: 0, protein: 0 }  ← משתמש ממלא ידנית
```

### מקרה 2 — מאכל אנגלי / מספרים

```
המשתמש מזין שם מאכל (באנגלית)
         ↓
[src/lib/ai.ts]
    בדיקת היסטוריה
         ↓ לא נמצא
    POST /api/nutrition → Edge Function → Groq AI ישירות (ללא תרגום)
         ↓ שגיאה
    USDA API (גרמים בלבד)
         ↓ שגיאה
    { calories: 0, protein: 0 }
```

### מקרה 3 — כמות ביחידות (לא גרמים)

```
{ amountType: 'unit', amount: 2 }
         ↓
Edge Function שואל: "Per 1 piece of X? JSON: {calories, protein}"
         ↓
תוצאה × 2 (מספר היחידות)
```

---

## מפתחות וחיבורים

### קובץ `.env` (לפיתוח מקומי בלבד — לא ב-git)
```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-from-supabase-dashboard>
VITE_GROQ_API_KEY=<groq-api-key>   # dev בלבד — מפנה ישירות ל-Groq
```

### משתני סביבה ב-Vercel (Production)
| שם | תפקיד | נגיש מ |
|----|--------|---------|
| `VITE_SUPABASE_URL` | כתובת Supabase | דפדפן + build |
| `VITE_SUPABASE_ANON_KEY` | מפתח anon של Supabase | דפדפן + build |
| `VITE_GROQ_API_KEY` | Groq (dev path בלבד, לא בשימוש בפרודקשן) | build בלבד |
| `GROQ_API_KEY` | Groq — Edge Function בלבד | שרת בלבד ✅ |
| `GOOGLE_TRANSLATE_API_KEY` | Google Translate — Edge Function בלבד | שרת בלבד ✅ |

### מפתחות שאינם ב-.env
| מפתח | נמצא איפה | רמת סיכון |
|------|-----------|-----------|
| `DEMO_KEY` (USDA) | קוד מקור (`ai.ts`) | אפס — מפתח ציבורי |
| Supabase CLI token | `~/.local/share/supabase` | גבוה — לא לשתף |
| Vercel auth token | `~/.vercel/` | גבוה — לא לשתף |

---

## איך מפתחות עובדים ב-Vite

### המודל של Vite עם משתני סביבה

```
.env (לא ב-git)
      ↓
Vite Build Process
      ↓
dist/assets/index-xxx.js  ← הקובץ הסופי שרואה הדפדפן
```

**Vite מחליף בזמן build:**
```ts
// בקוד שלנו:
import.meta.env.VITE_SUPABASE_URL

// הופך ב-build ל:
"https://aduwnjejyiviegrrmbzi.supabase.co"  // ← גלוי ב-JS
```

כלומר — כל משתנה עם `VITE_` **גלוי בקוד ה-JS** שנשלח לדפדפן.
משתנים **ללא** `VITE_` (כמו `GROQ_API_KEY`) — לא נכנסים ל-build, נגישים רק ל-Edge Function.

---

## מה בטוח ומה לא

### ✅ VITE_SUPABASE_URL — בטוח לחשיפה
כתובת ה-API של Supabase. ניתן לגלות אותה גם מה-Network tab. אין בה סוד.

### ✅ VITE_SUPABASE_ANON_KEY — בטוח לחשיפה (בתנאי שיש RLS)
זהו "anon key" — מפתח ציבורי שמזהה את הפרויקט בלבד. הסיכון מנוטרל על ידי RLS:
```sql
-- משתמש לא מחובר → auth.uid() = null → אפס שורות
-- משתמש מחובר → רק השורות שלו
create policy "Users can manage their own meals"
  on meals for all
  using (auth.uid() = user_id)
```

### ✅ GROQ_API_KEY — מאובטח בשרת בלבד
המפתח נמצא **רק ב-Edge Function** ולא נשלח לדפדפן מעולם. הדפדפן שולח בקשה ל-`/api/nutrition` — הוא לא יודע שקיים Groq מאחורי הקלעים.

### ✅ GOOGLE_TRANSLATE_API_KEY — מאובטח בשרת בלבד
אותו עיקרון — נגיש רק לEdge Function. בנוסף:
- מוגבל ל-Cloud Translation API בלבד (API restrictions ב-GCP)
- Budget Alert של $5 מוגדר ב-Google Cloud Billing

### ⚠️ VITE_GROQ_API_KEY — נמצא ב-Vercel אבל לא בשימוש בפרודקשן
נוסף מסיבות היסטוריות — הקוד בודק `import.meta.env.DEV` לפני שימוש במפתח זה. בפרודקשן, הכל עובר דרך ה-Edge Function עם `GROQ_API_KEY`.

---

## כללי אצבע לעתיד

### ✅ מה לעשות
```
# מפתח רגיש לשרת — ללא VITE_:
GROQ_API_KEY=...
GOOGLE_TRANSLATE_API_KEY=...

# מפתח ציבורי לדפדפן — עם VITE_:
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# ב-.gitignore — לוודא שיש:
.env
.env.local
.env.production
```

### ❌ מה לא לעשות
```ts
// אסור — מפתח ישירות בקוד:
const apiKey = 'sk-abc123...'

// אסור — console.log בפרודקשן:
console.log('user:', session.access_token)

// אסור — שימוש ב-VITE_ למפתח רגיש:
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY  // ← גלוי בדפדפן!
```

### סיכום רמות הסיכון

| מפתח | גלוי לדפדפן? | סיכון בגניבה | הגנה |
|------|-------------|--------------|------|
| Supabase URL | כן | אפס | — |
| Supabase Anon Key | כן | נמוך | RLS על כל הטבלאות |
| GROQ_API_KEY | **לא** ✅ | — | Edge Function בלבד |
| GOOGLE_TRANSLATE_API_KEY | **לא** ✅ | — | Edge Function + API restrictions + Budget Alert |
| USDA DEMO_KEY | כן (בקוד) | אפס | מפתח ציבורי |
| Supabase CLI Token | לא | גבוה | נמצא רק במחשב שלך |

### אם מפתח נפרץ — מה עושים?
**Groq:**
1. https://console.groq.com → מחיקת המפתח הנוכחי
2. יצירת מפתח חדש
3. עדכון ב-Vercel: `Settings → Environment Variables → GROQ_API_KEY`
4. `vercel deploy --prod --yes`

**Google Translate:**
1. https://console.cloud.google.com → APIs & Services → Credentials
2. מחיקת המפתח
3. יצירת מפתח חדש + הגבלת API
4. עדכון ב-Vercel: `GOOGLE_TRANSLATE_API_KEY`
5. `vercel deploy --prod --yes`

---

## ממצאי Security Audit

### ✅ גרסה 1 (2025-04-15) — תוקן
| ממצא | פעולה |
|------|--------|
| `console.error` בפרודקשן | הוגבל ל-`import.meta.env.DEV` |
| Prompt injection ב-AI | שם מאכל מוגבל ל-100 תווים, גרשיים מסוננות |
| CSP חסר | נוסף `Content-Security-Policy` header |

### ✅ גרסה 2 (2026-04-15) — תוקן
| ממצא | פעולה |
|------|--------|
| Groq key גלוי בדפדפן | `api/nutrition.ts` — Edge Function proxy, מפתח שרת-side בלבד |
| אין rate limiting | Debounce 3 שניות ב-`FoodEntryForm` |
| אין validation על Supabase | Type guards ב-`useMeals`, `useFoodHistory`, `useGoals` |

### ✅ גרסה 3 (2026-04-16) — תוקן
| ממצא | פעולה |
|------|--------|
| חישוב תזונה לא מדויק לעברית | מילון עברית→אנגלית (100+ מאכלים) + Google Translate fallback |
| שדרוג מודל AI | `llama-3.1-8b` → `llama-3.3-70b-versatile` (דיוק גבוה יותר) |
| אין rate limiting על Edge Function | 10 בקשות/דקה/IP — מגן על Groq quota ו-Google Translate |
| אין security headers | `vercel.json` — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Google Translate key חשוף | מוגבל ל-Cloud Translation API בלבד + Budget Alert $5 |

### בדיקה אחרונה (2026-04-16) — npm audit
```
found 0 vulnerabilities
```
