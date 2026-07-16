import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { deliverEmailDraft } from '../_emailDraft.js'

/**
 * /api/acquisition/replies — the nurture reply inbox.
 *
 * GET  ?lane=&status=new — inbound replies (service-role: reply bodies are PII).
 * POST { id, action: 'draft_reply' | 'close' }
 *   draft_reply → Cleo email-draft path (deliverEmailDraft). BRAND RULE: the
 *     draft is written in the PRODUCT's voice and signs off as the product
 *     team — the autonomous system never leans on Krish's personal brand in
 *     public. Reply goes out from the product mailbox after review.
 *   close       → status='closed'.
 *
 * Rows are inserted by the n8n reply-intake workflow, which also suppresses
 * the lead's pending sends (a reply always halts the sequence).
 */

// Fallback identities; the canonical source is venture_registry.voice_profile.
const PRODUCT_SENDER: Record<string, string> = {
  mm_ctrl: 'the CTRL team',
  fractionl_pulse: 'the Fractionl Pulse team',
  fractionl_circle: 'the Fractionl Circle team',
  plinth: 'the Plinth team',
  full_time: 'the Full Time team',
}

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
      .from('acquisition_replies')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (lane) q = q.eq('lane', lane)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(200).json({ ok: true, replies: data || [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as { id?: string; action?: string }
  if (!body.id) return res.status(400).json({ ok: false, error: 'id required' })
  if (body.action !== 'draft_reply' && body.action !== 'close') {
    return res.status(400).json({ ok: false, error: "action must be 'draft_reply' or 'close'" })
  }

  const { data: reply, error: fetchErr } = await supabase
    .from('acquisition_replies')
    .select('*')
    .eq('id', body.id)
    .single()
  if (fetchErr || !reply) return res.status(404).json({ ok: false, error: fetchErr?.message || 'not found' })

  const nowIso = new Date().toISOString()

  if (body.action === 'close') {
    const { error } = await supabase
      .from('acquisition_replies')
      .update({ status: 'closed', updated_at: nowIso })
      .eq('id', reply.id)
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(200).json({ ok: true, status: 'closed' })
  }

  if (!reply.from_email) return res.status(400).json({ ok: false, error: 'reply has no from_email' })

  // Load the lane's voice profile — each product speaks its own language.
  const { data: venture } = await supabase
    .from('venture_registry')
    .select('voice_profile')
    .eq('slug', reply.lane)
    .maybeSingle()
  const vp = (venture?.voice_profile || {}) as {
    sender?: string; voice?: string; icp?: string; never_say?: string[]
  }
  const senderIdentity = vp.sender || PRODUCT_SENDER[reply.lane] || 'the product team'
  const { data: lead } = reply.lead_id
    ? await supabase.from('leads').select('full_name, why_relevant, primary_venture').eq('id', reply.lead_id).maybeSingle()
    : { data: null }

  const result = await deliverEmailDraft({
    entity_type: 'lead',
    entity_id: String(reply.lead_id || reply.id),
    recipient_email: reply.from_email,
    recipient_name: lead?.full_name || null,
    venture: reply.lane,
    intent: 'reply_to_nurture_response',
    context: [
      `They replied to a ${reply.lane} nurture email.`,
      reply.subject ? `Their subject: ${reply.subject}` : null,
      `Their message: ${String(reply.body || '').slice(0, 1200)}`,
      lead?.why_relevant ? `Why they captured originally: ${lead.why_relevant}` : null,
    ].filter(Boolean).join('\n'),
    voice_rules: [
      `Write as ${senderIdentity} — the product's own voice, helpful and specific.`,
      vp.voice ? `VOICE: ${vp.voice}` : null,
      vp.icp ? `AUDIENCE: ${vp.icp}` : null,
      vp.never_say?.length ? `NEVER SAY: ${vp.never_say.join(', ')}.` : null,
      'BRAND RULE: never write as, sign as, or reference Krish or any personal brand.',
      `Sign off as ${senderIdentity}. The email goes out from the product mailbox.`,
    ].filter(Boolean).join(' '),
    tone: 'warm',
    length: 'short',
  })

  const { error: upErr } = await supabase
    .from('acquisition_replies')
    .update({ status: 'drafted', updated_at: nowIso })
    .eq('id', reply.id)
  if (upErr) console.warn('[acquisition/replies] status update failed:', upErr.message)

  const { error: logErr } = await supabase.from('audit_log').insert({
    event_type: 'krish_draft_nurture_reply',
    actor: 'krish',
    target: String(reply.id),
    display_message: `Drafted product-brand reply to ${reply.from_email} (${reply.lane})`,
    details: JSON.stringify({ reply_id: reply.id, lane: reply.lane, mode: result.mode }),
  })
  if (logErr) console.warn('[acquisition/replies] audit_log failed:', logErr.message)

  return res.status(200).json({ ok: true, status: 'drafted', ...result })
}
