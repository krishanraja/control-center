// The news-vs-shift separator, ported from mm-ctrl `_shared/news-trends.ts` and
// extended with register matching (persistent shift identity across weeks).
//
// The core conceit, unchanged: the LLM only ARTICULATES candidate shifts over a
// deliberately un-deduped multi-week corpus; a deterministic gate keeps a shift
// only if it provably recurs across >= MIN_DAY_SPAN distinct days AND
// >= MIN_SOURCES distinct sources with >= MIN_EVIDENCE real (non-hallucinated)
// citations. Momentum rewards day-spread and recency so a fading theme cannot
// outrank a live one. Pure module: no I/O, no clients, unit-testable.

export const WINDOW_DAYS = 21
export const MIN_DAY_SPAN = 3
export const MIN_SOURCES = 3
export const MIN_EVIDENCE = 3
export const RECENT_DAYS = 7
export const MAX_CORPUS = 140
export const TARGET_SHIFTS = 5
// Registry matching: a detection attaches to an existing shift instead of
// creating a new one when embeddings agree strongly or titles overlap hard.
export const MATCH_COSINE = 0.86
export const MATCH_TITLE_JACCARD = 0.6
// An active shift with no qualifying evidence for this many days is fading.
export const FADING_AFTER_DAYS = 21

export const SHIFT_CATEGORIES = [
  'model', 'economics', 'tools', 'orchestration', 'product',
  'governance', 'security', 'org', 'proof',
] as const
export type ShiftCategory = typeof SHIFT_CATEGORIES[number]

export interface CorpusItem {
  id: string
  day: string        // 'YYYY-MM-DD'
  category: string | null
  headline: string
  snippet: string | null
  source: string | null
  url: string | null
}

export interface ProposedShift {
  title: string
  summary: string
  implication: string
  category: string
  evidenceIds: string[]
}

export interface VerifiedShift extends ProposedShift {
  category: ShiftCategory
  items: CorpusItem[]
  daySpan: number
  sourceCount: number
  recentCount: number
  momentum: number
}

// Deliberately does NOT dedupe across days: recurrence across days IS the signal
// being measured, so collapsing it would erase trends. Caps to the newest
// MAX_CORPUS items to bound the prompt.
export function buildCorpus(items: CorpusItem[], cap = MAX_CORPUS): CorpusItem[] {
  const sorted = [...items].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
  return sorted.slice(0, cap)
}

export function buildDetectionPrompt(corpus: CorpusItem[], windowDays = WINDOW_DAYS): { system: string; user: string } {
  const system = [
    'You are a strategy analyst for Mindmake, writing for business leaders making real AI decisions.',
    `You are given DATED AI-native news items from the last ${windowDays} days.`,
    `Identify up to ${TARGET_SHIFTS} STRUCTURAL SHIFTS: patterns that recur across many DISTINCT stories over MULTIPLE DAYS and tell a leader how the AI-native world, and therefore how their org, is changing.`,
    'A shift is NOT a single event (one launch, one funding round); it is a movement you can see building across several dated stories.',
    'For each shift produce:',
    '- "title": a short, memorable name for the shift (MAX 9 words), e.g. "The rise of the forward-deployed engineer". No trailing punctuation, no em dashes.',
    '- "summary": what is changing, grounded in the stories (MAX 40 words), plain words, no hype, no em dashes.',
    '- "implication": what a business leader should consider changing about how their org, team or budget is set up for AI (MAX 28 words). Advisory, concrete, no em dashes.',
    `- "category": the single best-fit lane, one of: ${SHIFT_CATEGORIES.join(', ')}.`,
    '- "evidenceIds": the ids (from the input) of the 3-6 stories that evidence this shift. They MUST span at least 3 different "day" values and at least 3 different sources, or do not name the shift.',
    'HONESTY: ground every field strictly in the supplied stories. NEVER invent a fact, number, company or quote. If the stories do not support a durable shift, return fewer shifts (an empty list is acceptable) rather than forcing one.',
    'Reply ONLY with JSON: {"shifts":[{"title":"...","summary":"...","implication":"...","category":"...","evidenceIds":["..."]}]}.',
  ].join('\n')

  const stories = corpus.map(c => ({
    id: c.id, day: c.day, category: c.category,
    headline: c.headline, snippet: (c.snippet || '').slice(0, 160),
  }))
  return { system, user: JSON.stringify({ window_days: windowDays, stories }) }
}

// The confabulation gate. Resolves each cited evidenceId back to a real corpus
// item (hallucinated ids silently dropped), then rejects the shift unless the
// floors hold. One-off events cannot pass: they exist on one day, from one
// cluster of coverage.
export function verifyShift(p: ProposedShift, byId: Map<string, CorpusItem>): VerifiedShift | null {
  if (!p?.title || !p?.summary || !p?.implication) return null
  const category = SHIFT_CATEGORIES.includes(p.category as ShiftCategory) ? (p.category as ShiftCategory) : null
  if (!category) return null

  const items: CorpusItem[] = []
  const seen = new Set<string>()
  for (const id of Array.isArray(p.evidenceIds) ? p.evidenceIds : []) {
    const item = byId.get(String(id))
    if (item && !seen.has(item.id)) { items.push(item); seen.add(item.id) }
  }
  if (items.length < MIN_EVIDENCE) return null

  const days = new Set(items.map(i => i.day))
  // Count distinct ROOT DOMAINS and distinct URLs, never source labels.
  // Three newsletters summarising one press release are three labels but one
  // origin. That is circular reporting, and counting labels let it walk
  // straight through the gate built to stop it. `realSource()` resolves to the
  // newsletter or aggregator, not the publisher, which made the old count
  // actively misleading rather than merely loose.
  // Measured 2026-08-05 on the live register: 42 of 42 shifts passed the label
  // floor, only 25 passed this one.
  // An item with no URL contributes to NEITHER count. An uncitable claim is not
  // a citation, and 124 of 307 evidence rows had no URL at all.
  const domains = new Set(items.map(i => rootDomain(i.url)).filter(Boolean) as string[])
  const urls = new Set(items.map(i => i.url).filter(Boolean) as string[])
  if (days.size < MIN_DAY_SPAN || domains.size < MIN_SOURCES || urls.size < MIN_EVIDENCE) return null

  const newest = items.map(i => i.day).sort().at(-1)!
  const recentFloor = shiftDate(newest, -RECENT_DAYS)
  const recentCount = items.filter(i => i.day >= recentFloor).length

  const daySpan = days.size
  const sourceCount = domains.size
  return {
    ...p, category, items, daySpan, sourceCount, recentCount,
    momentum: computeMomentum(daySpan, sourceCount, recentCount),
  }
}

// Durable AND still moving: day-spread dominates, recent activity keeps a
// fading theme from outranking a live one.
// Root domain of a URL, lowercased, www stripped. Returns null for anything
// unparseable or absent, so callers can filter rather than count a fiction.
export function rootDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return h || null
  } catch {
    return null
  }
}

export function computeMomentum(daySpan: number, sourceCount: number, recentCount: number): number {
  return daySpan * 2 + sourceCount + recentCount
}

export function slugifyShift(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

// Title-token Jaccard: the embedding-free fallback for register matching.
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'for', 'and', 'is', 'are', 'on', 'as', 'rise', 'era'])
export function titleJaccard(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))
  const ta = tok(a), tb = tok(b)
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  return inter / (ta.size + tb.size - inter)
}

function shiftDate(day: string, deltaDays: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}
