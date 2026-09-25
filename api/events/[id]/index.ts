import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { guard } from '../../_auth.js'
import { computeAxes, SCORE_VERSION } from '../../_eventScore.js'

// GET   /api/events/:id — one event, any column.
// PATCH /api/events/:id — record a decision, an outcome, or a density override.
//
// Mirrors api/visibility-targets/[id]/index.ts: a field whitelist and a value
// whitelist, both enforced server side, because the browser writes here and the
// browser is not the authority on what a column may hold.
//
// The two things worth knowing about this route:
//
// 1. `decision` and `outcome` are the learning loop. A decision says what Krish
//    chose; an outcome says whether the room was worth it afterwards. The
//    outcome is the only signal in the whole lane that comes from the real world
//    rather than from a model, so it is never derived or defaulted.
//
// 2. A density edited by hand is re-mathed here, not stored loose. If Krish
//    says a room is 80 peers rather than 20, draw_score has to move with it or
//    the card would show a judgement its own numbers contradict. The arithmetic
//    is the same computeAxes() the cron uses, so a hand score and a machine
//    score are comparable, and scored_source records which it was so the nightly
//    pass does not quietly overwrite him.

const ALLOWED_DECISION = new Set(['attend', 'apply', 'ask_invite', 'decline', 'ask_someone'])
const ALLOWED_OUTCOME = new Set(['worth_it', 'not_worth_it'])
const ALLOWED_COST = new Set(['free', 'cheap', 'paid', 'unknown'])

const DENSITY_FIELDS = ['peer_density', 'buyer_density', 'practitioner_density', 'vendor_density', 'seniority'] as const

const ALLOWED_FIELDS = new Set<string>([
  'decision', 'outcome', 'outcome_note',
  'can_attend', 'can_speak', 'speak_deadline_at',
  'cost_kind', 'ticket_price_usd', 'venue', 'city',
  'named_attendees', 'score_reason', 'seniority_note',
  ...DENSITY_FIELDS,
])

function isDensity(k: string): boolean {
  return (DENSITY_FIELDS as readonly string[]).includes(k)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && guard(req, res, ['PATCH'])) return

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single()
    if (error) return res.status(404).json({ ok: false, error: error.message })
    return res.json({ ok: true, event: data })
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    let densityTouched = false

    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(k)) continue
      if (k === 'decision' && v !== null && !(typeof v === 'string' && ALLOWED_DECISION.has(v))) {
        return res.status(400).json({ ok: false, error: `invalid decision: ${String(v)}` })
      }
      if (k === 'outcome' && v !== null && !(typeof v === 'string' && ALLOWED_OUTCOME.has(v))) {
        return res.status(400).json({ ok: false, error: `invalid outcome: ${String(v)}` })
      }
      if (k === 'cost_kind' && v !== null && !(typeof v === 'string' && ALLOWED_COST.has(v))) {
        return res.status(400).json({ ok: false, error: `invalid cost_kind: ${String(v)}` })
      }
      if (isDensity(k)) {
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return res.status(400).json({ ok: false, error: `${k} must be 0-100` })
        }
        updates[k] = Math.round(n)
        densityTouched = true
        continue
      }
      updates[k] = v
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'no updatable fields supplied' })
    }

    // Stamp the moment, so the lane can say when he decided rather than only what.
    const now = new Date().toISOString()
    if ('decision' in updates) updates.decided_at = updates.decision ? now : null
    if ('outcome' in updates) updates.outcome_at = updates.outcome ? now : null
    updates.updated_at = now

    // A hand-edited density re-derives both axes from the full set, so the row
    // stays internally consistent and the nightly pass sees a manual score.
    if (densityTouched) {
      const { data: current, error: cErr } = await supabase
        .from('events')
        .select('peer_density, buyer_density, practitioner_density, vendor_density, seniority, named_attendees')
        .eq('id', id)
        .single()
      if (cErr) return res.status(404).json({ ok: false, error: cErr.message })
      const merged = { ...(current as Record<string, unknown>), ...updates } as Record<string, number | string[] | null>
      const axes = computeAxes({
        peer_density: Number(merged.peer_density) || 0,
        buyer_density: Number(merged.buyer_density) || 0,
        practitioner_density: Number(merged.practitioner_density) || 0,
        vendor_density: Number(merged.vendor_density) || 0,
        seniority: Number(merged.seniority) || 0,
        named_attendees: (merged.named_attendees as string[] | null) || null,
      })
      updates.draw_score = axes.draw_score
      updates.demand_score = axes.demand_score
      updates.scored_at = now
      updates.scored_source = 'manual'
      updates.score_version = SCORE_VERSION
    }

    const { data, error } = await supabase.from('events').update(updates).eq('id', id).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, event: data })
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
