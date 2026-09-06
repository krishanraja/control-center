import { supabase } from './_supabase.js'
import { JUDGMENT_ECONOMY_LENS, type CuratedVoice } from './_judgmentLens.js'

// The curated-creator registry (content_creators), promoted out of the
// hardcoded curatedVoices array in _judgmentLens.ts on 2026-09-02.
//
// The table is the source of truth; the constant is the bootstrap fallback so
// the lens radar keeps working on a fresh project where the migration has not
// run yet. _judgmentLens.ts itself stays a pure, dependency-free module: this
// file is the only place that joins the lens to the database.

export interface CreatorRow {
  id: string
  slug: string
  name: string
  linkedin_slug: string | null
  linkedin_url: string | null
  why: string
  lens_id: string
  active: boolean
  last_scraped_at: string | null
  last_post_url: string | null
  last_post_at: string | null
  posts_seen: number
  notes: string | null
  created_at: string
  updated_at: string
}

/** Active creators in the CuratedVoice shape the lens consumers expect.
 *  Falls back to the hardcoded constant on error or an empty table, the same
 *  never-hard-depend posture as resolveActors in _apify.ts. */
export async function loadCuratedVoices(): Promise<CuratedVoice[]> {
  try {
    const { data } = await supabase
      .from('content_creators')
      .select('name, linkedin_slug, why')
      .eq('active', true)
      .order('name', { ascending: true })
    const rows = (data ?? []) as Pick<CreatorRow, 'name' | 'linkedin_slug' | 'why'>[]
    const voices: CuratedVoice[] = rows
      .filter(r => r.name && r.why)
      .map(r => ({ name: r.name, linkedin: r.linkedin_slug || undefined, why: r.why }))
    if (voices.length) return voices
  } catch { /* fall through to the constant */ }
  return JUDGMENT_ECONOMY_LENS.curatedVoices
}

/** Creators the scraper can actually reach: active, with a verified LinkedIn
 *  slug. Ordered least-recently-scraped first so the weekly run rotates
 *  through the roster instead of hammering the same profiles. */
export async function loadScrapeableCreators(limit = 5): Promise<CreatorRow[]> {
  const { data, error } = await supabase
    .from('content_creators')
    .select('*')
    .eq('active', true)
    .not('linkedin_slug', 'is', null)
    .order('last_scraped_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as CreatorRow[]
}

/** Record a scrape attempt on the creator row, even when zero posts came back:
 *  a lane that silently stops producing must stay visible in the data. */
export async function markScraped(
  slug: string,
  patch: { lastPostUrl?: string | null; lastPostAt?: string | null; postsFetched?: number },
): Promise<void> {
  try {
    const { data } = await supabase
      .from('content_creators')
      .select('posts_seen')
      .eq('slug', slug)
      .maybeSingle()
    const seen = Number((data as { posts_seen?: number } | null)?.posts_seen) || 0
    const update: Record<string, unknown> = {
      last_scraped_at: new Date().toISOString(),
      posts_seen: seen + Math.max(0, patch.postsFetched ?? 0),
      updated_at: new Date().toISOString(),
    }
    if (patch.lastPostUrl) update.last_post_url = patch.lastPostUrl
    if (patch.lastPostAt) update.last_post_at = patch.lastPostAt
    await supabase.from('content_creators').update(update).eq('slug', slug)
  } catch { /* bookkeeping must never fail the run */ }
}
