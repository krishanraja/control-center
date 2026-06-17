import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { runDedupBackfill, type DedupTable } from '../_dedup-backfill.js'

// POST /api/dedup/backfill
//
// HTTP wrapper around scripts/dedup/backfill.ts so the cross-surface dedup
// backfill is runnable from the browser — no shell needed.
//
// Body:
//   { table: 'content_ideas' | 'leads' | 'guests' | 'visibility_targets' | 'contacts',
//     dry?: boolean = true,
//     limit?: number = 5000 }
//
// Returns the BackfillReport (see api/_dedup-backfill.ts) with counts +
// 25-group sample. Preview-then-apply: call with dry=true first, then
// dry=false to commit.
//
// This is mechanical-duplicate cleanup — it bypasses feedback_queue because
// dedup is not a learning signal (Vera doesn't need to learn "same URL twice").
// The relevance sweep at /api/triage/relevance-sweep is the learning path.

const ALLOWED: Set<DedupTable> = new Set([
  'content_ideas', 'leads', 'guests', 'visibility_targets', 'contacts',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const body = (req.body || {}) as { table?: string; dry?: boolean; limit?: number }
  if (!body.table || !ALLOWED.has(body.table as DedupTable)) {
    return res.status(400).json({ ok: false, error: `table must be one of ${Array.from(ALLOWED).join(', ')}` })
  }
  try {
    const report = await runDedupBackfill(supabase, {
      table: body.table as DedupTable,
      dry: body.dry !== false,
      limit: Math.max(1, Math.min(10_000, body.limit ?? 5000)),
    })
    return res.json({ ok: true, ...report })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as any)?.message || e) })
  }
}
