# ROADMAP — Calorie & Protein Tracker
# תוכנית עבודה — על בסיס ביקורת UI/UX מאי 2026

> **מפתח סימונים**
> - 🔴 בעיה קריטית · 🟠 בעיה בינונית · 🟡 בעיה קטנה
> - 🌟 פיצ'ר עדיפות גבוהה · 🔵 פיצ'ר עדיפות בינונית · ⚪ long-term
> - `[Bx]` = ID בעיה · `[Cx]` = ID פיצ'ר · `[SOLVES Bx]` = הפיצ'ר פותר בעיה קיימת
> - ⏱ = הערכת זמן מימוש

---

## פאזה 0 — Polish מהיר (ניצחונות קלים, אין ארכיטקטורה) ✅ הושלמה
> **רציונל:** כל אחד מהם שעה-שתיים לכל היותר, ישיר למשתמש, לא מחייב refactor.

### 0.1 · Calendar — הדגשת "היום" 🟡 `[B12]` ⏱ 30 דק' ✅
**מה:** בלוח השנה בהיסטוריה — תא של יום נוכחי ללא הדגשה.
**פתרון:** border או dot בצבע accent על תא היום הנוכחי בלבד.
**קובץ:** `HistoryTab.tsx` — תא הcalendar grid.

### 0.2 · Metric persistence בגרפים 🟡 `[B13]` ⏱ 20 דק' ✅
**מה:** בלשונית Stats, בחירת Protein/Fluid/Calories מתאפסת כשמנווטים החוצה.
**פתרון:** שמור בחירה ב-`localStorage` (מפתח `stats-metric`), קרא בעת הrender.
**קובץ:** `HistoryTab.tsx` — קוד ה-metric selector.

### 0.3 · Add Ingredient Modal — סגירה אוטומטית אחרי הוספה 🟡 `[B17]` ⏱ 20 דק' ✅
**מה:** אחרי הוספת מרכיב ל-composed dish, המודל נשאר פתוח — המשתמש סוגר ידנית.
**פתרון:** קרא ל-`setAddIngredientModal(null)` מייד אחרי callback הצלחה.
**קובץ:** `TodayTab.tsx` — handler של add ingredient.

### 0.4 · AI Calc — כפתור "חשב שוב" אחרי חישוב 🟠 `[B3]` ⏱ 45 דק' ✅
**מה:** אחרי שה-AI מחשב, הכפתור נעלם. לא ברור שאפשר לשנות תיאור ולחשב שוב.
**פתרון:** שנה את המצב מ"חשב" ל"חשב שוב" (icon + label שונה) לאחר חישוב מוצלח. לא להסתיר.
**קובץ:** `FoodEntryForm.tsx` — area של כפתור ה-AI calc.

### 0.5 · Log Weight — בולטות ⏱ 20 דק' 🟡 `[B20]` ✅
**מה:** שדה הכנסת משקל קבור בעמוד פרופיל, לא מוצא אותו.
**פתרון:** הוסף אייקון scale/scale_balance ל-label + שנה background של הסקשן לtint קל.
**קובץ:** `SettingsSheet.tsx` — weight log section.

### 0.6 · Donut chart — min-width בiPhone SE 🟡 `[B16]` ⏱ 30 דק' ✅
**מה:** שני donuts זה לצד זה צפופים מדי ב-<375px.
**פתרון:** תחת 380px width → עבור ל-stacked layout (אחד מעל השני) או הצג רק donut אחד עם switcher.
**קובץ:** `DailySummary.tsx` — layout conditional.

---

## פאזה 1 — UX שוטף (נוגע כל יום, ROI גבוה) ✅ הושלמה
> **רציונל:** בעיות שהמשתמש פוגש בכל שימוש. כמה מהן פותרות גם בעיות וגם מוסיפות פיצ'ר.

### 1.1 · Streak Widget גלוי תמיד 🟠+🌟 `[B5, C3]` ⏱ 2-3 שעות ✅
**מה:** ה-streak מחושב אבל נסתר בברכה. משתמש שכיבה ברכה לא רואה אותו בכלל.
**פתרון:** `[SOLVES B5]` הוסף שורת streak ממוקדת מתחת ל-DailySummary — pill קטן עם 🔥 ומספר הימים. גלוי תמיד (גם ללא ברכה). בcalculations.ts הלוגיקה כבר קיימת.
**קבצים:** `TodayTab.tsx` (הצגה) + ייתכן `calculations.ts` (חשיפת פונקציה).
**הערה:** אם streak=0, הסתר. אם streak=1, "יום ראשון 💪".

### 1.2 · Food History Pagination 🟡 `[B14]` ⏱ 1-2 שעות ✅
**מה:** עם 200+ פריטים, ה-food history modal גולל לנצח.
**פתרון:** הצג 30 ראשונים + כפתור "הצג עוד 30". נשמר state בזמן search (search כן מחפש בכולם).
**קבצים:** `FoodHistoryModal.tsx`.

### 1.3 · Unit Selector — קיבוץ לפי סוג 🟠 `[B4]` ⏱ 2 שעות ✅
**מה:** 8 אפשרויות (g, oz, ml, cup, tbsp, tsp, fl_oz, pcs) בlayout אחיד — בלבל בין משקל/נפח/יחידות.
**פתרון:** `<optgroup>` עם 3 קבוצות: **משקל** (g, oz) / **נפח** (ml, fl_oz, cup, tbsp, tsp) / **כמות** (pcs). בעברית: גרמים/נוזל/יחידות.
**קבצים:** `FoodEntryForm.tsx` + `MealCard.tsx` — כל select של unit. i18n keys לoptgroup labels.
**הכנה לפאזה הבאה:** בסיס ל-1.4.

### 1.4 · Quick Weight Edit — inline 🌟 `[C4]` ⏱ 3-4 שעות ✅
**תלוי ב:** 1.3 (unit selector מסודר)
**מה:** לשנות כמות של ארוחה, צריך לפתוח edit mode מלא (3 לחיצות).
**פתרון:** לחיצה על שורת הכמות (`115g | ערב`) בMealCard פותחת popover קטן עם שדה כמות + unit selector בלבד. לחץ Enter/✓ — שמור ורענן. ביטול — Escape.
**קבצים:** `MealCard.tsx` — inline popover component חדש.
**UX:** אנימציית slide-in קטנה, focus על השדה, Escape לביטול.

### 1.5 · Beverage → Fluid Auto-connect 🟠 `[B19]` ⏱ 2 שעות ✅
**מה:** ארוחה מסוג Beverage עם unit=ml לא מחוברת אוטומטית לFluid Tracking.
**פתרון:** כשמשתמש בוחר unit=ml ועוצמת הנוזל > 0 — הגדר `fluid_ml` אוטומטית ואל תדרוש סימון ידני. הסר את ה-"exclude from fluid" toggle בברירת מחדל (הפוך את הלוגיקה: opt-in לhydration, לא opt-out).
**קבצים:** `FoodEntryForm.tsx` — לוגיקת fluid detection.

### 1.6 · Sort + Filter — איחוד ויזואלי 🟡 `[B15]` ⏱ 1 שעה ✅
**מה:** Sort toggle ו-Filter chips יושבים בשני מקומות שונים ברשימת ההיסטוריה.
**פתרון:** הכנס את שניהם לbar אחד קומפקטי. Sort: icon בלבד (arrow_upward/downward). Filter: chips קצרים. שורה אחת.
**קבצים:** `HistoryTab.tsx` — list view header.

---

## פאזה 2 — פיצ'רים מרכזיים חסרים ✅ הושלמה (למעט 2.4)
> **רציונל:** אלה הדברים שמשתמש רציני מרגיש שחסרים אחרי שבוע שימוש.

### 2.1 · עריכת ארוחות מההיסטוריה 🔴 `[B1]` ⏱ 6-8 שעות ✅
**מה:** הבעיה הגדולה ביותר — אין שום דרך לתקן ארוחה מהעבר.
**פתרון:**
1. ב-DayCardContent (הפופאפ שנפתח מהיסטוריה) — הוסף כפתור עיפרון לכל ארוחה.
2. לחיצה פותחת MealCard ב-edit mode (כבר קיים) — אך מחובר לsupabase עם תאריך ה-override.
3. שמירה מעדכנת את המנה ב-supabase ומרעננת את ה-history data.
**קבצים:** `HistoryTab.tsx` (DayCardContent), `MealCard.tsx` (prop `onSave` override), hooks קיימים.
**שים לב:** `useMeals` עובד לפי `today()` — צריך להוסיף `dateOverride` prop לשמירת ארוחה בתאריך אחר.

### 2.2 · Custom Food Library 🌟+🟠 `[C2, B6]` ⏱ 8-10 שעות ✅
**מה:** `[SOLVES B6]` המשתמש לא יכול להוסיף פריטים מותאמים. Library היא קריאה בלבד.
**שלבים:**
1. **Schema:** הוסף `user_food_library` table ב-Supabase: `id, user_id, name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, default_unit, default_amount, created_at`.
2. **Hook:** `useUserFoodLibrary` — fetch/insert/delete.
3. **UI — הוספה:** כפתור "הוסף פריט" בSettings > Food Library → form פשוט (name + values).
4. **UI — שימוש:** ב-FoodEntryForm, בחיפוש — user items מופיעים ראשונים עם תג "שלי".
5. **מחיקה:** ב-Settings > Food Library, כפתור מחיקה לצד כל user item.
**קבצים:** schema migration + `useUserFoodLibrary.ts` + `SettingsSheet.tsx` + `FoodEntryForm.tsx`.

### 2.3 · Undo משופר 🟠+🟠 `[B2, B10]` ⏱ 3 שעות ✅
**מה:** מחיקת היסטוריה = קבועה ללא undo. מחיקת קבוצת ארוחות לא תמיד עם undo.
**שלבים:**
1. הארך חלון undo מ-4 שניות ל-8 שניות (שינוי קל ב-toast config).
2. ב-Settings > Food History — הוסף undo toast זמני (שמור snapshot לפני מחיקה, שחזר אם בוטל).
3. מחיקת כל הארוחות בtype — וודא שה-undo רץ על הכל (כולל composed groups).
**קבצים:** `HistoryTab.tsx`, `SettingsSheet.tsx`, `useToast.ts`.

### ~~2.4 · Weekly Goal Progress Card~~ 🔵 `[C6]` ⏱ 4 שעות ⛔ נדלג
**מה:** Stats מחשב ממוצעים אבל לא מציג progress מול יעד שבועי בצורה ברורה.
**פתרון:** הוסף כרטיס בראש Stats view: "השבוע — X מתוך Y kcal (Z%)". Progress bar עם צבע accent. מתחת: "בקצב הנוכחי, בסוף השבוע תהיה ב-±Xkcal מהיעד".
**קבצים:** `HistoryTab.tsx` — stats view header. `calculations.ts` — `calcWeeklyProjection()`.
> **⛔ נדלג:** `PeriodBalanceCard` (שהיה קיים כבר) כולל בדיוק את זה — הוא מציג צריכה עד כה מול יעד לתקופה + פרויקציה לסוף השבוע/חודש. כפילות מיותרת.

---

## פאזה 3 — Analytics ו-Insights ✅ הושלמה
> **רציונל:** ערך גבוה לטווח ארוך. מחייב שפאזה 2 מוכנה (בעיקר data integrity).

### 3.1 · גרף משקל בפרופיל 🔵 `[C11]` ⏱ 3-4 שעות ✅
**מה:** weight log קיים אבל מוצג רק כרשימה. אין ויזואליזציה.
**פתרון:** sparkline SVG פשוט של 30 הימים האחרונים (עקומה עם נקודות, ללא ציר). מוצג מעל רשימת הרשומות ב-SettingsSheet > Profile.
**קבצים:** `SettingsSheet.tsx` + component חדש `WeightSparkline.tsx`.
**שים לב:** SVG בלבד — אין צורך ב-charting library.

### 3.2 · השוואת תקופות בגרפים 🔵 `[C8]` ⏱ 5 שעות ✅
**מה:** אין context — לא יודעים אם השבוע טוב יחסית לקודם.
**פתרון:** בגרף השבועי/חודשי — הוסף קו/צל של התקופה המקבילה הקודמת (7 ימים אחורה / 30 ימים אחורה). צבע opacity נמוך (var(--border)).
**קבצים:** `HistoryTab.tsx` — chart rendering. `calculations.ts` — data fetch עבור תקופה קודמת.

### 3.3 · Smart Daily Insights 🔵 `[C12]` ⏱ 4 שעות ✅
**מה:** המערכת יודעת הרבה (TDEE, streak, ממוצע שבועי) אבל לא מסבירה כלום.
**פתרון:** "כרטיס insight" אחד מעל רשימת הארוחות ב-Today (ניתן לדחות). דוגמאות:
- "אתמול לא הגעת ליעד החלבון. שקול להוסיף X גרם היום."
- "רצף 5 ימים ✅ — אתה על המסלול!"
- "אכלת פחות מ-1200 kal שלשום — בדוק שזה בכוונה."
אין AI — חישובים בלבד מ-`calculations.ts`.
**קבצים:** `TodayTab.tsx` + `calculations.ts` — `calcDailyInsight()`.

### 3.4 · Delete Food from History — מתוך Entry Form 🔵 `[C10]` ⏱ 1.5 שעות ✅
**מה:** למחוק פריט היסטוריה עכשיו צריך Settings > Food History > גלול > מחק.
**פתרון:** בכרטיס פריט ב-FoodHistoryModal — swipe-to-delete (עם confirm) או כפתור 🗑 גלוי. מחיקה מיידית עם undo toast.
**קבצים:** `FoodHistoryModal.tsx` + `useFoodHistory.ts`.

---

## פאזה 4 — שיפורי חוויה מתקדמים (4.2 בלבד)
> **רציונל:** פיצ'רים שמייחדים את האפליקציה מול מתחרים. מחייבים פאזות 1-3 יציבות.

### ~~4.1 · Meal Templates ("הארוחות שלי")~~ ⚪ `[C13]` ⏱ 8-10 שעות ⛔ נדלג
**מה:** משתמש שאוכל 3 ביצים + cottage בכל בוקר מקליד בכל יום.
**פתרון:** כפתור "שמור כתבנית" בפעולת הבחירה (action bar). תבנית = שם + רשימת ארוחות. לחיצה על תבנית מוסיפה את כולן בבת אחת לסוג הארוחה הנוכחי.
**קבצים:** schema חדש `meal_templates` + `useMealTemplates.ts` + UI בEntry Form.
> **⛔ נדלג:** כפילות — פיצ'ר המנה המורכבת (Composed Meal) כבר פותר בדיוק את זה. המשתמש יוצר מנה מורכבת פעם אחת (שם + מרכיבים), ובפעמים הבאות בוחר אותה מHFood History. אין צורך ב-schema נפרד.

### 4.2 · Export מתקדם — שיתוף גרף 🔵 `[C9]` ⏱ 4 שעות 🔄 בביצוע
**מה:** CSV קיים אבל לא ניתן לשתף snapshot.
**פתרון:** כפתור "שתף" ב-Stats view → `html2canvas` → תמונה של הגרף השבועי לשיתוף (WhatsApp, Notes, אלבום). ב-iOS: Web Share API.
**קבצים:** `HistoryTab.tsx` + תלות חיצונית (`html2canvas` או SVG → PNG).

### ~~4.3 · Push Notifications — תזכורת יומית~~ 🔵 `[C7]` ⏱ 5 שעות ⛔ נדלג
**מה:** PWA תומך ב-Push. "לא רשמת ארוחה מ-6 שעות" — opt-in.
**שלבים:**
1. Request permission (Settings > Preferences).
2. Service Worker: schedule notification עם כוונון שעה (ברירת מחדל: 19:00).
3. Logic: אל תשלח אם המשתמש כבר רשם ארוחה אחרי שעה מסוימת.
**קבצים:** `sw.js`, `SettingsSheet.tsx` — toggle + time picker.
**הערה:** בdeploy — Vercel Edge Functions או Supabase Edge Functions לPush delivery.
> **⛔ נדלג:** PWA Push אינו מעשי כאן — iOS מחייב Add to Home Screen + גרסה 16.4+ ועדיין לא אמין. בנוסף, Web Push API דורש push server עם VAPID keys (Vercel/Supabase Edge Function) — עלות תשתית לא פרופורציונלית לתועלת. Scheduled local notifications (ללא שרת) לא קיימות ב-PWA.

### ~~4.4 · Barcode History~~ 🔵 `[C15]` ⏱ 3 שעות ⛔ נדלג
**מה:** סרקת ברקוד, הוספת מוצר — בפעם הבאה צריך לסרוק שוב.
**פתרון:** שמור בmapping מקומי `barcode → food_history_id` ב-localStorage. בסריקה — בדוק קודם cache מקומי, אם קיים → הצג מיד ללא API call.
**קבצים:** `BarcodeScanner.tsx` + util חדש `barcodeCache.ts`.
> **⛔ נדלג:** ערך נמוך — האפליקציה כולה תלויה בחיבור לרשת ממילא (Supabase realtime, AI, barcode API). מוצר שנסרק שוב מופיע ב-Food History ומשם ניתן לבחור אותו מבלי לסרוק — אין חיסכון אמיתי. כמו כן, history כבר שמור ב-Supabase ולא רק בlocal.

---

## פאזה 5 — Long-term / ניסויי
> **רציונל:** מחייבות מחקר נוסף, תשתית חיצונית, או תלות בפאזות קודמות.

### 5.1 · Nutrition Label OCR ⚪ `[C16]` ⏱ 10+ שעות
**מה:** צילום תווית מזון → OCR → מילוי שדות תזונה אוטומטי.
**פתרון:** שלב עם PhotoNutritionCapture — הוסף מצב "scan label" שמפעיל Groq Vision עם prompt מיוחד לזיהוי טבלאות תזונה.
**קבצים:** `PhotoNutritionCapture.tsx` — mode prop.

### 5.2 · In-History Meal Edit (מלא) 🔴→⚪ `[B1 continuation]` ✅ (חלקי — מחיקה + הוספה לתאריך עבר)
**תלוי ב:** 2.1 (שלב ראשון)
**מה:** שלב 2.1 מממש עריכה בסיסית. שלב זה מוסיף: יצירת ארוחה חדשה לתאריך עבר, מחיקה, שינוי תאריך.
**פתרון:** Entry Sheet שמקבל `dateOverride` prop — מאפשר הוספת ארוחה לתאריך שאינו היום.
> **בוצע:** מחיקת ארוחה מפופאפ היסטוריה (כפתור trash ב-MealCard) + הוספת ארוחה לתאריך עבר (כפתור "+" בפופאפ, פותח FoodEntryForm עם `dateOverride`). שינוי תאריך — נדחה (מורכב, ROI נמוך).

### 5.3 · Social / Sharing Profile ⚪
**מה:** שיתוף ימים / קורבנות עם חברים — optional, opt-in.
**פתרון:** ייתכן בעתיד עם Supabase row-level security + public profile URL.

---

## מפת תלויות

```
פאזה 0 (polish)
    ↓ (לא חובה, אבל מנקה את ה-baseline)
פאזה 1.3 (unit selector) ──→ פאזה 1.4 (quick weight edit)
פאזה 2.2 (custom library) ──→ רלוונטי ל-2.1 (history edit — אותו search)
פאזה 2.1 (history edit) ──────→ פאזה 5.2 (full history edit)
פאזה 2.4 (weekly progress) ──→ פאזה 3.2 (period comparison)
פאזה 3.3 (insights) ──────────→ תלוי ב-2.4 (נתוני שבוע/חודש)
```

---

## הערכת זמן מצטברת

| פאזה | תוכן | זמן מוערך |
|---|---|---|
| 0 | Polish מהיר (6 משימות) | 3-4 שעות |
| 1 | UX שוטף (6 משימות) | 12-15 שעות |
| 2 | פיצ'רים מרכזיים (4 משימות) | 21-25 שעות |
| 3 | Analytics (4 משימות) | 13-15 שעות |
| 4 | חוויה מתקדמת (4 משימות) | 20-22 שעות |
| 5 | Long-term (3 משימות) | 20+ שעות |
| **סה"כ** | | **~90-100 שעות** |

---

## עדיפות מומלצת לפתיחת הsprint הבא

אם שעה אחת — **0.4** (AI Calc כפתור) + **0.2** (Metric persistence) — שניהם 20 דקות.
אם יום שלם — **פאזה 0 כולה** (ניצחון מהיר + baseline נקי).
אם שבוע — **פאזה 0 + 1.1 (Streak) + 1.3 (Unit selector)** — UX שוטף מורגש.
הפיצ'ר הגדול ביותר לROI — **2.1 (עריכה מהיסטוריה)** + **2.2 (Custom Library)** — שבועיים עבודה.
