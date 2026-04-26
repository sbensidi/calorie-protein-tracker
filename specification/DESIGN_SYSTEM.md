# Design System — Calorie & Protein Tracker

## Navigation Hierarchy

### עיקרון מנחה
**ניווט ראשי = צבע חזק. Toggle פנימי = עדין ונייטרלי.**

המשתמש צריך לדעת בכל רגע *איפה הוא* (ניווט ראשי) ו-*מה הוא מסתכל עליו* (toggle פנימי).  
שני הרמות לא מתחרות — הניווט הראשי תמיד דומיננטי יותר.

---

## Tab Bar ראשי (Primary Navigation)

**שימוש:** היום / היסטוריה

| מצב      | רקע                    | צבע טקסט | צל                              |
|-----------|------------------------|----------|---------------------------------|
| פעיל      | `var(--blue)`          | `#fff`   | `0 2px 10px rgba(59,130,246,.35)` |
| לא פעיל  | `transparent`          | `var(--text-2)` | —                        |
| מיכל     | `var(--inp-bg)`        | —        | `border: 1px solid var(--border)` |

**CSS class:** `.tab-indicator` (pill מונפש), `.tab-btn.active`  
**אנימציה:** `cubic-bezier(.34,1.56,.64,1)` — bounce קל לתחושת ניידות

**Dark mode:** `--blue` = `#3b82f6` — ניגודיות לבן עליו ≈ 3.0 (acceptable לטקסט bold גדול)  
**Light mode:** `--blue` = `#2563eb` — ניגודיות לבן עליו ≈ 4.9 (עובר WCAG AA) ✓

---

## Toggle משני — רמה 2 (Secondary Toggle)

**שימוש:** שבוע / חודש בעמוד הסטטיסטיקות  
**מקור עיצובי:** זהה ל-FAB קלנדר/רשימה/סטטיסטיקה — "blue tint pill"

| מצב     | רקע                        | טקסט            | מסגרת                        | צל                            |
|----------|----------------------------|-----------------|------------------------------|-------------------------------|
| פעיל     | `rgba(59,130,246,0.18)`    | `var(--blue-hi)`| `rgba(59,130,246,0.4)`       | `0 0 14px rgba(59,130,246,.25)` |
| לא פעיל | `transparent`              | `var(--text-3)` | `transparent`                | —                             |
| מיכל    | `var(--bg-card2)`          | —               | `var(--border-hi)`           | `0 2px 8px rgba(0,0,0,.2)` + inset |

**border-radius:** `999px` (pill מלא — כמו FAB)  
**אנימציה:** `transition: all .22s`

**Dark/Light:** כל הטוקנים theme-aware — `--blue-hi`, `--bg-card2`, `--border-hi` מוגדרים לשני המצבים ✓

**Dark mode:** `--bg-card2` = `#141c2d`, `--text` = `#dde4f0` ✓  
**Light mode:** `--bg-card2` = `#eef2f7`, `--text` = `#0f1729` ✓

---

## Toggle שלישוני — רמה 3 (Tertiary Toggle / In-card)

**שימוש:** cal/prot/fluid בתוך כרטיסי גרף

**שימוש:** בחירת מטריקה בתוך כרטיסי הגרף (7-day bar, 30-day line)

| מצב     | רקע                                       | צבע טקסט |
|----------|-------------------------------------------|----------|
| cal פעיל | `var(--blue)`                             | `#fff`   |
| prot פעיל| `var(--green)`                            | `#fff`   |
| fluid פעיל| `var(--blue)`                            | `#fff`   |
| לא פעיל | `transparent`                             | `var(--text-3)` |
| מיכל    | `var(--surface-2)`                        | —        |

> הכלל: toggle **בתוך כרטיס** מקבל צבע ראשי כי הוא שולט על הגרף ישירות — זה פעולה ויזואלית חזקה.  
> toggle **בין תצוגות** (שבוע/חודש) הוא ניווט-עמוד ולכן נייטרלי.

---

## Color Tokens — Dark vs Light

| Token           | Dark                    | Light                   | שימוש                          |
|-----------------|-------------------------|-------------------------|-------------------------------|
| `--blue`        | `#3b82f6`               | `#2563eb`               | CTA, active state, links      |
| `--blue-hi`     | `#60a5fa`               | `#1d4ed8`               | Emphasized values, headings   |
| `--bg-card`     | `#0f1521`               | `#ffffff`               | Card background               |
| `--bg-card2`    | `#141c2d`               | `#eef2f7`               | Secondary card, active pill   |
| `--inp-bg`      | `rgba(255,255,255,.04)` | `rgba(0,0,0,.04)`       | Input & toggle container bg   |
| `--text`        | `#dde4f0`               | `#0f1729`               | Primary text                  |
| `--text-2`      | `#94a8be`               | `#4a5770`               | Secondary text                |
| `--text-3`      | `#6b7f96`               | `#7a8fa6`               | Muted text, placeholders      |
| `--border`      | `rgba(255,255,255,.07)` | `rgba(0,0,0,.08)`       | Default borders               |
| `--border-hi`   | `rgba(255,255,255,.12)` | `rgba(0,0,0,.14)`       | Emphasized borders            |
| `--depth-1`     | `rgba(0,0,0,.10)`       | `rgba(0,0,0,.04)`       | Subtle shadow layer           |
| `--depth-2`     | `rgba(0,0,0,.12)`       | `rgba(0,0,0,.06)`       | Medium shadow layer           |

---

## Spacing (Stats Section)

מבנה כל מקטע (שבוע / חודש) משתמש ב-`flex column, gap: 10px` בין כל האלמנטים הפנימיים:

```
section div (gap: 10)
  ├── header row (title + nav arrows)
  ├── stat cards row (gap: 6)
  ├── chart card (padding: 14px 12px)
  │     ├── chart header (marginBottom: 12)
  │     ├── chart body
  │     └── legend (marginTop: 8, paddingTop: 8, border-top)
  └── insight box
```

הרווח בין מקטע השבוע ומקטע החודש: `gap: 14` (outer flex container) + toggle pill בין השניים.
