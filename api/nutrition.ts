// Vercel Edge Function — Groq proxy
// GROQ_API_KEY lives server-side only (no VITE_ prefix → never bundled to browser)
export const config = { runtime: 'edge' }

// Edge Runtime exposes process.env but TS doesn't know about it without @types/node
declare const process: { env: Record<string, string | undefined> }

// ── Rate limiting (in-memory per edge instance) ───────────────────────────────
const _rl = new Map<string, { count: number; resetAt: number }>()
const RL_MAX    = 10       // requests
const RL_WINDOW = 60_000   // per 60 seconds

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = _rl.get(ip)
  if (!entry || now > entry.resetAt) {
    _rl.set(ip, { count: 1, resetAt: now + RL_WINDOW })
    return true
  }
  if (entry.count >= RL_MAX) return false
  entry.count++
  return true
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL    = 'llama-3.3-70b-versatile'

// Hebrew → English food lookup (longest key first to prefer specific matches)
const HE_EN: [string, string][] = [
  ['חזה עוף','chicken breast'],['כרעי עוף','chicken drumstick'],['שוקי עוף','chicken drumstick'],
  ['כנפי עוף','chicken wings'],['עוף שלם','whole chicken'],['ירך עוף','chicken thigh'],
  ['פרגית','chicken thigh'],['עוף','chicken'],
  ['בשר טחון','ground beef'],['אנטריקוט','ribeye steak'],['פילה בקר','beef tenderloin'],
  ['שניצל','schnitzel chicken'],['בשר בקר','beef'],['סטייק','beef steak'],
  ['כבש','lamb'],['הודו','turkey breast'],['נקניק','sausage'],['נקניקייה','hot dog'],
  ['טונה בשמן','canned tuna in oil'],['טונה במים','canned tuna in water'],
  ['סלמון','salmon'],['טונה','tuna'],['דניס','sea bass'],['לוקוס','grouper'],
  ['אמנון','tilapia'],['פורל','trout'],['שרימפס','shrimp'],
  ['חלבון ביצה','egg white'],['חלמון ביצה','egg yolk'],['ביצה קשה','hard boiled egg'],
  ['ביצה','egg'],['ביצים','eggs'],
  ['גבינת קוטג','cottage cheese'],['גבינה לבנה','white cheese'],['גבינה צהובה','yellow cheese'],
  ['גבינה בולגרית','bulgarian feta cheese'],['גבינת שמנת','cream cheese'],['גבינה','cheese'],
  ['יוגורט יווני','greek yogurt'],['יוגורט','yogurt'],
  ['חלב מלא','whole milk'],['חלב דל שומן','low fat milk'],['חלב','milk'],
  ['שמנת חמוצה','sour cream'],['שמנת','cream'],['חמאה','butter'],
  ['לחם מחיטה מלאה','whole wheat bread'],['לחם שיפון','rye bread'],['לחם לבן','white bread'],
  ['לחם','bread'],['פיתה מלאה','whole wheat pita'],['פיתה','pita bread'],
  ['אורז לבן','white rice'],['אורז חום','brown rice'],['אורז','rice'],
  ['פסטה מלאה','whole wheat pasta'],['פסטה','pasta'],
  ['קינואה','quinoa'],['שיבולת שועל','oatmeal'],['גרנולה','granola'],
  ['עדשים כתומות','red lentils'],['עדשים','lentils'],
  ['שעועית','kidney beans'],['גרגרי חומוס','chickpeas'],['חומוס','hummus'],['אפונה','green peas'],
  ['תפוח אדמה','potato'],['בטטה','sweet potato'],['ברוקולי','broccoli'],
  ['כרובית','cauliflower'],['עגבניה','tomato'],['מלפפון','cucumber'],['גזר','carrot'],
  ['חסה','lettuce'],['תרד','spinach'],['בצל ירוק','green onion'],['בצל','onion'],
  ['שום','garlic'],['פטריות','mushrooms'],['פטרייה','mushroom'],['פלפל','bell pepper'],
  ['חציל','eggplant'],['קישוא','zucchini'],['תירס','corn'],['אבוקדו','avocado'],['זית','olive'],
  ['תפוח','apple'],['בננה','banana'],['תפוז','orange'],['ענבים','grapes'],
  ['תות','strawberry'],['אבטיח','watermelon'],['מנגו','mango'],['תמר','date'],
  ['שמן זית','olive oil'],['שמן','vegetable oil'],['טחינה','tahini'],
  ['חמאת בוטנים','peanut butter'],['שקדים','almonds'],['אגוזי מלך','walnuts'],
  ['טופו','tofu'],['שוקולד מריר','dark chocolate'],['שוקולד','chocolate'],['דבש','honey'],
]

function lookupHebrew(name: string): string | null {
  if (!/[^\x00-\x7F]/.test(name)) return null
  const t = name.trim()
  const m = HE_EN.find(([k]) => t === k || t.startsWith(k + ' ') || t.includes(' ' + k) || t.includes(k))
  return m ? m[1] : null
}

async function groqCall(apiKey: string, messages: { role: string; content: string }[], maxTokens = 80): Promise<string | null> {
  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0, max_tokens: maxTokens }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? null
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Groq not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { foodName: string; amount: number; amountType: 'g' | 'unit' }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { foodName, amount, amountType } = body
  if (!foodName || typeof amount !== 'number') {
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 })
  }

  const safeName = String(foodName).slice(0, 100).replace(/"/g, '')

  // Step 1 — resolve Hebrew food name to English
  // Priority: dictionary → Google Translate → AI fallback
  let queryName = lookupHebrew(safeName) ?? safeName

  if (queryName === safeName && /[^\x00-\x7F]/.test(safeName)) {
    // Not in dictionary — try Google Translate first
    const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY
    if (googleKey) {
      try {
        const trRes = await fetch(
          `https://translation.googleapis.com/language/translate/v2?key=${googleKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: safeName, source: 'he', target: 'en', format: 'text' }),
          }
        )
        if (trRes.ok) {
          const trData = await trRes.json()
          const gTranslated = trData.data?.translations?.[0]?.translatedText?.trim()
          if (gTranslated && /^[a-zA-Z\s\-']+$/.test(gTranslated) && gTranslated.length < 80) {
            queryName = gTranslated
          }
        }
      } catch { /* fall through to AI */ }
    }

    // AI fallback if Google Translate unavailable or failed
    if (queryName === safeName) {
      const translated = await groqCall(
        apiKey,
        [{ role: 'user', content: `Translate this food name to English (2-4 words max, no punctuation): ${safeName}` }],
        20
      )
      if (translated && /^[a-zA-Z\s\-']+$/.test(translated) && translated.length < 60) {
        queryName = translated
      }
    }
  }

  // Step 2 — nutrition lookup using English name
  const userMsg = amountType === 'unit'
    ? `Per 1 piece of ${queryName}? JSON only: {"calories": number, "protein": number}`
    : `Per 100g of ${queryName}? JSON only: {"calories": number, "protein": number}`

  const text = await groqCall(apiKey, [
    { role: 'system', content: 'You are a nutrition database. Return USDA values as JSON only: {"calories": number, "protein": number}. No other text.' },
    { role: 'user', content: userMsg },
  ])

  let groqCalories: number | null = null
  let groqProtein: number | null = null

  if (text) {
    const match = text.match(/\{[^{}]*"calories"[^{}]*"protein"[^{}]*\}|\{[^{}]*"protein"[^{}]*"calories"[^{}]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (typeof parsed.calories === 'number' && typeof parsed.protein === 'number') {
          groqCalories = parsed.calories
          groqProtein  = parsed.protein
        }
      } catch { /* fall through to USDA */ }
    }
  }

  // Scale Groq result if we have one
  if (groqCalories !== null && groqProtein !== null) {
    const scale = amountType === 'unit' ? amount : amount / 100
    return new Response(
      JSON.stringify({
        calories: Math.round(groqCalories * scale),
        protein:  Math.round(groqProtein  * scale * 10) / 10,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Groq failed — USDA fallback (grams mode only; USDA doesn't do per-piece)
  if (amountType === 'g') {
    const usdaKey = process.env.USDA_API_KEY ?? 'DEMO_KEY'
    try {
      const usdaRes = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(queryName)}&pageSize=1&api_key=${usdaKey}`
      )
      if (usdaRes.ok) {
        const usdaData = await usdaRes.json()
        const food = usdaData.foods?.[0]
        if (food) {
          const nutrients = food.foodNutrients as Array<{ nutrientName: string; value: number }>
          const energyN  = nutrients.find((n: { nutrientName: string }) =>
            n.nutrientName.toLowerCase().includes('energy') && !n.nutrientName.toLowerCase().includes('kj')
          )
          const proteinN = nutrients.find((n: { nutrientName: string }) =>
            n.nutrientName.toLowerCase() === 'protein'
          )
          if (energyN || proteinN) {
            const scale = amount / 100
            return new Response(
              JSON.stringify({
                calories: Math.round((energyN?.value  ?? 0) * scale),
                protein:  Math.round((proteinN?.value ?? 0) * scale * 10) / 10,
              }),
              { headers: { 'Content-Type': 'application/json' } }
            )
          }
        }
      }
    } catch { /* ignore */ }
  }

  return new Response(JSON.stringify({ error: 'No nutrition data found' }), { status: 502 })
}
