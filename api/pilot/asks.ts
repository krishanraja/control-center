import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz, ymdIn } from '../_timezone.js'

/**
 * /api/pilot/asks
 *
 * The daily ask: one clean, bounded request per civil day, with the operator's
 * own refusal prediction on record before it goes out. The number one
 * intervention in docs/focus-purpose/OPERATING-MANUAL.md, rendered by the
 * Focus & Purpose home.
 *
 * GET   today's ask row (null until one is committed) plus the single OLDEST
 *       ask from a previous day that was sent and never resolved. One, not a
 *       list: resolving is one tap, and a backlog to scroll is rumination
 *       material. There is deliberately no history endpoint, matching the
 *       worry compiler's no-archive rule.
 *
 * POST  commit or update today's ask. Body: { ask_text, predicted_no_pct? }.
 *       Idempotent per civil day like pilot_checkins: a second post updates
 *       today's row. With { mark_sent: true } it also stamps sent_at and
 *       writes the ships row (channel 'ask', dedup key 'ask:<id>') so the
 *       ledger stays the one place output lands and a retry cannot double
 *       count.
 *
 * PATCH resolve an ask. Body: { id, outcome } with outcome one of
 *       yes | no | alternative | no_reply. 'no_reply' closes the loop after
 *       the follow-up interval; it is a terminal state, not a snooze.
 *
 * Posture matches the rest of the pilot layer: public read, unauthenticated
 * operator writes (the browser cannot hold a secret), service role only ever
 * server-side. Blast radius of the write path is one junk ask row.
 */

const OUTCOMES = new Set(['yes', 'no', 'alternative', 'no_reply'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') return get(req, res)
  if (req.method === 'POST') return post(req, res)
  if (req.method === 'PATCH') return patch(req, res)
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

async function get(req: VercelRequest, res: VercelResponse) {
  const tz = await resolveTz(req)
  const today = ymdIn(new Date(), tz)

  const [todayRes, unresolvedRes] = await Promise.all([
    supabase.from('pilot_asks').select('*').eq('ask_date', today).maybeSingle(),
    // The oldest sent-but-unresolved ask from a PAST day. Today's own ask is
    // excluded: an outcome the same day is recorded from the card itself, and
    // surfacing it twice would turn one ask into two prompts.
    supabase.from('pilot_asks').select('*')
      .not('sent_at', 'is', null).is('resolved_at', null)
      .lt('ask_date', today)
      .order('ask_date', { ascending: true })
      .limit(1).maybeSingle(),
  ])

  const firstError = todayRes.error || unresolvedRes.error
  if (firstError) return res.status(500).json({ ok: false, error: firstError.message })

  return res.json({
    ok: true,
    today_ask: todayRes.data || null,
    unresolved: unresolvedRes.data || null,
    today,
  })
}

async function post(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, unknown>
  const askText = typeof body.ask_text === 'string' ? body.ask_text.trim() : ''
  if (!askText) return res.status(400).json({ ok: false, error: '"ask_text" is required' })

  let predicted: number | null = null
  if (body.predicted_no_pct != null) {
    const n = Math.round(Number(body.predicted_no_pct))
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return res.status(400).json({ ok: false, error: '"predicted_no_pct" must be 0 to 100' })
    }
    predicted = n
  }

  const markSent = body.mark_sent === true
  const tz = await resolveTz(req)
  const today = ymdIn(new Date(), tz)

  const existing = await supabase.from('pilot_asks').select('id, sent_at')
    .eq('ask_date', today).maybeSingle()
  if (existing.error) return res.status(500).json({ ok: false, error: existing.error.message })

  const row = {
    ask_date: today,
    ask_text: askText,
    predicted_no_pct: predicted,
    ...(markSent && !existing.data?.sent_at ? { sent_at: new Date().toISOString() } : {}),
  }

  let saved
  if (existing.data) {
    const { data, error } = await supabase.from('pilot_asks')
      .update(row).eq('id', existing.data.id).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    saved = data
  } else {
    const { data, error } = await supabase.from('pilot_asks').insert(row).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    saved = data
  }

  // The send is a ship: it left the machine toward another human. Written
  // server-side with a dedup key so marking twice can never double count, and
  // so the ledger needs no second form for it.
  if (markSent) {
    const { error } = await supabase.from('ships').upsert({
      occurred_at: new Date().toISOString(),
      source: 'manual' as const,
      channel: 'ask',
      description: askText,
      external_ref: null,
      dedup_key: `ask:${saved.id}`,
    }, { onConflict: 'dedup_key' })
    if (error) return res.status(500).json({ ok: false, error: error.message })
  }

  return res.status(existing.data ? 200 : 201).json({ ok: true, ask: saved })
}

async function patch(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  const outcome = typeof body.outcome === 'string' ? body.outcome : ''
  if (!id) return res.status(400).json({ ok: false, error: '"id" is required' })
  if (!OUTCOMES.has(outcome)) {
    return res.status(400).json({ ok: false, error: '"outcome" must be one of yes, no, alternative, no_reply' })
  }

  const { data, error } = await supabase.from('pilot_asks')
    .update({ outcome, resolved_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, ask: data })
}
