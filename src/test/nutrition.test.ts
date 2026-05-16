import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// Edge Runtime declares its own process type; match it for test code
declare const process: { env: Record<string, string | undefined> }

// Set env before importing the handler so process.env reads correctly
Object.assign(process.env, {
  GROQ_API_KEY:          'test-groq-key',
  VITE_SUPABASE_URL:     'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  USDA_API_KEY:          'test-usda-key',
  GOOGLE_TRANSLATE_API_KEY: undefined,
})

// Import handler after env is set
const { default: handler } = await import('../../api/nutrition')

// ── Fetch mock helpers ─────────────────────────────────────────────────────────

type GroqResult = { calories: number; protein: number } | null
type USDAResult = { calories: number; protein: number } | null

function makeFetch(opts: {
  supabaseOk?: boolean
  groq?: GroqResult
  usda?: USDAResult
} = {}) {
  const { supabaseOk = true, groq = { calories: 200, protein: 20 }, usda = null } = opts
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const u = String(url)
    if (u.includes('supabase.co/auth/v1/user')) {
      return new Response('{}', { status: supabaseOk ? 200 : 401 })
    }
    if (u.includes('api.groq.com')) {
      if (!groq) return new Response('{}', { status: 500 })
      return new Response(
        JSON.stringify({ choices: [{ message: { content: `{"calories":${groq.calories},"protein":${groq.protein}}` } }] }),
        { status: 200 }
      )
    }
    if (u.includes('api.nal.usda.gov')) {
      if (!usda) return new Response(JSON.stringify({ foods: [] }), { status: 200 })
      return new Response(
        JSON.stringify({
          foods: [{
            foodNutrients: [
              { nutrientName: 'Energy', value: usda.calories },
              { nutrientName: 'Protein', value: usda.protein },
            ],
          }],
        }),
        { status: 200 }
      )
    }
    return new Response('{}', { status: 404 })
  })
}

function req(
  body: unknown,
  { ip = '10.0.0.1', token = 'valid-token', method = 'POST' } = {}
): Request {
  return new Request('https://example.com/api/nutrition', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-real-ip': ip,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

const VALID_BODY = { foodName: 'chicken breast', amount: 150, amountType: 'g' as const }

beforeAll(() => { vi.stubGlobal('fetch', makeFetch()) })
afterEach(() => { vi.restoreAllMocks() })

// ── Method guard ───────────────────────────────────────────────────────────────

describe('method guard', () => {
  it('returns 405 for GET', async () => {
    vi.stubGlobal('fetch', makeFetch())
    const res = await handler(req(null, { method: 'GET' }))
    expect(res.status).toBe(405)
  })
})

// ── Authentication ─────────────────────────────────────────────────────────────

describe('authentication', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const bare = new Request('https://example.com/api/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.2' },
      body: JSON.stringify(VALID_BODY),
    })
    vi.stubGlobal('fetch', makeFetch())
    const res = await handler(bare)
    expect(res.status).toBe(401)
  })

  it('returns 401 when Supabase rejects the token', async () => {
    vi.stubGlobal('fetch', makeFetch({ supabaseOk: false }))
    const res = await handler(req(VALID_BODY, { ip: '10.0.0.3' }))
    expect(res.status).toBe(401)
  })

  it('returns 200 when token is valid', async () => {
    vi.stubGlobal('fetch', makeFetch({ supabaseOk: true }))
    const res = await handler(req(VALID_BODY, { ip: '10.0.0.4' }))
    expect(res.status).toBe(200)
  })
})

// ── Rate limiting ──────────────────────────────────────────────────────────────

describe('rate limiting', () => {
  it('returns 429 with Retry-After after RL_MAX requests from the same IP', async () => {
    const RL_IP = '192.168.99.1' // unique IP for this test
    vi.stubGlobal('fetch', makeFetch())
    // Exhaust the 10-request window
    for (let i = 0; i < 10; i++) {
      await handler(req(VALID_BODY, { ip: RL_IP }))
    }
    const res = await handler(req(VALID_BODY, { ip: RL_IP }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})

// ── Input validation ───────────────────────────────────────────────────────────

describe('input validation', () => {
  beforeAll(() => { vi.stubGlobal('fetch', makeFetch()) })

  it('returns 400 for invalid JSON body', async () => {
    const bad = new Request('https://example.com/api/nutrition', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid-token', 'x-real-ip': '10.1.0.1' },
      body: 'not json',
    })
    const res = await handler(bad)
    expect(res.status).toBe(400)
  })

  it('returns 400 when foodName is missing', async () => {
    vi.stubGlobal('fetch', makeFetch())
    const res = await handler(req({ amount: 100, amountType: 'g' }, { ip: '10.1.0.2' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is zero', async () => {
    vi.stubGlobal('fetch', makeFetch())
    const res = await handler(req({ foodName: 'rice', amount: 0, amountType: 'g' }, { ip: '10.1.0.3' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amount is negative', async () => {
    vi.stubGlobal('fetch', makeFetch())
    const res = await handler(req({ foodName: 'rice', amount: -50, amountType: 'g' }, { ip: '10.1.0.4' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amountType is invalid', async () => {
    vi.stubGlobal('fetch', makeFetch())
    const res = await handler(req({ foodName: 'rice', amount: 100, amountType: 'kg' }, { ip: '10.1.0.5' }))
    expect(res.status).toBe(400)
  })
})

// ── Groq success path ──────────────────────────────────────────────────────────

describe('Groq success path', () => {
  it('scales calories and protein by amount/100 for grams', async () => {
    // Groq returns per-100g: 200 kcal, 20g protein
    // Request: 150g → scale = 1.5 → 300 kcal, 30g protein
    vi.stubGlobal('fetch', makeFetch({ groq: { calories: 200, protein: 20 } }))
    const res = await handler(req({ foodName: 'chicken', amount: 150, amountType: 'g' }, { ip: '10.2.0.1' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.calories).toBe(300)
    expect(data.protein).toBe(30)
  })

  it('scales by amount for unit type', async () => {
    // Groq returns per-1-piece: 80 kcal, 7g protein
    // Request: 2 units → scale = 2 → 160 kcal, 14g protein
    vi.stubGlobal('fetch', makeFetch({ groq: { calories: 80, protein: 7 } }))
    const res = await handler(req({ foodName: 'egg', amount: 2, amountType: 'unit' }, { ip: '10.2.0.2' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.calories).toBe(160)
    expect(data.protein).toBe(14)
  })

  it('returns integer calories and 1-decimal protein', async () => {
    vi.stubGlobal('fetch', makeFetch({ groq: { calories: 133.33, protein: 26.666 } }))
    const res = await handler(req({ foodName: 'salmon', amount: 100, amountType: 'g' }, { ip: '10.2.0.3' }))
    const data = await res.json()
    expect(Number.isInteger(data.calories)).toBe(true)
    expect(String(data.protein).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1)
  })
})

// ── USDA fallback ──────────────────────────────────────────────────────────────

describe('USDA fallback', () => {
  it('uses USDA when Groq returns no valid JSON', async () => {
    vi.stubGlobal('fetch', makeFetch({ groq: null, usda: { calories: 130, protein: 3 } }))
    // 100g → scale = 1
    const res = await handler(req({ foodName: 'white rice', amount: 100, amountType: 'g' }, { ip: '10.3.0.1' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.calories).toBe(130)
    expect(data.protein).toBe(3)
  })

  it('scales USDA result by amount/100', async () => {
    vi.stubGlobal('fetch', makeFetch({ groq: null, usda: { calories: 100, protein: 10 } }))
    const res = await handler(req({ foodName: 'oats', amount: 50, amountType: 'g' }, { ip: '10.3.0.2' }))
    const data = await res.json()
    expect(data.calories).toBe(50)
    expect(data.protein).toBe(5)
  })

  it('skips USDA for unit type and returns 502', async () => {
    vi.stubGlobal('fetch', makeFetch({ groq: null, usda: { calories: 100, protein: 5 } }))
    const res = await handler(req({ foodName: 'apple', amount: 1, amountType: 'unit' }, { ip: '10.3.0.3' }))
    // amountType=unit: no USDA fallback → 502
    expect(res.status).toBe(502)
  })

  it('returns 502 when both Groq and USDA fail', async () => {
    vi.stubGlobal('fetch', makeFetch({ groq: null, usda: null }))
    const res = await handler(req({ foodName: 'unknownfoodxyz', amount: 100, amountType: 'g' }, { ip: '10.3.0.4' }))
    expect(res.status).toBe(502)
  })
})

// ── Hebrew dictionary lookup ───────────────────────────────────────────────────

describe('Hebrew dictionary lookup', () => {
  it('resolves חזה עוף to English before querying Groq', async () => {
    const fetchMock = makeFetch({ groq: { calories: 165, protein: 31 } })
    vi.stubGlobal('fetch', fetchMock)
    const res = await handler(req({ foodName: 'חזה עוף', amount: 100, amountType: 'g' }, { ip: '10.4.0.1' }))
    expect(res.status).toBe(200)
    // Groq should have been called with English (not Hebrew) in the prompt
    const groqCall = fetchMock.mock.calls.find(([url]) => String(url).includes('api.groq.com'))
    expect(groqCall).toBeDefined()
    const groqBody = JSON.parse(groqCall?.[1]?.body as string)
    const userMsg = groqBody.messages.find((m: { role: string }) => m.role === 'user')?.content ?? ''
    expect(userMsg).toContain('chicken breast')
    expect(userMsg).not.toContain('חזה עוף')
  })
})

// ── Missing GROQ_API_KEY ───────────────────────────────────────────────────────

describe('server config', () => {
  it('returns 500 when GROQ_API_KEY is not set', async () => {
    const saved = process.env.GROQ_API_KEY
    delete process.env.GROQ_API_KEY
    vi.stubGlobal('fetch', makeFetch())
    try {
      const res = await handler(req(VALID_BODY, { ip: '10.5.0.1' }))
      expect(res.status).toBe(500)
    } finally {
      process.env.GROQ_API_KEY = saved
    }
  })
})
