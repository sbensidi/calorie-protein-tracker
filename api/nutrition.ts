// Vercel Edge Function — Groq proxy
// GROQ_API_KEY lives server-side only (no VITE_ prefix → never bundled to browser)
export const config = { runtime: 'edge' }

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL    = 'llama-3.3-70b-versatile'

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

  const amountText = amountType === 'unit'
    ? `Quantity: ${amount} item${amount !== 1 ? 's' : ''}`
    : `Amount: ${amount}g`

  // Sanitize food name
  const safeName = String(foodName).slice(0, 100).replace(/"/g, '')

  const groqRes = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a nutrition expert. Identify the food (translate if needed), then provide accurate USDA nutritional values. ' +
            'Return JSON only: {"food_en": "english name", "calories": number, "protein": number}. No other text.',
        },
        {
          role: 'user',
          content: amountType === 'unit'
            ? `Per 1 piece of ${safeName}?`
            : `Per 100g of ${safeName}?`,
        },
      ],
      temperature: 0,
      max_tokens: 80,
    }),
  })

  if (!groqRes.ok) {
    return new Response(JSON.stringify({ error: `Groq error: ${groqRes.status}` }), { status: 502 })
  }

  const data = await groqRes.json()
  const text = data.choices?.[0]?.message?.content?.trim()
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
