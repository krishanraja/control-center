// Read-only client for the CTRL shared headlines pool (portfolio hive mind).
//
// mm-ctrl's `live-headlines` edge function gathers + cross-verifies a daily
// corroborated AI-news pool into `live_headlines_cache` (one row per day) in the
// CTRL Supabase project. Per spec R5 we READ that pool and never write to it:
// all Content Engine v2 state lives in the OS DB.
//
// Env (Vercel): CTRL_SUPABASE_URL, CTRL_SUPABASE_SERVICE_KEY.

export interface PoolStory {
  day: string           // 'YYYY-MM-DD' (briefing_date)
  headline: string
  say: string | null    // the pool's own "why it matters" line
  source: string | null
  url: string | null
  category: string | null   // one of the nine AI-native lanes
  sourceCount: number | null
}

const CATEGORIES = new Set([
  'model', 'economics', 'tools', 'orchestration', 'product',
  'governance', 'security', 'org', 'proof',
])

function normalizeCard(day: string, card: any): PoolStory | null {
  const headline = typeof card?.headline === 'string' ? card.headline.trim()
    : typeof card?.title === 'string' ? card.title.trim() : ''
  if (!headline) return null
  const category = typeof card?.category === 'string' && CATEGORIES.has(card.category) ? card.category : null
  return {
    day,
    headline,
    say: typeof card?.say === 'string' ? card.say : null,
    source: typeof card?.source === 'string' ? card.source : null,
    url: typeof card?.url === 'string' && /^https?:\/\//.test(card.url) ? card.url : null,
    category,
    sourceCount: Number.isFinite(card?.sourceCount) ? Number(card.sourceCount) : null,
  }
}

export function poolConfigured(): boolean {
  return Boolean(process.env.CTRL_SUPABASE_URL && process.env.CTRL_SUPABASE_SERVICE_KEY)
}

// Fetch pool days since a date (inclusive), oldest first. Tolerates the payload
// being either an array of cards or an envelope with a cards/headlines array.
export async function fetchPoolDays(sinceDate: string): Promise<{ days: number; stories: PoolStory[] }> {
  const url = process.env.CTRL_SUPABASE_URL
  const key = process.env.CTRL_SUPABASE_SERVICE_KEY
  if (!url || !key) return { days: 0, stories: [] }

  const r = await fetch(
    `${url}/rest/v1/live_headlines_cache?select=briefing_date,payload&briefing_date=gte.${sinceDate}&order=briefing_date.asc&limit=40`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  if (!r.ok) throw new Error(`pool_read_${r.status}`)
  const rows = (await r.json()) as Array<{ briefing_date: string; payload: any }>

  const stories: PoolStory[] = []
  for (const row of rows) {
    const p = row.payload
    const cards: any[] = Array.isArray(p) ? p
      : Array.isArray(p?.cards) ? p.cards
      : Array.isArray(p?.headlines) ? p.headlines
      : []
    for (const c of cards) {
      const s = normalizeCard(row.briefing_date, c)
      if (s) stories.push(s)
    }
  }
  return { days: rows.length, stories }
}
