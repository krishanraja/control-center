import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * /api/acquisition/sequences — sequence proposal rulings.
 *
 * GET  ?lane=&status=proposed — list sequence proposals.
 * POST { id, action: 'approve' | 'reject' | 'amend', notes?, touches?, name? }
 *      approve → status='approved' (+approved_at/by) — the nurture scheduler
 *                only queues sends from approved sequences.
 *      reject  → status='rejected' (+rejection_reason) + feedback_queue row.
 *      amend   → edit touches/name while still 'proposed' — Krish reshapes the
 *                copy in place, then approves; the amendment is audited so
 *                Vera can learn from the diff.
 * Follows the skill-proposals shape: fetch → status guard 409 → mutate → audit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const lane = typeof req.query.lane === 'string' ? req.query.lane : null
    const status = typeof req.query.status === 'string' ? req.query.status : null
    let q = supabase
      .from('acquisition_sequences')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (lane) q = q.eq('lane', lane)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(200).json({ ok: true, sequences: data || [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as {
    id?: string
    action?: string
    notes?: string
    touches?: Array<Record<string, unknown>>
    name?: string
  }
  if (!body.id) return res.status(400).json({ ok: false, error: 'id required' })
  if (body.action !== 'approve' && body.action !== 'reject' && body.action !== 'amend') {
    return res.status(400).json({ ok: false, error: "action must be 'approve', 'reject' or 'amend'" })
  }

  const { data: seq, error: fetchErr } = await supabase
    .from('acquisition_sequences')
    .select('id, lane, name, sequence_type, frame_version, status, proposed_by, touches')
    .eq('id', body.id)
    .single()
  if (fetchErr || !seq) return res.status(404).json({ ok: false, error: fetchErr?.message || 'not found' })
  if (seq.status !== 'proposed') {
    return res.status(409).json({ ok: false, error: `sequence already ${seq.status}` })
  }

  const nowIso = new Date().toISOString()

  if (body.action === 'amend') {
    if (!Array.isArray(body.touches) && !body.name) {
      return res.status(400).json({ ok: false, error: 'amend requires touches[] and/or name' })
    }
    const patch: Record<string, unknown> = { updated_at: nowIso }
    if (Array.isArray(body.touches)) patch.touches = body.touches
    if (body.name) patch.name = body.name
    const { error: amendErr } = await supabase
      .from('acquisition_sequences')
      .update(patch)
      .eq('id', seq.id)
      .eq('status', 'proposed')
    if (amendErr) return res.status(500).json({ ok: false, error: amendErr.message })
    const { error: logErr } = await supabase.from('audit_log').insert({
      event_type: 'krish_amend_sequence',
      actor: 'krish',
      target: String(seq.id),
      display_message: `Krish amended sequence "${body.name || seq.name}" (${seq.lane}) before ruling`,
      details: JSON.stringify({ id: seq.id, amended_touches: Array.isArray(body.touches) }),
    })
    if (logErr) console.warn('[acquisition/sequences] audit_log insert failed:', logErr.message)
    return res.status(200).json({ ok: true, id: seq.id, status: 'proposed', amended: true })
  }
  const patch =
    body.action === 'approve'
      ? { status: 'approved', approved_by: 'krish', approved_at: nowIso, updated_at: nowIso }
      : { status: 'rejected', rejection_reason: body.notes || 'krish_rejected', updated_at: nowIso }

  const { error: upErr } = await supabase
    .from('acquisition_sequences')
    .update(patch)
    .eq('id', seq.id)
    .eq('status', 'proposed')
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  if (body.action === 'reject') {
    const { error: fbErr } = await supabase.from('feedback_queue').insert({
      source_table: 'acquisition_sequences',
      source_id: String(seq.id),
      agent_id: seq.proposed_by || 'maya',
      vote: 'reject',
      reason_code: 'sequence_rejected',
      reason_text: body.notes || 'Krish rejected sequence proposal',
      status: 'new',
      meta: { lane: seq.lane, sequence_type: seq.sequence_type, frame_version: seq.frame_version },
    })
    if (fbErr) console.warn('[acquisition/sequences] feedback_queue insert failed:', fbErr.message)
  }

  const { error: logErr } = await supabase.from('audit_log').insert({
    event_type: body.action === 'approve' ? 'krish_approve_sequence' : 'krish_reject_sequence',
    actor: 'krish',
    target: String(seq.id),
    display_message: `Krish ${body.action}d sequence "${seq.name}" (${seq.lane} / ${seq.frame_version})`,
    details: JSON.stringify({ id: seq.id, lane: seq.lane, sequence_type: seq.sequence_type, notes: body.notes || null }),
  })
  if (logErr) console.warn('[acquisition/sequences] audit_log insert failed:', logErr.message)

  return res.status(200).json({ ok: true, id: seq.id, status: patch.status })
}
