import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { runRelevanceSweep, type TableName } from '../_relevance-surfaces.js'

// POST /api/triage/relevance-sweep
//
// HTTP wrapper around scripts/triage/relevance-sweep.ts so the sweep is
// runnable from the browser (Content tab "Sweep triage" button) or any
// curl — no shell needed.
//
// Body:
//   { table: 'content_ideas' | 'leads' | 'guests' | 'visibility_targets' | 'contacts',
//     target?: number = 30,
//     dry?: boolean = true,             // default true — preview before apply
//     relevance?: boolean | null,        // null = surface default (content_ideas: true)
//     min_confidence?: number = 0.7,
//     limit?: number = 5000 }
//
// Returns the structured SweepReport — see api/_relevance-surfaces.ts. The
// preview-then-apply UX is: call with dry=true, show the user the counts +
// 25-card sample, then call with dry=false on confirm.
//
// Idempotent: re-running on a deck that's already at target with no
// off-vertical cards left writes nothing (re-classifies but inserts no
// drops since there's nothing to drop). Safe for the user to double-click.

const ALLOWED: Set<TableName> = new Set([
  'content_ideas', 'leads', 'guests', 'visibility_targets', 'contacts',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const body = (req.body || {}) as {
    table?: string
    target?: number
    dry?: boolean
    relevance?: boolean | null
    min_confidence?: number
    limit?: number
  }

  if (!body.table || !ALLOWED.has(body.table as TableName)) {
    return res.status(400).json({ ok: false, error: `table must be one of ${Array.from(ALLOWED).join(', ')}` })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY || ''
  // We don't hard-fail on a missing key: the orchestrator will skip the
  // relevance pass and just do the volume trim. Surface that in the report.

  try {
    const report = await runRelevanceSweep(supabase, {
      table: body.table as TableName,
      target: Math.max(0, Math.min(500, body.target ?? 30)),
      dry: body.dry !== false,                         // default true
      relevance: typeof body.relevance === 'boolean' ? body.relevance : null,
      minConfidence: Math.max(0, Math.min(1, body.min_confidence ?? 0.7)),
      limit: Math.max(1, Math.min(10_000, body.limit ?? 5000)),
    }, anthropicKey)
    return res.json({ ok: true, ...report })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as any)?.message || e) })
  }
}
