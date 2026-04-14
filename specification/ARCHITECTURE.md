# ארכיטקטורה, שירותים ואבטחת מפתחות

## תוכן עניינים
1. [סקירת ארכיטקטורה](#סקירת-ארכיטקטורה)
2. [שירותים חיצוניים](#שירותים-חיצוניים)
3. [מפתחות וחיבורים — רשימה מלאה](#מפתחות-וחיבורים)
4. [איך מפתחות עובדים ב-Vite](#איך-מפתחות-עובדים-ב-vite)
5. [מה בטוח ומה לא](#מה-בטוח-ומה-לא)
6. [כללי אצבע לעתיד](#כללי-אצבע-לעתיד)

---

## סקירת ארכיטקטורה

```
┌─────────────────────────────────────────────────────┐
│                  דפדפן המשתמש                        │
│   React + Vite + TypeScript (SPA)                   │
│   ─────────────────────────────                     │
│   src/App.tsx          ← ניהול auth + ניתוב          │
│   src/components/      ← ממשק משתמש                 │
│   src/hooks/           ← Supabase CRUD + Realtime   │
│   src/lib/ai.ts        ← חישוב תזונה (Groq / USDA) │
│   src/lib/supabase.ts  ← חיבור ל-Supabase           │
└──────────────┬───────────────┬──────────────────────┘
               │               │
    ┌──────────▼──────┐   ┌────▼─────────────┐
    │   Supabase       │   │   Groq AI         │
    │   (BaaS)         │   │   llama-3.1-8b   │
    │   - Auth         │   │   nutrition API  │
    │   - PostgreSQL   │   └──────────────────┘
    │   - Realtime     │
    └──────────────────┘        ┌─────────────────┐
                                │   USDA FoodData  │
                                │   (fallback,     │
                                │    DEMO_KEY)     │
                                └─────────────────┘
┌─────────────────────────────────────────────────────┐
│   Vercel (Hosting + CDN)                            │
│   https://calorie-protein-tracker-eta.vercel.app    │
│   Build: vite build → dist/ → Edge Network         │
└─────────────────────────────────────────────────────┘
```

**הסבר הזרימה:**
המשתמש נכנס דרך Vercel (קבצי HTML/JS/CSS סטטיים). הדפדפן מתחבר ישירות לשירותים החיצוניים — אין שרת backend משלנו. כל בקשה עוברת ישירות מהדפדפן ל-Supabase / Groq.

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
meals        — ארוחות יומיות (user_id, date, meal_type, name, grams, calories, protein)
goals        — יעדים אישיים (calories, protein, weekly_overrides)
food_history — היסטוריית מאכלים לאוטוקומפליט
```
כל הטבלאות מוגנות עם **Row Level Security (RLS)** — כל משתמש רואה רק את הנתונים שלו.

**אמצעי אימות:**
- Magic Link (קישור למייל)
- Email + Password
- Sessions מאוחסנות ב-`localStorage` על ידי Supabase SDK

---

### 2. Groq AI
**תפקיד:** חישוב קלוריות וחלבון לפי שם מאכל וכמות

| פרט | ערך |
|-----|-----|
| Endpoint | `https://api.groq.com/openai/v1/chat/completions` |
| Model | `llama-3.1-8b-instant` |
| Dashboard | https://console.groq.com |
| Latency ממוצע | ~0.5 שניות |

**שרשרת fallback:**
```
1. היסטוריה מקומית (localStorage cache)
   ↓ לא נמצא
2. Groq AI (llama-3.1-8b-instant)
   ↓ שגיאה / timeout
3. USDA FoodData Central API (DEMO_KEY)
   ↓ לא נמצא
4. הזנה ידנית על ידי המשתמש
```

---

### 3. USDA FoodData Central
**תפקיד:** fallback לחישוב תזונה לפי משקל בלבד

| פרט | ערך |
|-----|-----|
| Endpoint | `https://api.nal.usda.gov/fdc/v1/foods/search` |
| API Key | `DEMO_KEY` (ציבורי, ללא הרשמה) |
| מגבלה | 30 בקשות/IP/שעה עם DEMO_KEY |

DEMO_KEY הוא מפתח ציבורי שמספקת USDA — אין סיכון בחשיפתו בקוד.

---

### 4. Vercel
**תפקיד:** Hosting + CDN + CI/CD

| פרט | ערך |
|-----|-----|
| Organization | `sbensidi-gmailcoms-projects` |
| Project | `calorie-protein-tracker` |
| Production URL | `https://calorie-protein-tracker-eta.vercel.app` |
| Dashboard | https://vercel.com/sbensidi-gmailcoms-projects/calorie-protein-tracker |
| GitHub Repo | https://github.com/sbensidi/calorie-protein-tracker |
| Deploy trigger | כל `git push` לענף `main` |

---

## מפתחות וחיבורים

### קובץ `.env` (לפיתוח מקומי בלבד — לא ב-git)
```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-from-supabase-dashboard>
VITE_GROQ_API_KEY=<groq-api-key-from-console.groq.com>
```

### משתני סביבה ב-Vercel (Production)
אותם שלושה משתנים מוגדרים בממשק Vercel:
`Settings → Environment Variables`

### מפתחות שאינם ב-.env
| מפתח | נמצא איפה | רמת סיכון |
|------|-----------|-----------|
| `DEMO_KEY` (USDA) | קוד מקור (`ai.ts`) | אפס — מפתח ציבורי |
| `sbp_b4c...` (Supabase CLI token) | אצלך בלבד | גבוה — לא לשתף |
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
import.meta.env.VITE_GROQ_API_KEY

// הופך בbuild ל:
"gsk_XXXXXXXXXXXXXXXXXXXXXXXXXX"  // ← הערך האמיתי, גלוי בקוד ה-JS!
```

כלומר — **המפתח קיים בתוך קובץ ה-JS** שנשלח לדפדפן של כל משתמש.

---

## מה בטוח ומה לא

### ✅ VITE_SUPABASE_URL — בטוח לחשיפה
כתובת ה-API של Supabase. ניתן לגלות אותה גם מה-Network tab. אין בה סוד.

### ✅ VITE_SUPABASE_ANON_KEY — בטוח לחשיפה (בתנאי שיש RLS)
זה **לא** מפתח admin. זהו "anon key" — מפתח ציבורי שמזהה את הפרויקט בלבד.
**הסיכון מנוטרל על ידי Row Level Security:**
- מי שיש לו את ה-anon key יכול לפנות ל-API
- אבל בלי session של משתמש מחובר — הוא לא יכול לקרוא שום נתון
- כל הטבלאות שלנו מוגנות: `auth.uid() = user_id`

```sql
-- ה-policy הזה בשני מקרים:
-- 1. משתמש לא מחובר → auth.uid() מחזיר null → אפס שורות
-- 2. משתמש מחובר → רק השורות שלו
create policy "Users can manage their own meals"
  on meals for all
  using (auth.uid() = user_id)
```

### ⚠️ VITE_GROQ_API_KEY — חשיפה מוגבלת, ניטול ב-rate limiting
זה מפתח API אמיתי שמאפשר שימוש בשירות Groq.
מי שיגנוב אותו יוכל להשתמש ב-Groq **על חשבוניך**.

**מה מגן עלינו:**
1. Groq מציע rate limiting לפי מפתח
2. ניתן לנטר שימוש בדשבורד Groq ולבטל מפתח מיידית
3. המודל הזול (`llama-3.1-8b-instant`) — עלות שימוש לא מורשה נמוכה

**הפתרון האידיאלי לעתיד** (אם האפליקציה גדלה):
```
דפדפן → שרת API משלנו (Vercel Function/Edge) → Groq
```
כך המפתח נשאר בצד השרת ולעולם לא יוצא לדפדפן.

---

## כללי אצבע לעתיד

### ✅ מה לעשות
```
# כל מפתח רגיש — במשתנה סביבה
VITE_SOMETHING=...

# ב-.gitignore — לוודא שיש:
.env
.env.local
.env.production
```

### ❌ מה לא לעשות
```ts
// אסור — מפתח ישירות בקוד:
const apiKey = 'sk-abc123...'

// אסור — console.log של session/token
console.log('user:', session.access_token)
```

### סיכום רמות הסיכון

| מפתח | גלוי לדפדפן? | סיכון בגניבה | הגנה |
|------|-------------|--------------|------|
| Supabase URL | כן | אפס | — |
| Supabase Anon Key | כן | נמוך | RLS על כל הטבלאות |
| Groq API Key | כן | בינוני | Rate limit, ניטור, ביטול מהיר |
| USDA DEMO_KEY | כן | אפס | מפתח ציבורי |
| Supabase CLI Token | לא | גבוה | נמצא רק במחשב שלך |

### אם המפתח של Groq נפרץ — מה עושים?
1. נכנסים ל-https://console.groq.com
2. מוחקים את המפתח הנוכחי
3. יוצרים מפתח חדש
4. מעדכנים ב-Vercel: `Settings → Environment Variables`
5. `vercel --prod` לעשות redeploy

---

## ממצאי Security Audit (2025-04-15)

### ✅ לא נמצאו
- XSS — אין `dangerouslySetInnerHTML`, אין `innerHTML`, React מבצע escaping אוטומטי
- SQL Injection — כל שאילתות דרך Supabase client (parameterized)
- .env ב-git — מאומת: הקובץ לא נכנס לגיט מעולם
- RLS — כל שלוש הטבלאות מוגנות כנדרש

### ✅ תוקנו בגרסה זו
| ממצא | פעולה |
|------|--------|
| `console.error` בפרודקשן | הוגבל ל-`import.meta.env.DEV` בכל הקבצים |
| Prompt injection ב-AI | שם מאכל מוגבל ל-100 תווים, גרשיים מסוננות |
| CSP חסר | נוסף `Content-Security-Policy` header ב-index.html |

### ⚠️ ידוע ומנוהל (לא קריטי לשלב זה)
| ממצא | הסבר | המלצה לעתיד |
|------|-------|-------------|
| Groq key גלוי בדפדפן | ראה סעיף "מה בטוח ומה לא" | Vercel Edge Function |
| אין rate limiting על חישוב | משתמש יכול לשלוח בקשות רבות | Debounce + server-side |
| אין validation על תגובות Supabase | TypeScript cast ללא runtime check | הוסף zod/validation |
