import type { FoodLibraryItem } from '../types'

export type MatchConfidence = 'exact' | 'fuzzy'

export interface LibraryMatch {
  item: FoodLibraryItem
  confidence: MatchConfidence
}

function normalize(s: string): string {
  return s.toLowerCase().trim()
}

function tokens(s: string): string[] {
  return s.split(/\s+/).filter(t => t.length >= 3)
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function scoreAgainst(query: string, candidate: string): number {
  const q = normalize(query)
  const c = normalize(candidate)

  // Layer 1: exact
  if (q === c) return 1.0

  // Layer 2: contains
  if (c.includes(q) || q.includes(c)) return 0.85

  // Layer 3: token overlap (tokens ≥ 3 chars)
  const qt = tokens(q)
  const ct = tokens(c)
  if (qt.length > 0 && ct.length > 0) {
    const overlap = qt.filter(t => ct.some(ct => ct.includes(t) || t.includes(ct))).length
    if (overlap > 0) return 0.70
  }

  // Layer 4: prefix/morphological (≥ 3 chars)
  const minLen = Math.min(q.length, c.length)
  if (minLen >= 3 && (q.startsWith(c.slice(0, 3)) || c.startsWith(q.slice(0, 3)))) {
    return 0.65
  }

  // Layer 5: Levenshtein normalized
  const maxLen = Math.max(q.length, c.length)
  if (maxLen === 0) return 0
  const dist = levenshtein(q, c)
  const normalized = 1 - dist / maxLen
  return normalized >= 0.55 ? normalized * 0.55 : 0
}

const THRESHOLD = 0.65

export function fuzzyMatchLibrary(
  query: string,
  library: FoodLibraryItem[],
  lang: 'he' | 'en',
): LibraryMatch | null {
  if (!query.trim() || library.length === 0) return null

  let best: { item: FoodLibraryItem; score: number } | null = null

  for (const item of library) {
    const name = lang === 'he' ? item.name_he : item.name_en
    const altName = lang === 'he' ? item.name_en : item.name_he
    const score = Math.max(scoreAgainst(query, name), scoreAgainst(query, altName) * 0.9)

    if (score >= THRESHOLD && (!best || score > best.score)) {
      best = { item, score }
    }
  }

  if (!best) return null

  return {
    item: best.item,
    confidence: best.score === 1.0 ? 'exact' : 'fuzzy',
  }
}
