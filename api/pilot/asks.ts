import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz, ymdIn } from '../_timezone.js'
import { recordShip } from '../_ships.js'
import { guard } from '../_auth.js'

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
 *       Once today's ask has gone out its wording is fixed: a post that
 *       changes ask_text on a sent ask is refused with 409 already_sent. It
 *       used to overwrite it, so the record said he sent words he never
 *       sent. The check is here and not only in the client, because a second
 *       tab or a second device races any check the client makes.
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

/**
 * True when a post would change the words of an ask that has already gone
 * out. Same words (a retry, or marking it sent again) are not a change;
 * whitespace at the ends is not a change either, since the post is trimmed.
 */
export function rewritesSentAsk(
  existing: { sent_at?: string | null; ask_text?: string | null } | null | undefined,
  askText: string,
): boolean {
  if (!existing || !existing.sent_at) return false
  return (existing.ask_text ?? '').trim() !== askText.trim()
}

/**
 * The columns a post writes. Once the ask has gone out, its prediction is
 * fixed too: learningFor() holds the outcome against the guess he made BEFORE
 * he sent it, so a later post (a retry, a second tab, a body with no
 * prediction at all) must never change or null it. The words are already
 * held by rewritesSentAsk.
 */
export function askWriteFor(
  existing: { sent_at?: string | null } | null | undefined,
  askText: string,
  predicted: number | null,
  markSent: boolean,
  today: string,
  nowIso: string,
): Record<string, unknown> {
  const sent = Boolean(existing?.sent_at)
  return {
    ask_date: today,
    ask_text: askText,
    ...(sent ? {} : { predicted_no_pct: predicted }),
    ...(markSent && !sent ? { sent_at: nowIso } : {}),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && guard(req, res, ['PATCH', 'POST'])) return

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

  const existing = await supabase.from('pilot_asks').select('id, sent_at, ask_text')
    .eq('ask_date', today).maybeSingle()
  if (existing.error) return res.status(500).json({ ok: false, error: existing.error.message })
  if (rewritesSentAsk(existing.data, askText)) {
    return res.status(409).json({
      ok: false,
      error: 'already_sent',
      detail: 'Today\'s ask has already gone out, so its wording stays as it was sent.',
    })
  }

  const row = askWriteFor(existing.data, askText, predicted, markSent, today, new Date().toISOString())

  let saved
  if (existing.data) {
    // The check above read the row; another tab or device can send it before
    // this write lands. So an update to an unsent ask only matches while it
    // is still unsent, and a miss is re-read: the same words are a retry,
    // anything else is the 409 the check above would have given.
    let q = supabase.from('pilot_asks').update(row).eq('id', existing.data.id)
    if (!existing.data.sent_at) q = q.is('sent_at', null)
    const { data, error } = await q.select().maybeSingle()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    if (data) {
      saved = data
    } else {
      const again = await supabase.from('pilot_asks').select('*').eq('id', existing.data.id).maybeSingle()
      if (again.error || !again.data) return res.status(500).json({ ok: false, error: again.error?.message || 'the ask could not be read back' })
      if (rewritesSentAsk(again.data, askText)) {
        return res.status(409).json({
          ok: false,
          error: 'already_sent',
          detail: 'Today\'s ask has already gone out, so its wording stays as it was sent.',
        })
      }
      saved = again.data
    }
  } else {
    const { data, error } = await supabase.from('pilot_asks').insert(row).select().single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    saved = data
  }

  // The send is a ship: it left the machine toward another human. Written
  // server-side with a dedup key so marking twice can never double count, and
  // so the ledger needs no second form for it.
  if (markSent) {
    const ship = await recordShip({ channel: 'ask', description: askText, dedup_key: `ask:${saved.id}` })
    if (!ship.ok) return res.status(500).json({ ok: false, error: ship.error })
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
