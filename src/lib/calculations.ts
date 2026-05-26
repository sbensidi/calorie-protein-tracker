import type { UserProfile } from '../hooks/useProfile'
import type { Meal, DayStats, PendingMeal, PendingOperation } from '../types'

const TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'beverage'] as const

export interface MealTypeSlice {
  type: string
  kcal: number
  pct: number
}

export interface MacroBreakdown {
  proteinPct: number
  fatPct: number
  carbsPct: number
  totalKcal: number
  hasFatCarbs: boolean
  coverage: number
}

// ── getGreeting ───────────────────────────────────────────────────────────────

export interface GreetingContext {
  hour:          number
  firstName:     string | null
  streak:        number
  calsConsumed:  number
  calsGoal:      number
  protConsumed:  number
  protGoal:      number
  fluidMl:       number
  fluidGoalMl:   number
  dayOfYear:     number
  lang:          'he' | 'en'
}

export interface Greeting {
  line1:  string
  line2:  string
  isJoke: boolean
}

function pick<T>(arr: readonly T[], day: number): T { return arr[day % arr.length] }

const PHRASES = {
  he: {
    morning:   ['בוקר טוב', 'בוקר מצוין', 'בוקר אחלה', 'בוקר טוב'],
    afternoon: ['צהריים טובים', 'צהריים טובים'],
    evening:   ['ערב טוב', 'ערב טוב'],
    nightWord: ['לילה טוב', 'לילה טוב'],
    noMealsMorning: [
      'כל היום עוד לפניך — תתחיל בארוחת בוקר טובה',
      'כוס מים ראשונה וכבר התחלת טוב',
      'שלוש ארוחות טובות ואתה מנצח את היום',
      'הגוף שלך מחכה להזנה — תתחיל בקטן',
    ],
    noMealsLate: [
      'עוד לא רשמת ארוחות היום — זה הזמן להתעדכן',
      'אל תשכח לתעד את מה שאכלת — הנתונים עוזרים',
      'תעדכן את הרשומות שלך — כל ארוחה שנרשמת מקרבת אותך ליעד',
    ],
    overGoal: [
      'יום לא מושלם — וזה בסדר גמור. מחר מתחילים מחדש',
      'יום אחד לא שובר שום דבר — הרצף חשוב יותר מהשלמות',
      'כולם חורגים לפעמים. מה שחשוב זה מה שעושים מחר בבוקר',
      'חריגה קורית — אל תיקח את זה קשה, פשוט ממשיכים',
    ],
    overCalProtOk: [
      'הקלוריות קצת חרגו — אבל החלבון של היום היה מושלם',
      'חרגת קצת בקלוריות — הצד החיובי: החלבון היה מדויק',
      'לא מושלם בקלוריות, אבל החלבון ב-100% — זה חשוב',
      'הקלוריות יצאו מעל קצת. מחר מתחדשים — על החלבון כל הכבוד',
    ],
    goalMet: [
      'עמדת ביעד היום — תן לגוף שלך לנוח',
      'עוד יום שבו בחרת בעצמך — מגיע לך',
      'יום מוצלח! עקביות היא הסוד האמיתי',
      'כל הכבוד — זה לא מובן מאליו',
    ],
    calOkUnderProt: [
      'קלוריות בשליטה — עוד {prot} גרם חלבון ואתה שלם ביום',
      'עמדת בקלוריות — הוסף עוד קצת חלבון לפני שהיום נגמר',
      'יפה! הקלוריות מדויקות — החלבון מחכה לעוד {prot} גרם',
      'מחצית הדרך: קלוריות ✓, חלבון עוד {prot} גרם — אתה יכול',
    ],
    streak: [
      '{N} ימים ברצף — זה לא מקרה, זו הרגל',
      '{N} ימים שאתה שומר על עצמך — כל הכבוד',
      'רצף של {N} ימים — שמור על זה היום',
      '{N} ימים ברצף. אתה בונה משהו אמיתי',
    ],
    underProt: [
      'עוד {prot} גרם חלבון ואתה מושלם להיום',
      'קרוב מאוד ליעד החלבון — עוד {prot} גרם',
    ],
    onTrack: [
      'אתה בשליטה — המשך ככה',
      'נשארו לך {cal} קק״ל — עוד יש לאן ללכת',
      'הולך טוב — תמשיך בקצב הזה',
      'על המסלול הנכון — תשמור על זה',
    ],
    nightLine2: [
      'היום מאחורינו — מחר הזדמנות חדשה',
      'תישן טוב — השינה חלק מהתהליך',
      'מה שנעשה נעשה. מחר מתחילים רענן',
    ],
    fluidLow: [
      'עוד לא שתית הרבה — כוס מים עכשיו תשנה את היום',
      'הגוף שלך 60% מים — תזכיר לו את זה',
      'מים לפני אכילה עוזרים לאכול פחות — נסה',
      'כוס מים עכשיו, ואתה כבר על המסלול הנכון',
    ],
    fluidMet: [
      'יעד הנוזלים הושג — הגוף שלך מרוצה',
      'שתית מספיק היום — זה חלק חשוב מהתמונה',
    ],
  },
  en: {
    morning:   ['Good morning', 'Morning', 'Good morning', 'Morning'],
    afternoon: ['Good afternoon', 'Good afternoon'],
    evening:   ['Good evening', 'Good evening'],
    nightWord: ['Good night', 'Good night'],
    noMealsMorning: [
      'The whole day is ahead of you — start with a solid breakfast',
      'A glass of water first, and you\'re already off to a great start',
      'Three good meals and you\'ll own the day',
      'Your body is waiting to be fueled — start small',
    ],
    noMealsLate: [
      'You haven\'t logged any meals today — time to catch up',
      'Don\'t forget to log what you ate — the data helps',
      'Update your log — every meal recorded brings you closer to your goal',
    ],
    overGoal: [
      'Not a perfect day — and that\'s completely fine. Fresh start tomorrow',
      'One day doesn\'t break anything — consistency matters more than perfection',
      'Everyone slips sometimes. What matters is tomorrow morning',
      'It happens — don\'t be hard on yourself, just keep going',
    ],
    overCalProtOk: [
      'Went a bit over on calories — but your protein game was perfect today',
      'Calories drifted a little — on the bright side, protein was spot on',
      'Not perfect on calories, but protein was 100% — that counts for a lot',
      'Calories a touch high, fresh start tomorrow. Great job on protein today',
    ],
    goalMet: [
      'You hit your goal today — let your body rest',
      'Another day where you chose yourself — well done',
      'Successful day! Consistency is the real secret',
      'Well done — this doesn\'t happen by accident',
    ],
    calOkUnderProt: [
      'Calories on point — just {prot}g of protein left to complete your day',
      'Calories ✓ — protein needs a boost, {prot}g to go',
      'Nice! Calories in check — finish strong with {prot}g of protein',
      'Halfway there: calories done, protein still needs {prot}g',
    ],
    streak: [
      '{N} days in a row — that\'s not luck, that\'s a habit',
      '{N} days of taking care of yourself — keep it up',
      '{N}-day streak — protect it today',
      '{N} days in a row. You\'re building something real',
    ],
    underProt: [
      'Just {prot}g of protein away from your goal today',
      'Almost at your protein goal — {prot}g to go',
    ],
    onTrack: [
      'You\'re in control — keep it up',
      '{cal} kcal left for today — plenty of room',
      'Looking good — keep the pace',
      'On track — stay the course',
    ],
    nightLine2: [
      'The day is behind us — tomorrow is a fresh opportunity',
      'Sleep well — rest is part of the process',
      'What\'s done is done. Tomorrow starts fresh',
    ],
    fluidLow: [
      'Haven\'t had much water yet — a glass now changes the day',
      'Your body is 60% water — remind it of that',
      'Drinking water before meals can reduce calories by ~13%',
      'A glass of water now and you\'re already on track',
    ],
    fluidMet: [
      'Fluid goal reached — your body thanks you',
      'Well hydrated today — that\'s part of the full picture',
    ],
  },
} as const

const JOKES = [
  "I'm on a seafood diet. I see food, I eat it",
  "Gym update: went twice this month. Once to sign up, once to cancel",
  "I went on a diet, swore off drinking and heavy eating. In 14 days I lost two weeks",
  "My body is a temple. Ancient, crumbling, and in need of renovation",
  "I eat cake because it's somebody's birthday somewhere",
  "Running from your problems is cardio. It's called multitasking",
  "I tried eating a clock. Very time-consuming, especially if you go back for seconds",
  "What do you call a fake noodle? An impasta",
  "My doctor told me to eat more greens. So I put lettuce on my pizza",
  "I'm trying to lose weight by watching what I eat. Currently watching a cheesecake",
  "Diet tip: your pants won't get tight if you don't wear any",
  "Why did the tomato turn red? It saw the salad dressing",
  "My fitness journey: started with a granola bar. Fueled entirely by granola bars",
  "I told my trainer I wanted abs. He said 'start with water, not beer.' Still thinking about it",
  "I decided to do a juice cleanse. Three hours in I'm a different person. A very hungry person",
  "Six-pack? I prefer to think of it as a keg. More volume, same dedication",
  "I don't skip leg day. I skip all days equally. It's called balance",
  "Why do French fries never get lonely? They come in packs",
  "Why did the banana go to the doctor? It wasn't peeling well",
  "I told my scale we needed to see other people. It said 'good luck finding one that lies less'",
  "Calories don't count on weekends. I didn't make the rules",
  "My meal prep for the week: ordered enough pizza for five days",
  "I started counting macros. Turns out my main macro is regret",
  "Technically, chocolate comes from a bean. So it's basically a salad",
  "My doctor asked if I exercise regularly. I said yes — I push my luck every day",
  "I don't stress eat. I strategically consume comfort nutrients",
  "Why did the cookie go to the doctor? It was feeling crummy",
  "I joined a gym and haven't lost a pound. But I did lose my parking spot, my free time, and my will to go",
  "Eating salad for lunch feels great. Until 10am, when your body realizes what happened",
  "My superpower? I can smell pizza from three floors away",
  "They say abs are made in the kitchen. Mine are apparently made in the bakery",
  "I went vegetarian for a week. The hardest part was telling my family. The second hardest was the bacon",
] as const

export function getGreeting(ctx: GreetingContext): Greeting {
  const { hour, firstName, streak, calsConsumed, calsGoal, protConsumed, protGoal, fluidMl, fluidGoalMl, dayOfYear, lang } = ctx
  const p = PHRASES[lang]

  const timeWord =
    hour < 11 ? pick(p.morning, dayOfYear)
    : hour < 17 ? pick(p.afternoon, dayOfYear)
    : hour < 21 ? pick(p.evening, dayOfYear)
    : pick(p.nightWord, dayOfYear)

  const namePart = firstName ? `, ${firstName}` : ''
  const line1 = `${timeWord}${namePart}!`

  const calsRemaining = calsGoal - calsConsumed
  const protRemaining = Math.round(protGoal - protConsumed)
  const fluidPct      = fluidGoalMl > 0 ? fluidMl / fluidGoalMl : 0

  // joke fires every 4 days, skipped at night
  if (dayOfYear % 4 === 0 && hour < 21) {
    return { line1, line2: `${pick(JOKES, Math.floor(dayOfYear / 4))} 😄`, isJoke: true }
  }

  const calOver  = calsConsumed > calsGoal
  const calDone  = calsRemaining <= calsGoal * 0.1   // within 10% = effectively met
  const protDone = protRemaining <= 0

  let line2: string
  if (hour >= 21) {
    line2 = pick(p.nightLine2, dayOfYear + 7)
  } else if (calsConsumed === 0) {
    line2 = pick(hour < 12 ? p.noMealsMorning : p.noMealsLate, dayOfYear)
  } else if (calOver && protDone) {
    line2 = pick(p.overCalProtOk, dayOfYear)
  } else if (calOver) {
    line2 = pick(p.overGoal, dayOfYear)
  } else if (calDone && protDone) {
    line2 = pick(p.goalMet, dayOfYear)
  } else if (calDone && !protDone) {
    line2 = pick(p.calOkUnderProt, dayOfYear).replace('{prot}', String(Math.max(1, protRemaining)))
  } else if (streak >= 2) {
    line2 = pick(p.streak, dayOfYear).replace('{N}', String(streak))
  } else if (fluidGoalMl > 0 && fluidPct >= 1) {
    line2 = pick(p.fluidMet, dayOfYear)
  } else if (fluidGoalMl > 0 && fluidPct < 0.4 && hour >= 10) {
    line2 = pick(p.fluidLow, dayOfYear)
  } else if (protRemaining > 0 && protRemaining <= 25 && hour >= 17) {
    line2 = pick(p.underProt, dayOfYear).replace('{prot}', String(protRemaining))
  } else {
    line2 = pick(p.onTrack, dayOfYear)
      .replace('{cal}', String(Math.max(0, Math.round(calsRemaining))))
  }

  return { line1, line2, isJoke: false }
}

const ACTIVITY_MULTIPLIERS = [1.2, 1.375, 1.55, 1.725, 1.9]

export function calcBMR(p: UserProfile): number {
  return Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161))
}

export function calcDailyTdee(p: UserProfile): number {
  return Math.round(calcBMR(p) * (ACTIVITY_MULTIPLIERS[p.activityLevel] ?? 1.375))
}

export function calcWeeklyTdee(p: UserProfile): number {
  return calcDailyTdee(p) * 7
}

export type BMICategory = 'underweight' | 'normal' | 'overweight' | 'obese'

export function calcBMI(weight: number, height: number): number {
  return Math.round((weight / ((height / 100) ** 2)) * 10) / 10
}

export function calcBMICategory(bmi: number): BMICategory {
  return bmi < 18.5 ? 'underweight' : bmi < 25 ? 'normal' : bmi < 30 ? 'overweight' : 'obese'
}

export function calcSuggestedFluidMl(weight: number): number {
  return Math.round(weight * 35 / 100) * 100
}

/**
 * Count consecutive days backwards from the day before `referenceDate`
 * where meals were logged (calories > 0) and calories stayed within the goal.
 * Stops at the first gap or day over goal.
 */
export function calcGoalStreak(
  meals: Meal[],
  getGoalForDate: (date: string) => { calories: number },
  referenceDate: Date = new Date(),
): number {
  const byDate = new Map<string, number>()
  meals.forEach(m => { byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.calories) })

  let streak = 0
  const d = new Date(referenceDate)
  d.setDate(d.getDate() - 1)

  for (let i = 0; i < 90; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const cal  = byDate.get(key) ?? 0
    const goal = getGoalForDate(key).calories
    if (cal > 0 && cal <= goal) {
      streak++
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

/**
 * Groups meals by meal_type and returns each type's share of total calories,
 * sorted by descending calorie contribution. Types with 0 calories are omitted.
 */
export function calcMealTypeDistribution(meals: Meal[]): MealTypeSlice[] {
  const totals: Record<string, number> = {}
  for (const m of meals) {
    totals[m.meal_type] = (totals[m.meal_type] ?? 0) + m.calories
  }
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0)
  if (grandTotal === 0) return []
  return TYPE_ORDER
    .filter(type => (totals[type] ?? 0) > 0)
    .map(type => ({ type, kcal: totals[type], pct: Math.round((totals[type] / grandTotal) * 100) }))
    .sort((a, b) => b.kcal - a.kcal)
}

/**
 * Computes macro percentages (protein/fat/carbs as % of total kcal from macros).
 * Fat and carbs are only included when at least 50% of meals have those values.
 * Returns coverage = fraction of meals with fat+carbs data.
 */
export function calcMacroBreakdown(meals: Meal[]): MacroBreakdown {
  if (meals.length === 0) return { proteinPct: 0, fatPct: 0, carbsPct: 0, totalKcal: 0, hasFatCarbs: false, coverage: 0 }
  const withFatCarbs = meals.filter(m => m.fat != null && m.carbs != null)
  const coverage = withFatCarbs.length / meals.length
  const hasFatCarbs = coverage >= 0.5

  const source = hasFatCarbs ? withFatCarbs : meals
  const protKcal  = source.reduce((s, m) => s + m.protein * 4, 0)
  const fatKcal   = hasFatCarbs ? source.reduce((s, m) => s + (m.fat ?? 0) * 9, 0) : 0
  const carbKcal  = hasFatCarbs ? source.reduce((s, m) => s + (m.carbs ?? 0) * 4, 0) : 0
  const totalKcal = protKcal + fatKcal + carbKcal

  if (totalKcal === 0) return { proteinPct: 0, fatPct: 0, carbsPct: 0, totalKcal: 0, hasFatCarbs, coverage }
  return {
    proteinPct: Math.round((protKcal / totalKcal) * 100),
    fatPct:     Math.round((fatKcal  / totalKcal) * 100),
    carbsPct:   Math.round((carbKcal / totalKcal) * 100),
    totalKcal,
    hasFatCarbs,
    coverage,
  }
}

/**
 * Returns the number of days to reach `targetWeight` from `currentWeight`
 * given a daily TDEE and daily calorie goal, or null if the direction
 * doesn't match the deficit/surplus or the difference is too small (<50 kcal/day).
 */
export function calcProjectedDays(
  currentWeight: number,
  targetWeight: number,
  tdeeDaily: number,
  dailyCalGoal: number,
): number | null {
  const dailyDiff = tdeeDaily - dailyCalGoal
  const kgDiff    = targetWeight - currentWeight
  if (Math.abs(dailyDiff) < 50) return null
  // Valid only when directions align: deficit (dailyDiff>0) + want to lose (kgDiff<0),
  // or surplus (dailyDiff<0) + want to gain (kgDiff>0). Same sign = wrong direction.
  if (Math.sign(dailyDiff) === Math.sign(kgDiff)) return null
  return Math.round(Math.abs(kgDiff) * 7700 / Math.abs(dailyDiff))
}

// ── Cooking weight estimation ──────────────────────────────────────────────────
//
// Each ingredient loses or gains weight during cooking (evaporation, absorption).
// The factor table maps ingredient name keywords → cooking factor.
// Calories are conserved (water has 0 kcal); only mass changes.

interface FactorEntry { patterns: string[]; factor: number }

const COOKING_FACTOR_TABLE: FactorEntry[] = [
  // ── Dry carbs (absorb water — factor > 1) ────────────────────────
  { patterns: ['פסטה','ספגטי','פנה','פרפרים','ריגטוני','tagliatelle','pasta','spaghetti','penne','rigatoni','farfalle'], factor: 2.50 },
  { patterns: ['אורז חום','brown rice'], factor: 2.50 },
  { patterns: ['אורז','rice'], factor: 2.80 },
  { patterns: ['קוסקוס','couscous'], factor: 2.20 },
  { patterns: ['קינואה','quinoa'], factor: 2.80 },
  { patterns: ['עדשים','lentil'], factor: 2.50 },
  { patterns: ['שעועית','חומוס יבש','beans'], factor: 2.20 },
  // ── Meat & poultry ───────────────────────────────────────────────
  { patterns: ['תבשיל בקר','נתח','צלי'], factor: 0.70 },
  { patterns: ['חזה עוף','שניצל עוף','chicken breast'], factor: 0.70 },
  { patterns: ['אנטריקוט','סינטה','פילה בקר','בקר','המבורגר','burger'], factor: 0.75 },
  { patterns: ['פרגית','ירך עוף','chicken thigh'], factor: 0.75 },
  { patterns: ['עוף שלם','whole chicken'], factor: 0.75 },
  { patterns: ['קציצ'], factor: 0.80 },
  { patterns: ['נקניקי','sausage'], factor: 0.85 },
  // ── Fish ─────────────────────────────────────────────────────────
  { patterns: ['סלמון','salmon'], factor: 0.80 },
  { patterns: ['טונה טרי','tuna fresh'], factor: 0.75 },
  { patterns: ['דג','בקלה','אמנון','לברק','מוסר','fish','tilapia'], factor: 0.80 },
  // ── Vegetables ───────────────────────────────────────────────────
  { patterns: ['תרד קפוא','ירק קפוא','ברוקולי קפוא','כרובית קפוא'], factor: 0.90 },
  { patterns: ['תרד טרי'], factor: 0.25 },
  { patterns: ['בצל קרמל','caramelized onion'], factor: 0.40 },
  { patterns: ['בצל','onion'], factor: 0.70 },
  { patterns: ['עגבני','tomato'], factor: 0.75 },
  { patterns: ['פטרי','mushroom'], factor: 0.60 },
  { patterns: ['כרובית','ברוקולי','cauliflower','broccoli'], factor: 0.90 },
  { patterns: ['גזר','carrot'], factor: 0.95 },
  { patterns: ['תפוח אדמה','פירה','potato'], factor: 0.95 },
  { patterns: ['בטטה','sweet potato'], factor: 0.85 },
  { patterns: ['ירק','vegetable','veg'], factor: 0.80 },
  // ── Oils & sauces ────────────────────────────────────────────────
  { patterns: ['שמן','oil'], factor: 1.00 },
  { patterns: ['סויה','soy sauce','soy'], factor: 0.80 },
  { patterns: ['maple','syrup','סירופ'], factor: 1.00 },
  { patterns: ['לימון','lemon'], factor: 0.90 },
  { patterns: ['ציר','מרק','broth','stock'], factor: 0.70 },
  { patterns: ['יין','wine'], factor: 0.60 },
  { patterns: ['שמנת','cream'], factor: 0.90 },
  // ── Eggs ─────────────────────────────────────────────────────────
  { patterns: ['חביתה','אומלט','omelette','scrambled'], factor: 0.85 },
  { patterns: ['ביצה','ביצים','egg'], factor: 0.90 },
  // ── Cheese ───────────────────────────────────────────────────────
  { patterns: ['גבינה קשה','hard cheese'], factor: 0.90 },
  { patterns: ['גבינה','cheese'], factor: 0.95 },
]

const DEFAULT_COOKING_FACTOR = 0.85

export interface CookingBreakdownItem {
  name:     string
  rawG:     number   // 0 when unit-based (weight unknown)
  factor:   number
  cookedG:  number
  matched:  boolean  // false = default factor used
  skipped:  boolean  // true = unit-based item, cannot estimate weight
}

export function getCookingFactor(name: string): { factor: number; matched: boolean } {
  const lower = name.toLowerCase()
  for (const entry of COOKING_FACTOR_TABLE) {
    if (entry.patterns.some(p => lower.includes(p.toLowerCase()))) {
      return { factor: entry.factor, matched: true }
    }
  }
  return { factor: DEFAULT_COOKING_FACTOR, matched: false }
}

export function estimateCookedWeight(meals: Meal[]): {
  total: number
  breakdown: CookingBreakdownItem[]
} {
  const breakdown: CookingBreakdownItem[] = meals.map(m => {
    const isFluid   = m.fluid_ml != null && m.fluid_ml > 0
    const isUnit    = m.grams < 0 && !isFluid
    const rawG      = isUnit ? 0 : isFluid ? (m.fluid_ml ?? 0) : m.grams

    if (isUnit) {
      return { name: m.name, rawG: 0, factor: DEFAULT_COOKING_FACTOR, cookedG: 0, matched: false, skipped: true }
    }

    const { factor, matched } = getCookingFactor(m.name)
    return { name: m.name, rawG, factor, cookedG: Math.round(rawG * factor), matched, skipped: false }
  })

  const total = Math.round(breakdown.reduce((s, b) => s + b.cookedG, 0))
  return { total, breakdown }
}

// ── History stats pure helpers ────────────────────────────────────────────────

export function calcDatesAverage(
  dates: string[],
  key: 'totalCalories' | 'totalProtein',
  grouped: Map<string, Pick<DayStats, 'totalCalories' | 'totalProtein'>>,
): number {
  if (dates.length === 0) return 0
  return Math.round(dates.reduce((s, d) => s + (grouped.get(d)?.[key] ?? 0), 0) / dates.length)
}

export function calcGoalMetPct(
  dates: string[],
  grouped: Map<string, Pick<DayStats, 'calOk' | 'protOk'>>,
  key: 'calOk' | 'protOk',
): number {
  if (dates.length === 0) return 0
  const met = dates.filter(d => grouped.get(d)?.[key]).length
  return Math.round(met / dates.length * 100)
}

export function calcFluidAvgMl(
  dates: string[],
  getFluidForDate: (date: string) => number,
): number {
  const daysWithFluid = dates.filter(d => getFluidForDate(d) > 0)
  if (daysWithFluid.length === 0) return 0
  return Math.round(daysWithFluid.reduce((s, d) => s + getFluidForDate(d), 0) / daysWithFluid.length)
}

export function calcFluidGoalPct(
  dates: string[],
  getFluidForDate: (date: string) => number,
  fluidGoalMl: number,
): number {
  if (dates.length === 0) return 0
  const met = dates.filter(d => getFluidForDate(d) >= fluidGoalMl).length
  return Math.round(met / dates.length * 100)
}

// ── calcDailyInsight ──────────────────────────────────────────────────────────

export type DailyInsightKind = 'streak' | 'proteinLow' | 'calLow' | 'calOver'

export interface DailyInsight {
  kind: DailyInsightKind
  n:    number
}

const STREAK_MILESTONES = new Set([3, 5, 7, 14, 21, 30, 60, 90])

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Returns one insight card to show in TodayTab, or null if nothing notable.
 * Priority: very-low-cal > streak milestone > protein-low > over-goal.
 */
export function calcDailyInsight(
  meals:         Meal[],
  goalStreak:    number,
  goalCalories:  number,
  goalProtein:   number,
): DailyInsight | null {
  const yd = new Date()
  yd.setDate(yd.getDate() - 1)
  const yDate   = dateStr(yd)
  const yMeals  = meals.filter(m => m.date === yDate)
  const yCal    = yMeals.reduce((s, m) => s + m.calories, 0)
  const yProt   = yMeals.reduce((s, m) => s + m.protein, 0)

  if (yCal > 0 && yCal < 1200)
    return { kind: 'calLow', n: Math.round(yCal) }

  if (STREAK_MILESTONES.has(goalStreak))
    return { kind: 'streak', n: goalStreak }

  if (yCal > 0 && goalProtein > 0 && yProt < goalProtein * 0.75)
    return { kind: 'proteinLow', n: Math.round(goalProtein - yProt) }

  if (yCal > 0 && goalCalories > 0 && yCal > goalCalories * 1.1)
    return { kind: 'calOver', n: Math.round(yCal - goalCalories) }

  return null
}

/**
 * Merge confirmed server meals with locally-queued pending meals.
 * Pending meals appear first within their date group so the user sees
 * what they just added even while offline.
 */
export function mergePendingMeals(serverMeals: Meal[], pending: PendingMeal[]): Meal[] {
  if (pending.length === 0) return serverMeals
  const asMeals: Meal[] = pending.map(p => ({
    id:             p.pendingId,
    user_id:        '',
    created_at:     new Date(p.queuedAt).toISOString(),
    date:           p.date,
    meal_type:      p.meal_type,
    name:           p.name,
    grams:          p.grams,
    calories:       p.calories,
    protein:        p.protein,
    fat:            p.fat,
    carbs:          p.carbs,
    notes:          p.notes,
    time_logged:    p.time_logged,
    fluid_ml:       p.fluid_ml,
    fluid_excluded: p.fluid_excluded,
    display_unit:   p.display_unit,
    display_amount: p.display_amount,
  }))
  // De-duplicate: drop any server meal whose id matches a pendingId
  // (shouldn't happen, but guards against double-display after drain)
  const pendingIds = new Set(pending.map(p => p.pendingId))
  const filtered   = serverMeals.filter(m => !pendingIds.has(m.id))
  return [...asMeals, ...filtered]
}

/**
 * Returns the most-recent pending op for a given mealId, or null if none.
 * Used by MealCard to show an 'unsaved' badge.
 */
export function getMealPendingOp(mealId: string, ops: PendingOperation[]): PendingOperation | null {
  // Walk backwards so the latest queued op wins
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].mealId === mealId) return ops[i]
  }
  return null
}
