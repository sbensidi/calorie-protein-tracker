# תוכנית עבודה — תמיכה אופליין
> מבוסס על ביקורת קוד + ניתוח hooks קיימים · 2026-05-26

---

## עקרונות עיצוב (לפי CLAUDE.md)

- פונקציות cache טהורות → `src/lib/offlineCache.ts` + טסטים
- hooks לא משתנים מבנית — רק מקבלים שכבת cache על גבי הfetch הקיים
- כל string בממשק → `t(lang, key)` ב-`i18n.ts`
- צבעי pending state → CSS tokens קיימים (`var(--warning-tint)`, `var(--warning)`)
- Types חדשים → `src/types/index.ts`
- cache key תמיד per-userId למניעת דליפת נתונים בין משתמשים

---

## עדיפות ונימוק

| # | תיאור | השפעה | מורכבות | מתי |
|---|---|---|---|---|
| **1** | Cache קריאה (stale-while-revalidate) | גבוהה | נמוכה | ראשון |
| **2** | Optimistic logging + pending queue | גבוהה | בינונית | שני |
| **3** | תור כתיבה מלא (edit/delete) | נמוכה | גבוהה | נדחה |

**למה 1 לפני 2:** רוב המשתמשים חווים "פתיחה ללא רשת ורואים ריק" לפני שהם מנסים להוסיף ארוחה. Cache קריאה פותר את הבעיה הנפוצה ביותר בסיכון אפס.

**למה 3 נדחה:** עריכה ומחיקה אופליין דורשות conflict resolution (מה קורה אם ערכת אופליין ואז אחר מחק?). המורכבות לא מוצדקת עבור קהל המשתמשים הנוכחי.

---

## פאזה 1 — Cache קריאה (stale-while-revalidate)

**מה המשתמש יחווה אחרי:** פותח אפליקציה ללא רשת → רואה את כל נתוני הארוחות, היעדים והפרופיל מהסשן האחרון. באנר offline מוצג. נתונים מתרעננים ברגע החיבור חוזר.

### צעד 1.1 — `src/lib/offlineCache.ts`

```ts
// פונקציות טהורות — ללא dependency על React
const DEFAULT_TTL = 1000 * 60 * 60 * 24  // 24h

interface CacheEntry<T> { ts: number; data: T }

export function readCache<T>(key: string, ttlMs = DEFAULT_TTL): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw) as CacheEntry<T>
    if (Date.now() - ts > ttlMs) return null
    return data
  } catch { return null }
}

export function writeCache<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) }
  catch { /* localStorage מלא — בלע */ }
}

export function clearCache(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
```

**טסטים** (`src/test/offlineCache.test.ts`):
- `readCache` — מחזיר null כשאין cache
- `readCache` — מחזיר data תקינה בתוך TTL
- `readCache` — מחזיר null כשפג תוקף
- `writeCache` — שומר + קורא חזרה
- `clearCache` — מנקה

### צעד 1.2 — `useMeals` + cache

```ts
const CACHE_KEY = (uid: string) => `meals_cache_${uid}`
const CACHE_TTL = 1000 * 60 * 60 * 24  // 24h — 90 ימים של ארוחות

export function useMeals(userId: string | null) {
  // ✅ טעינה סינכרונית מה-cache בinit — לא צריך useEffect נוסף
  const [meals, setMeals] = useState<Meal[]>(() =>
    userId ? (readCache<Meal[]>(CACHE_KEY(userId), CACHE_TTL) ?? []) : []
  )
  // ... שאר ה-hook ללא שינוי מבני

  const fetchMeals = useCallback(async () => {
    // ... הfetch הקיים
    if (!err) {
      const normalized = (data as unknown[]).filter(isMeal).map(...)
      setMeals(normalized)
      writeCache(CACHE_KEY(userId!), normalized)  // ← שמור אחרי fetch מוצלח
    }
  }, [userId])
```

**שים לב:** userId בkey — אם משתמש מתנתק ומתחבר עם חשבון אחר, לא יראה נתונים ישנים.

### צעד 1.3 — `useGoals` + cache

```ts
const CACHE_KEY = (uid: string) => `goals_cache_${uid}`
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7  // 7 ימים — goals משתנים לעיתים נדירות

// useState initializer:
const [goals, setGoals] = useState<Goal | null>(() =>
  userId ? readCache<Goal>(CACHE_KEY(userId)) : null
)
// writeCache אחרי fetch מוצלח
```

### צעד 1.4 — `useProfile` + cache

Profile כבר מנהל cache חלקי. להרחיב להכיל את כל השדות בsame pattern.

```ts
const CACHE_KEY = (uid: string) => `profile_cache_${uid}`
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7  // 7 ימים
```

### קבצים שנגעים בפאזה 1
```
src/lib/offlineCache.ts          ← חדש
src/test/offlineCache.test.ts    ← חדש
src/hooks/useMeals.ts            ← הוסף readCache/writeCache
src/hooks/useGoals.ts            ← הוסף readCache/writeCache
src/hooks/useProfile.ts          ← הרחב cache קיים
```

---

## פאזה 2 — Optimistic Logging + Pending Queue

**מה המשתמש יחווה אחרי:** מוסיף ארוחה ללא רשת → הארוחה מופיעה מיד עם badge קטן "ממתין לסנכרון". כשהרשת חוזרת — הסנכרון קורה בשקט ברקע, badge נעלם.

### צעד 2.1 — Type חדש ב-`src/types/index.ts`

```ts
export interface PendingMeal {
  localId:   string                                      // crypto.randomUUID()
  pendingAt: string                                      // ISO timestamp
  meal:      Omit<Meal, 'id' | 'user_id' | 'created_at'>
}
```

### צעד 2.2 — i18n keys (`src/lib/i18n.ts`)

```ts
// he:
pendingSyncLabel:  'ממתין לסנכרון',
pendingMealsCount: 'ארוחות ממתינות',  // prefix — "{n} ארוחות ממתינות"

// en:
pendingSyncLabel:  'Pending sync',
pendingMealsCount: 'meals pending',    // suffix — "{n} meals pending"
```

### צעד 2.3 — עדכון `useMeals`

**לוגיקת addMeal מעודכנת:**

```ts
const PENDING_KEY = (uid: string) => `pending_meals_${uid}`

// state נוסף
const [pendingMeals, setPendingMeals] = useState<PendingMeal[]>(() =>
  userId ? (readCache<PendingMeal[]>(PENDING_KEY(userId), Infinity) ?? []) : []
  // TTL=Infinity — ממתינים לסנכרון עד שיצליח, לא פג תוקף
)

const addMeal = useCallback(async (meal: Omit<Meal, 'id' | 'user_id' | 'created_at'>) => {
  if (!userId) return
  const localId = crypto.randomUUID()

  // Optimistic: הוסף מיד ל-state המקומי
  const optimisticMeal: Meal = {
    ...meal, id: localId, user_id: userId,
    created_at: new Date().toISOString(),
  }
  setMeals(prev => [optimisticMeal, ...prev])

  if (!navigator.onLine) {
    // Offline: שמור בqueue, אל תנסה DB
    const pending: PendingMeal = { localId, pendingAt: new Date().toISOString(), meal }
    setPendingMeals(prev => {
      const updated = [...prev, pending]
      writeCache(PENDING_KEY(userId), updated)
      return updated
    })
    return
  }

  // Online: נסה DB
  const { error: err } = await supabase.from('meals').insert({ ...meal, id: localId, user_id: userId })
  if (err) {
    // נכשל — הוסף לqueue ושמור את ה-optimistic state
    const pending: PendingMeal = { localId, pendingAt: new Date().toISOString(), meal }
    setPendingMeals(prev => {
      const updated = [...prev, pending]
      writeCache(PENDING_KEY(userId), updated)
      return updated
    })
  } else {
    fetchMeals()  // רענן מ-DB כדי לקבל ID אמיתי וtimestamps
  }
}, [userId, fetchMeals])
```

**Drain queue בחזרת חיבור:**

```ts
useEffect(() => {
  const drainPending = async () => {
    if (!userId || pendingMeals.length === 0) return
    for (const pm of pendingMeals) {
      const { error: err } = await supabase.from('meals').insert({
        ...pm.meal, id: pm.localId, user_id: userId,
      })
      if (!err) {
        setPendingMeals(prev => {
          const updated = prev.filter(p => p.localId !== pm.localId)
          writeCache(PENDING_KEY(userId), updated)
          return updated
        })
      }
    }
    if (pendingMeals.length > 0) fetchMeals()
  }

  window.addEventListener('online', drainPending)
  return () => window.removeEventListener('online', drainPending)
}, [userId, pendingMeals, fetchMeals])

// גם drain בload אם יש pending מסשן קודם
useEffect(() => {
  if (navigator.onLine) drainPending()
}, [userId])  // רק בload
```

### צעד 2.4 — UI: pending badge

**ב-`TodayTab.tsx`** — מיזוג pending עם meals קיימות:

```tsx
// ✅ פונקציה טהורה ב-calculations.ts — לא inline
const displayMeals = useMemo(
  () => mergePendingMeals(meals, pendingMeals),
  [meals, pendingMeals]
)
```

**`calculations.ts`** — פונקציה חדשה:

```ts
export function mergePendingMeals(meals: Meal[], pending: PendingMeal[]): Array<Meal & { isPending?: boolean }> {
  const confirmedIds = new Set(meals.map(m => m.id))
  const pendingAsmeals = pending
    .filter(p => !confirmedIds.has(p.localId))  // לא כפילות
    .map(p => ({ ...p.meal, id: p.localId, user_id: '', created_at: p.pendingAt, isPending: true }))
  return [...pendingAsmeals, ...meals]
}
```

**badge בכרטיס ארוחה** (MealCard או TodayTab):

```tsx
{meal.isPending && (
  <span style={{
    fontSize: 10, fontWeight: 600,
    color: 'var(--warning)',
    background: 'var(--warning-tint)',
    borderRadius: 6, padding: '2px 6px',
  }}>
    {t(lang, 'pendingSyncLabel')}
  </span>
)}
```

**badge summary בheader** (כשיש pending):

```tsx
{pendingMeals.length > 0 && (
  <span style={{ fontSize: 11, color: 'var(--warning)' }}>
    {pendingMeals.length} {t(lang, 'pendingMealsCount')}
  </span>
)}
```

### צעד 2.5 — טסטים

`src/test/calculations.test.ts` — `mergePendingMeals`:
- מחזיר כל meals כשאין pending
- מוסיף pending שלא קיים ב-meals
- לא מוסיף כפילות (pending שכבר סונכרן)
- `isPending: true` רק על pending

### קבצים שנגעים בפאזה 2
```
src/types/index.ts               ← PendingMeal type
src/lib/i18n.ts                  ← 2 keys חדשים × 2 שפות
src/lib/calculations.ts          ← mergePendingMeals
src/hooks/useMeals.ts            ← pending logic + drain
src/components/TodayTab.tsx      ← displayMeals + badge
src/test/calculations.test.ts    ← טסטים ל-mergePendingMeals
```

---

## פאזה 3 — תור כתיבה מלא (עריכה ומחיקה אופליין)

**מה המשתמש יחווה אחרי:** עורך כמות ארוחה ללא רשת → הכמות מתעדכנת מיד ב-UI עם badge. מוחק ארוחה ללא רשת → הארוחה נעלמת מיד. כשהרשת חוזרת — כל הפעולות מסתנכרנות בשקט ברקע.

### הגדרת אסטרטגיית conflict

**"Last write wins" + silent 404** — הכי פשוט ונכון לאפליקציה זו:
- אם עריכה אופליין + השרת מכיר את הארוחה → עריכה גוברת (המשתמש ביקש בפירוש לשנות)
- אם מחיקה אופליין + ארוחה כבר לא קיימת בשרת → treat as success (התוצאה הרצויה הושגה ממילא)
- אם עריכה אופליין + ארוחה נמחקה בשרת (מכשיר אחר) → הפעולה נכשלת, מסירים מה-state המקומי גם

**למה לא IndexedDB:** localStorage מספיק. תור פעולות של משתמש יחיד הוא עשרות records × ~200 bytes = כמה KB. הגבול של localStorage הוא ~5MB.

---

### צעד 3.1 — `PendingOperation` type ב-`src/types/index.ts`

```ts
export type PendingOpType = 'update' | 'delete'

export interface PendingOperation {
  opId:      string           // crypto.randomUUID() — לזיהוי ייחודי
  type:      PendingOpType
  mealId:    string           // ה-id האמיתי מ-DB (ולא localId)
  payload?:  Partial<Meal>    // רק עבור 'update'
  queuedAt:  string           // ISO timestamp — לשמירת סדר
}
```

**הבדל מ-PendingMeal של פאזה 2:** `PendingMeal` עבור ארוחות שעדיין אין להן id ב-DB. `PendingOperation` עבור פעולות על ארוחות קיימות.

---

### צעד 3.2 — i18n keys (`src/lib/i18n.ts`)

```ts
// he:
pendingEditLabel:    'עריכה ממתינה',
pendingOpsCount:    'פעולות ממתינות לסנכרון',

// en:
pendingEditLabel:    'Edit pending',
pendingOpsCount:    'operations pending sync',
```

---

### צעד 3.3 — עדכון `useMeals` — עריכה ומחיקה עם queue

```ts
const OPS_KEY = (uid: string) => `pending_ops_${uid}`

const [pendingOps, setPendingOps] = useState<PendingOperation[]>(() =>
  userId ? (readCache<PendingOperation[]>(OPS_KEY(userId), Infinity) ?? []) : []
)

// ─── updateMeal ───────────────────────────────────────────────────────────
const updateMeal = useCallback(async (id: string, updates: Partial<Meal>) => {
  if (!userId) return

  // Optimistic: עדכן מיד ב-state מקומי
  setMeals(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))

  if (!navigator.onLine) {
    // Merge עם פעולה קיימת על אותה ארוחה (אם יש) — לא לצבור כפילויות
    setPendingOps(prev => {
      const existing = prev.find(op => op.mealId === id && op.type === 'update')
      const merged: PendingOperation = existing
        ? { ...existing, payload: { ...existing.payload, ...updates }, queuedAt: new Date().toISOString() }
        : { opId: crypto.randomUUID(), type: 'update', mealId: id, payload: updates, queuedAt: new Date().toISOString() }
      const updated = [...prev.filter(op => !(op.mealId === id && op.type === 'update')), merged]
      writeCache(OPS_KEY(userId), updated)
      return updated
    })
    return
  }

  const { error: err } = await supabase.from('meals').update(updates).eq('id', id).eq('user_id', userId)
  if (err) {
    // שמור בqueue, optimistic state נשאר
    setPendingOps(prev => {
      const op: PendingOperation = { opId: crypto.randomUUID(), type: 'update', mealId: id, payload: updates, queuedAt: new Date().toISOString() }
      const updated = [...prev, op]
      writeCache(OPS_KEY(userId), updated)
      return updated
    })
  } else {
    fetchMeals()
  }
}, [userId, fetchMeals])

// ─── deleteMeal ───────────────────────────────────────────────────────────
const deleteMeal = useCallback(async (id: string) => {
  if (!userId) return

  // Optimistic: הסר מיד — המשתמש לא צריך לחכות
  setMeals(prev => prev.filter(m => m.id !== id))

  // בטל כל pending update על אותה ארוחה — לא רלוונטי יותר
  setPendingOps(prev => {
    const updated = prev.filter(op => op.mealId !== id)
    writeCache(OPS_KEY(userId), updated)
    return updated
  })

  if (!navigator.onLine) {
    setPendingOps(prev => {
      const op: PendingOperation = { opId: crypto.randomUUID(), type: 'delete', mealId: id, queuedAt: new Date().toISOString() }
      const updated = [...prev, op]
      writeCache(OPS_KEY(userId), updated)
      return updated
    })
    return
  }

  const { error: err } = await supabase.from('meals').delete().eq('id', id).eq('user_id', userId)
  if (err && err.code !== 'PGRST116') {  // PGRST116 = not found = success
    // שמור בqueue
    setPendingOps(prev => {
      const op: PendingOperation = { opId: crypto.randomUUID(), type: 'delete', mealId: id, queuedAt: new Date().toISOString() }
      const updated = [...prev, op]
      writeCache(OPS_KEY(userId), updated)
      return updated
    })
  }
}, [userId, fetchMeals])
```

---

### צעד 3.4 — Drain פעולות בחזרת חיבור

**מוסיף לאותו `useEffect` של drain מפאזה 2:**

```ts
const drainOps = async () => {
  if (!userId || pendingOps.length === 0) return

  // מיין לפי queuedAt — שמור סדר כרונולוגי
  const sorted = [...pendingOps].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))

  for (const op of sorted) {
    let success = false

    if (op.type === 'update' && op.payload) {
      const { error: err } = await supabase
        .from('meals').update(op.payload).eq('id', op.mealId).eq('user_id', userId)
      // PGRST116 = ארוחה לא קיימת → גם success (התוצאה הרצויה)
      success = !err || err.code === 'PGRST116'
      if (err?.code === 'PGRST116') {
        // ארוחה נמחקה מכשיר אחר — הסר גם מ-state מקומי
        setMeals(prev => prev.filter(m => m.id !== op.mealId))
      }
    }

    if (op.type === 'delete') {
      const { error: err } = await supabase
        .from('meals').delete().eq('id', op.mealId).eq('user_id', userId)
      success = !err || err.code === 'PGRST116'  // לא קיים = כבר נמחק = success
    }

    if (success) {
      setPendingOps(prev => {
        const updated = prev.filter(p => p.opId !== op.opId)
        writeCache(OPS_KEY(userId), updated)
        return updated
      })
    }
    // אם נכשל (שגיאת רשת אמיתית) — ישאר בqueue ויינסה שוב בפעם הבאה
  }

  if (sorted.length > 0) fetchMeals()
}
```

---

### צעד 3.5 — UI: badge על ארוחה בעריכה ממתינה

**`calculations.ts`** — פונקציה טהורה:

```ts
export function getMealPendingOp(
  mealId: string,
  pendingOps: PendingOperation[],
): PendingOpType | null {
  return pendingOps.find(op => op.mealId === mealId)?.type ?? null
}
```

**ב-MealCard / TodayTab:**

```tsx
const pendingOp = getMealPendingOp(meal.id, pendingOps)

{pendingOp === 'update' && (
  <span style={{
    fontSize: 10, fontWeight: 600,
    color: 'var(--warning)',
    background: 'var(--warning-tint)',
    borderRadius: 6, padding: '2px 6px',
  }}>
    {t(lang, 'pendingEditLabel')}
  </span>
)}
// delete: הארוחה לא מוצגת כלל (הוסרה optimistically)
```

**summary badge בheader** (כשיש ops + pending meals):

```tsx
{(pendingMeals.length > 0 || pendingOps.length > 0) && (
  <span style={{ fontSize: 11, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 4 }}>
    <span className="icon icon-sm">sync</span>
    {pendingMeals.length + pendingOps.length} {t(lang, 'pendingOpsCount')}
  </span>
)}
```

---

### צעד 3.6 — טסטים

`src/test/calculations.test.ts` — `getMealPendingOp`:
- מחזיר null כשאין pending ops
- מחזיר `'update'` למeal עם update pending
- מחזיר `'delete'` למeal עם delete pending
- מחזיר null למeal אחרת (לא מבלבל בין meals)

`src/test/offlineCache.test.ts` — הרחבת טסטים:
- `readCache` עם `Infinity` TTL — לא פג תוקף
- כתיבה וקריאה של `PendingOperation[]`

---

### קבצים שנגעים בפאזה 3

```
src/types/index.ts               ← PendingOperation type, PendingOpType
src/lib/i18n.ts                  ← 2 keys חדשים × 2 שפות
src/lib/calculations.ts          ← getMealPendingOp
src/hooks/useMeals.ts            ← updateMeal + deleteMeal עם queue + drainOps
src/components/TodayTab.tsx      ← badge על ארוחה + summary badge
src/test/calculations.test.ts    ← טסטים ל-getMealPendingOp
src/test/offlineCache.test.ts    ← טסטים נוספים
```

---

## סיכום צעדים לפי סדר ביצוע

```
פאזה 1 — Cache קריאה:
  [ ] 1.1  src/lib/offlineCache.ts — readCache, writeCache, clearCache
  [ ] 1.2  src/test/offlineCache.test.ts — 5 טסטים
  [ ] 1.3  useMeals — הוסף cache (userId-scoped, TTL 24h)
  [ ] 1.4  useGoals — הוסף cache (TTL 7d)
  [ ] 1.5  useProfile — הרחב cache קיים
  [ ] 1.6  npx tsc -b && npx vitest run
  [ ] 1.7  deploy

פאזה 2 — Optimistic + Pending add:
  [ ] 2.1  PendingMeal type ב-types/index.ts
  [ ] 2.2  i18n: pendingSyncLabel, pendingMealsCount (he + en)
  [ ] 2.3  mergePendingMeals ב-calculations.ts + טסטים
  [ ] 2.4  useMeals: optimistic insert + pending queue + drain on online
  [ ] 2.5  TodayTab: displayMeals מ-mergePendingMeals + badge UI
  [ ] 2.6  npx tsc -b && npx vitest run
  [ ] 2.7  deploy

פאזה 3 — תור כתיבה מלא (edit + delete):
  [ ] 3.1  PendingOperation type + PendingOpType ב-types/index.ts
  [ ] 3.2  i18n: pendingEditLabel, pendingOpsCount (he + en)
  [ ] 3.3  getMealPendingOp ב-calculations.ts + טסטים
  [ ] 3.4  offlineCache.test.ts: הרחבת טסטים ל-Infinity TTL + PendingOperation[]
  [ ] 3.5  useMeals: updateMeal עם optimistic + queue
  [ ] 3.6  useMeals: deleteMeal עם optimistic + queue
  [ ] 3.7  useMeals: drainOps — drain בחזרת חיבור (merge עם drainPending מפאזה 2)
  [ ] 3.8  TodayTab: badge על ארוחה בעריכה ממתינה + summary badge מאוחד
  [ ] 3.9  npx tsc -b && npx vitest run
  [ ] 3.10 deploy
```

---

## טבלת conflicts — אסטרטגיית "last write wins + silent 404"

| פעולה אופליין | מצב בשרת בזמן sync | תוצאה |
|---|---|---|
| update meal | ארוחה קיימת | עריכה גוברת ✅ |
| update meal | ארוחה נמחקה | הסר מ-state מקומי, הסר מqueue ✅ |
| delete meal | ארוחה קיימת | נמחקת ✅ |
| delete meal | ארוחה כבר נמחקה (404) | treat as success ✅ |
| add meal (פאזה 2) | — | תמיד insert חדש ✅ |

---

> פאזה 1 תפתור את הסצנריו הנפוץ ביותר — פתיחה אחרי שימוש רגיל.  
> פאזה 2 תפתור לוגינג פעיל ללא רשת.  
> פאזה 3 תשלים תמיכה אופליין מלאה לכל פעולות הכתיבה.
