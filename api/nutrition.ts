// Vercel Edge Function — Groq proxy
// GROQ_API_KEY lives server-side only (no VITE_ prefix → never bundled to browser)
export const config = { runtime: 'edge' }

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

  // Step 1 — resolve Hebrew food name to English (dictionary first, AI fallback)
  let queryName = lookupHebrew(safeName) ?? safeName

  if (queryName === safeName && /[^\x00-\x7F]/.test(safeName)) {
    // Not in dictionary — try AI translation
    const translated = await groqCall(
      apiKey,
      [{ role: 'user', content: `Translate this food name to English (2-4 words max, no punctuation): ${safeName}` }],
      20
    )
    if (translated && /^[a-zA-Z\s\-']+$/.test(translated) && translated.length < 60) {
      queryName = translated
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

  if (!text) {
    return new Response(JSON.stringify({ error: 'Empty response' }), { status: 502 })
  }

  const match = text.match(/\{[^{}]*"calories"[^{}]*"protein"[^{}]*\}|\{[^{}]*"protein"[^{}]*"calories"[^{}]*\}/)
  if (!match) {
    return new Response(JSON.stringify({ error: 'Parse error' }), { status: 502 })
  }

  const parsed = JSON.parse(match[0])
  if (typeof parsed.calories !== 'number' || typeof parsed.protein !== 'number') {
    return new Response(JSON.stringify({ error: 'Invalid nutrition data' }), { status: 502 })
  }

  // Model returns per-100g (grams mode) or per-1-piece (unit mode) — scale to actual amount
  const scale = amountType === 'unit' ? amount : amount / 100
  return new Response(
    JSON.stringify({
      calories: Math.round(parsed.calories * scale),
      protein:  Math.round(parsed.protein  * scale * 10) / 10,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
