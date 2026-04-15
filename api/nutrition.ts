// Vercel Edge Function — Groq proxy
// GROQ_API_KEY lives server-side only (no VITE_ prefix → never bundled to browser)
export const config = { runtime: 'edge' }

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL    = 'llama-3.1-8b-instant'

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
            'You are a nutrition calculator. Return ONLY valid JSON — no markdown, no text, no explanation.\nFormat: {"calories": number, "protein": number}\nCALCULATE FOR THE EXACT QUANTITY GIVEN. Never return per-100g values.',
        },
        {
          role: 'user',
          content: `Food: ${safeName}\n${amountText}\nReturn total calories (kcal) and protein (g) for this exact amount only.`,
        },
      ],
      temperature: 0,
      max_tokens: 100,
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

  return new Response(
    JSON.stringify({
      calories: Math.round(parsed.calories),
      protein:  Math.round(parsed.protein * 10) / 10,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}
