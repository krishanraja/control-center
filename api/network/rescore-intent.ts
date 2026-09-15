import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { readIntent, STANCE_VALUE, STANCE_LABEL, type Stance } from '../_intent.js'
import { classifyIntent } from '../_intentModel.js'

// POST /api/network/rescore-intent  { limit?, after_id?, dry?, min_score? }
//
// Re-judge stored posts without scraping anyone again.
//
// This is what posts_sample is for. Both providers hit hard limits mid-backfill
// — Apify "monthly usage hard limit exceeded", PDL "all matches used" — and the
// classifier had changed twice by then, so several hundred people were carrying
// stances from a model known to be wrong with no way to buy a second look. The
// posts were already on disk. Re-reading them costs one small Haiku call.
//
// It runs as a route rather than a script because the Anthropic key lives in
// the deployment, the same reason repair-names and enrich-person do.
//
// SAFETY: this only ever rewrites the intent columns, and only for people whose
// posts are already stored. It never calls a paid scraper, never touches
// identity columns, and dry is the default.

export const config = { maxDuration: 60 }

interface Body { limit?: number; after_id?: string; dry?: boolean; min_score?: number }

interface Row {
  contact_id: string
  intent_score: number | null
  intent_stance: string | null
  posts_sample: { text?: string; quote?: string; postedAt?: string | null; url?: string | null }[] | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const b = (req.body || {}) as Body
  // Small batches: each person is a model call inside a 60s ceiling.
  const limit = Math.min(Math.max(Number(b.limit) || 20, 1), 40)
  const dry = b.dry !== false
  // Only worth re-reading people the old classifier thought were doing
  // something. A zero was a zero under every version of this.
  const minScore = Number.isFinite(Number(b.min_score)) ? Number(b.min_score) : 1

  let q = supabase
    .from('contact_intelligence')
    .select('contact_id, intent_score, intent_stance, posts_sample')
    .not('posts_sample', 'is', null)
    .gte('intent_score', minScore)
    .order('contact_id', { ascending: true })
    .limit(limit)
  if (b.after_id) q = q.gt('contact_id', b.after_id)

  const { data, error } = await q
  if (error) return res.status(200).json({ ok: false, error: error.message })

  const rows = (data || []) as Row[]
  const changes: { contact_id: string; from: string | null; to: string | null; score: number; quote: string }[] = []
  let examined = 0
  let unchanged = 0
  let unjudged = 0

  for (const row of rows) {
    examined++
    const sample = Array.isArray(row.posts_sample) ? row.posts_sample : []
    // Prefer the whole post. Rows written before the post text was kept have
    // only the quoted sentence, which is thinner context than the classifier
    // deserves — so those are marked and their score is discounted rather than
    // being presented as though they had been read properly.
    const thin = !sample.some(p => typeof p.text === 'string' && p.text.length > 0)
    const posts = sample
      .map(p => ({ text: p.text || p.quote || '', postedAt: p.postedAt ?? null, url: p.url ?? null }))
      .filter(p => p.text)
    if (!posts.length) { unchanged++; continue }

    const pattern = readIntent(posts)
    if (!pattern.all.length) { unchanged++; continue }

    const verdict = await classifyIntent(posts)
    if (!verdict) { unjudged++; continue }

    const top = pattern.all[0]
    const ratio = STANCE_VALUE[verdict.stance] / Math.max(STANCE_VALUE[top.stance as Stance], 1)
    const score = Math.max(0, Math.min(100, Math.round(
      top.score * ratio * (verdict.confidence === 'low' ? 0.7 : 1) * (thin ? 0.85 : 1),
    )))

    if (verdict.stance === row.intent_stance && score === row.intent_score) { unchanged++; continue }

    changes.push({
      contact_id: row.contact_id,
      from: row.intent_stance,
      to: score > 0 ? verdict.stance : null,
      score,
      quote: verdict.quote.slice(0, 120),
    })

    if (!dry) {
      const { error: uerr } = await supabase.from('contact_intelligence').update({
        intent_score: score,
        intent_stance: score > 0 ? verdict.stance : null,
        intent_evidence: score > 0 ? verdict.quote : null,
        intent_summary: score > 0
          ? `${STANCE_LABEL[verdict.stance]}${verdict.reason ? ` — ${verdict.reason}` : ''}`
          : null,
      }).eq('contact_id', row.contact_id)
      if (uerr) return res.status(200).json({ ok: false, error: `${row.contact_id}: ${uerr.message}` })
    }
  }

  return res.status(200).json({
    ok: true,
    dry,
    examined,
    changed: changes.length,
    unchanged,
    unjudged,
    changes: changes.slice(0, 20),
    next_after_id: rows.length === limit ? rows[rows.length - 1].contact_id : null,
  })
}
