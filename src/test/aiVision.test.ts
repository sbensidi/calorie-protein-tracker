import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  photoAnalysisRemaining,
  analyzeNutritionImage,
  AiVisionQuotaError,
  AiRateLimitError,
  AiParseError,
  AiNetworkError,
} from '../lib/aiVision'

// ── localStorage reset between tests ─────────────────────────────────────────
const RL_KEY = 'photo-nutrition-rl'
beforeEach(() => localStorage.removeItem(RL_KEY))

// ── Mock supabase.auth ────────────────────────────────────────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
    },
  },
}))

function mockFetch(response: Partial<Response & { json: () => Promise<unknown> }>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

function mockFetchReject(err: Error) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))
}

// ── Client-side rate limit ────────────────────────────────────────────────────
describe('photoAnalysisRemaining', () => {
  it('returns 5 when no calls made today', () => {
    expect(photoAnalysisRemaining()).toBe(5)
  })

  it('decrements after a successful call', async () => {
    mockFetch({
      ok: true, status: 200,
      headers: { get: () => null } as unknown as Headers,
      json: async () => ({
        identified: 'Chicken breast', calories_per_100g: 165,
        protein_per_100g: 31, fat_per_100g: 3.6, carbs_per_100g: 0, confidence: 'high',
      }),
    })
    await analyzeNutritionImage('validbase64==')
    expect(photoAnalysisRemaining()).toBe(4)
  })

  it('returns 0 after 5 calls', () => {
    localStorage.setItem(RL_KEY, JSON.stringify({ count: 5, resetAt: Date.now() + 86_400_000 }))
    expect(photoAnalysisRemaining()).toBe(0)
  })

  it('resets after resetAt passes', () => {
    localStorage.setItem(RL_KEY, JSON.stringify({ count: 5, resetAt: Date.now() - 1 }))
    expect(photoAnalysisRemaining()).toBe(5)
  })
})

// ── analyzeNutritionImage ─────────────────────────────────────────────────────
describe('analyzeNutritionImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('throws AiVisionQuotaError when client quota is exceeded', async () => {
    localStorage.setItem(RL_KEY, JSON.stringify({ count: 5, resetAt: Date.now() + 86_400_000 }))
    await expect(analyzeNutritionImage('base64==')).rejects.toBeInstanceOf(AiVisionQuotaError)
  })

  it('returns VisionNutritionResult on success', async () => {
    mockFetch({
      ok: true, status: 200,
      headers: { get: () => null } as unknown as Headers,
      json: async () => ({
        identified: 'Apple', calories_per_100g: 52,
        protein_per_100g: 0.3, fat_per_100g: 0.2, carbs_per_100g: 14, confidence: 'high',
      }),
    })
    const result = await analyzeNutritionImage('imgdata==')
    expect(result.identified).toBe('Apple')
    expect(result.calories_per_100g).toBe(52)
    expect(result.protein_per_100g).toBe(0.3)
    expect(result.confidence).toBe('high')
  })

  it('throws AiVisionQuotaError on 429 with X-Quota-Exceeded: groq-free-tier', async () => {
    mockFetch({
      ok: false, status: 429,
      headers: { get: (h: string) => h === 'X-Quota-Exceeded' ? 'groq-free-tier' : null } as unknown as Headers,
      json: async () => ({ error: 'quota' }),
    })
    await expect(analyzeNutritionImage('img==')).rejects.toBeInstanceOf(AiVisionQuotaError)
  })

  it('throws AiRateLimitError on 429 without X-Quota-Exceeded header', async () => {
    mockFetch({
      ok: false, status: 429,
      headers: { get: () => null } as unknown as Headers,
      json: async () => ({ error: 'rate limit' }),
    })
    await expect(analyzeNutritionImage('img==')).rejects.toBeInstanceOf(AiRateLimitError)
  })

  it('throws AiNetworkError on fetch failure', async () => {
    mockFetchReject(new TypeError('Failed to fetch'))
    await expect(analyzeNutritionImage('img==')).rejects.toBeInstanceOf(AiNetworkError)
  })

  it('throws AiParseError when response JSON is missing required fields', async () => {
    mockFetch({
      ok: true, status: 200,
      headers: { get: () => null } as unknown as Headers,
      json: async () => ({ identified: 'Mystery food' }), // missing calories/protein
    })
    await expect(analyzeNutritionImage('img==')).rejects.toBeInstanceOf(AiParseError)
  })

  it('does not increment client counter on failure', async () => {
    mockFetchReject(new TypeError('Network error'))
    await expect(analyzeNutritionImage('img==')).rejects.toBeInstanceOf(AiNetworkError)
    expect(photoAnalysisRemaining()).toBe(5) // unchanged
  })

  it('normalises unknown confidence to "medium"', async () => {
    mockFetch({
      ok: true, status: 200,
      headers: { get: () => null } as unknown as Headers,
      json: async () => ({
        identified: 'Salad', calories_per_100g: 20,
        protein_per_100g: 1, fat_per_100g: null, carbs_per_100g: null,
        confidence: 'very-high', // unexpected — should become 'medium'
      }),
    })
    const result = await analyzeNutritionImage('img==')
    expect(result.confidence).toBe('medium')
  })
})

// resizeImageToBase64 relies on HTMLCanvasElement + URL.createObjectURL,
// neither of which is implemented in jsdom — browser-only, not unit-testable.
