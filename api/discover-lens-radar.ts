import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import {
  JUDGMENT_ECONOMY_LENS,
  lensThemeQueries,
  lensFitScore,
  isOnDirection,
} from './_judgmentLens.js'
import { loadCuratedVoices } from './_creators.js'

// ─────────────────────────────────────────────────────────────────────────────
// discover-lens-radar — the cadenced "judgment economy" content radar.
//
// Runs on a schedule (cron / manual), NOT on rail load. It hunts the wider web
// for topics / POVs / headlines that sit squarely in the lens direction, gates
// them with the deterministic lensFitScore, and writes the survivors to
// lens_seed_candidates. The seed rail then reads that table fast (the lensRadar
// source in _seedSources.ts) and offers them as CANDIDATES Krish one-clicks.
//
// It NEVER writes content_ideas directly: discovery surfaces candidates, it does
// not flood the queue. Honest-by-construction: if nothing fresh clears the
// on-direction bar, it writes nothing.
//
// Cost-disciplined + key-optional: with no EXA_API_KEY it is a graceful no-op.
// Secret-gated so it is not publicly triggerable.
//
// Sources this version uses: Exa neural search over the lens theme queries +
// per-voice author search (the open-web writing of the curated sharp voices).
// The voices now come from the content_creators table (loadCuratedVoices,
// falling back to the hardcoded constant), and the LinkedIn-posts enrichment
// this header once planned shipped as its own route: discover-creator-posts.ts
// scrapes the scrapeable creators weekly via the shared Apify client and
// pushes hard-capped, gated creator_move suggestions into content_ideas.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PER_QUERY = 6
const MAX_VOICES = 6
const MAX_PER_VOICE = 3
const FRESH_DAYS = 30

interface ExaResult {
  title?: string
  url?: string
  text?: string
  publishedDate?: string
  author?: string
}

async function exaSearch(query: string, numResults: number): Promise<ExaResult[]> {
  const key = process.env.EXA_API_KEY
  if (!key) return []
  try {
    const r = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults,
        category: 'news',
        startPublishedDate: new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString(),
        contents: { text: { maxCharacters: 600 } },
      }),
    })
    if (!r.ok) return []
    const j: any = await r.json().catch(() => ({}))
    return Array.isArray(j?.results) ? (j.results as ExaResult[]) : []
  } catch {
    return []
  }
}

const fingerprint = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)

interface Candidate {
  text: string
  sub: string | null
  source_url: string | null
  author: string | null
  origin: 'theme' | 'voice'
  fit_score: number
  occurred_at: string
  fingerprint: string
}

function toCandidate(
  res: ExaResult,
  origin: 'theme' | 'voice',
  voiceName: string | null,
): Candidate | null {
  const title = (res.title || '').trim()
  if (title.length < 12) return null
  const blob = `${title} ${res.text || ''}`
  if (!isOnDirection(blob)) return null
  const occurred_at =
    res.publishedDate && !Number.isNaN(Date.parse(res.publishedDate))
      ? res.publishedDate
      : new Date().toISOString()
  return {
    text: title,
    sub: origin === 'voice' && voiceName ? `voice · ${voiceName}` : 'judgment economy · theme',
    source_url: res.url || null,
    author: voiceName || res.author || null,
    origin,
    fit_score: lensFitScore(blob),
    occurred_at,
    fingerprint: fingerprint(title),
  }
}

function checkSecret(req: VercelRequest): boolean {
  // Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}` on scheduled runs.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`) return true
  const expected = process.env.LENS_RADAR_SECRET
  // If no secret is configured, allow (so a fresh env can dry-run); when set, enforce.
  if (!expected) return true
  const got =
    (req.headers['x-lens-secret'] as string | undefined) ||
    (typeof req.query.secret === 'string' ? req.query.secret : undefined)
  return got === expected
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  if (!checkSecret(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
  if (!process.env.EXA_API_KEY) {
    return res.json({ ok: true, skipped: 'no EXA_API_KEY', written: 0 })
  }

  const dryRun = req.query.dry === '1'

  try {
    const candidates: Candidate[] = []

    // 1) Theme radar — the lens thesis, hunted across the open web.
    for (const q of lensThemeQueries()) {
      const results = await exaSearch(q, MAX_PER_QUERY)
      for (const r of results) {
        const c = toCandidate(r, 'theme', null)
        if (c) candidates.push(c)
      }
    }

    // 2) Voices radar — the curated sharp voices' recent open-web writing.
    const voices = (await loadCuratedVoices()).slice(0, MAX_VOICES)
    for (const v of voices) {
      const results = await exaSearch(`${v.name} AI judgment OR moat OR taste OR expertise`, MAX_PER_VOICE)
      for (const r of results) {
        const c = toCandidate(r, 'voice', v.name)
        if (c) candidates.push(c)
      }
    }

    // Collapse near-duplicate fingerprints, highest fit wins.
    const byFp = new Map<string, Candidate>()
    for (const c of candidates) {
      const prev = byFp.get(c.fingerprint)
      if (!prev || c.fit_score > prev.fit_score) byFp.set(c.fingerprint, c)
    }
    const unique = [...byFp.values()].sort((a, b) => b.fit_score - a.fit_score)

    if (dryRun) {
      return res.json({ ok: true, dryRun: true, found: unique.length, sample: unique.slice(0, 8) })
    }

    // Upsert as NEW candidates; the unique fingerprint index makes re-runs idempotent.
    let written = 0
    if (unique.length > 0) {
      const rows = unique.map((c) => ({
        lens_id: JUDGMENT_ECONOMY_LENS.id,
        text: c.text,
        sub: c.sub,
        source_type: 'lens_radar',
        source_url: c.source_url,
        author: c.author,
        origin: c.origin,
        fit_score: c.fit_score,
        occurred_at: c.occurred_at,
        fingerprint: c.fingerprint,
        status: 'new',
      }))
      const { data, error } = await supabase
        .from('lens_seed_candidates')
        .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
        .select('id')
      if (error) return res.status(500).json({ ok: false, error: error.message })
      written = (data ?? []).length
    }

    return res.json({ ok: true, found: unique.length, written })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'lens radar failed'
    return res.status(500).json({ ok: false, error: message })
  }
}
