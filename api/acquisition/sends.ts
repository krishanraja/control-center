import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * /api/acquisition/sends — the send-approval write surface (one endpoint, both verbs).
 *
 * GET  ?lane=&status=queued&limit=50
 *      Queued (or any-status) sends with subject + body for the Growth deck.
 *      Service-role only read: rendered bodies + lead PII never reach the anon client.
 *
 * POST { ids: string[], action: 'approve' | 'reject', reason?: string }
 *      Batch verb from the deck or a single-send decision card.
 *      approve → status='approved' (+approved_at/by), linked legacy approval
 *                task marked done, audit_log, ONE dispatch webhook per batch.
 *      reject  → status='rejected' (+reason), linked task closed,
 *                feedback_queue row per send (fuel for Vera's mechanical
 *                rejection-rate autonomy ladder), audit_log.
 *
 * Idempotent: only rows currently status='queued' transition; replays 409.
 */

const DISPATCH_WEBHOOK =
  process.env.N8N_ACQUISITION_DISPATCH_WEBHOOK_URL ||
  'https://krishraja10101.app.n8n.cloud/webhook/acquisition-send-dispatch'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const lane = typeof req.query.lane === 'string' ? req.query.lane : null
    const status = typeof req.query.status === 'string' ? req.query.status : 'queued'
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    let q = supabase
      .from('acquisition_sends')
      .select('id, lead_id, lane, frame_version, touch_number, rendered_subject, rendered_body, status, sample_required, queued_at, approved_at, approved_by, sent_at, rejection_reason, sequence_id')
      .eq('status', status)
      .order('queued_at', { ascending: true })
      .limit(limit)
    if (lane) q = q.eq('lane', lane)
    const { data, error } = await q
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(200).json({ ok: true, sends: data || [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as { ids?: string[]; action?: string; reason?: string }
  const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string') : []
  const action = body.action
  if (!ids.length) return res.status(400).json({ ok: false, error: 'ids[] required' })
  if (ids.length > 100) return res.status(400).json({ ok: false, error: 'max 100 sends per batch' })
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ ok: false, error: "action must be 'approve' or 'reject'" })
  }

  const { data: rows, error: fetchErr } = await supabase
    .from('acquisition_sends')
    .select('id, lane, frame_version, touch_number, status, approval_task_id, lead_id')
    .in('id', ids)
  if (fetchErr) return res.status(500).json({ ok: false, error: fetchErr.message })

  const queued = (rows || []).filter(r => r.status === 'queued')
  if (!queued.length) {
    return res.status(409).json({ ok: false, error: 'no queued sends matched — already actioned?' })
  }
  const queuedIds = queued.map(r => r.id)
  const nowIso = new Date().toISOString()

  if (action === 'approve') {
    const { error: upErr } = await supabase
      .from('acquisition_sends')
      .update({ status: 'approved', approved_at: nowIso, approved_by: 'krish' })
      .in('id', queuedIds)
      .eq('status', 'queued')
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message })
  } else {
    const { error: upErr } = await supabase
      .from('acquisition_sends')
      .update({
        status: 'rejected',
        approved_by: 'krish',
        rejection_reason: body.reason || 'krish_rejected',
      })
      .in('id', queuedIds)
      .eq('status', 'queued')
    if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

    // Rejection is the autonomy ladder's raw signal: one feedback row per send
    // so Vera's weekly rejection-rate check stays mechanical.
    const feedback = queued.map(r => ({
      source_table: 'acquisition_sends',
      source_id: String(r.id),
      agent_id: 'maya',
      vote: 'reject',
      reason_code: 'nurture_send_rejected',
      reason_text: body.reason || 'Krish rejected nurture send',
      status: 'new',
      meta: { lane: r.lane, frame_version: r.frame_version, touch_number: r.touch_number },
    }))
    const { error: fbErr } = await supabase.from('feedback_queue').insert(feedback)
    if (fbErr) console.warn('[acquisition/sends] feedback_queue insert failed:', fbErr.message)
  }

  // Close the legacy scheduler's approval tasks either way, so the task-branch
  // exclusion lifting never resurfaces a decided send as a task card.
  const taskIds = queued.map(r => r.approval_task_id).filter(Boolean) as string[]
  if (taskIds.length) {
    const { error: taskErr } = await supabase
      .from('tasks')
      .update({ status: 'done', krish_reviewed: true })
      .in('id', taskIds)
    if (taskErr) console.warn('[acquisition/sends] task close failed:', taskErr.message)
  }

  // Audit (best-effort).
  const { error: logErr } = await supabase.from('audit_log').insert({
    event_type: action === 'approve' ? 'krish_approve_sends' : 'krish_reject_sends',
    actor: 'krish',
    target: queuedIds.join(','),
    display_message: `Krish ${action}d ${queuedIds.length} nurture send${queuedIds.length === 1 ? '' : 's'} (${queued[0].lane}) via Growth deck`,
    details: JSON.stringify({ ids: queuedIds, action, reason: body.reason || null }),
  })
  if (logErr) console.warn('[acquisition/sends] audit_log insert failed:', logErr.message)

  // One dispatch ping per approved batch. Best-effort: the dispatcher also
  // sweeps approved sends on a schedule, so a missed webhook only delays.
  let dispatched = false
  if (action === 'approve') {
    try {
      const r = await fetch(DISPATCH_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_ids: queuedIds, source: 'control-center' }),
      })
      dispatched = r.ok
    } catch (e: any) {
      console.warn('[acquisition/sends] dispatch webhook failed:', e?.message)
    }
  }

  return res.status(200).json({
    ok: true,
    action,
    affected: queuedIds.length,
    skipped: ids.length - queuedIds.length,
    dispatched,
  })
}
