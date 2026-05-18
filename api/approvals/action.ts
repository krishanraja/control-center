import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

const AGATHA_SECRET = '5fa357ecd8df1b30e508523b7c31d2870731ced4d01187e7'
const ORCHESTRATOR_URL = 'https://krishraja10101.app.n8n.cloud/webhook/mindmaker-orchestrator'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { id, action, feedback } = (req.body || {}) as {
    id?: string
    action?: 'approve' | 'reject' | 'feedback'
    feedback?: string
  }

  if (!id || !action) {
    return res.status(400).json({ error: 'id and action are required' })
  }

  const { data: approval, error: fetchError } = await supabase
    .from('approvals')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !approval) {
    return res.status(404).json({ error: 'Approval not found', detail: fetchError?.message })
  }

  const status =
    action === 'approve' ? 'approved'
    : action === 'reject' ? 'rejected'
    : 'needs-revision'

  const update: Record<string, unknown> = {
    status,
    decided_at: new Date().toISOString()
  }
  if (feedback) update.feedback = feedback

  const { error: updateError } = await supabase
    .from('approvals')
    .update(update)
    .eq('id', id)

  if (updateError) {
    return res.status(500).json({ error: updateError.message })
  }

  const { error: logError } = await supabase
    .from('audit_log')
    .insert({
      event_type: 'krish_' + action,
      actor: 'krish',
      target: id,
      display_message: 'Krish ' + action + 'd via Control Center: ' + (approval.title || id),
      details: JSON.stringify({
        action,
        approval_id: id,
        draft_id: approval.draft_id,
        title: approval.title,
        source_workflow: approval.source_workflow,
        agent_name: approval.agent_name,
        feedback: feedback || null
      })
    })

  if (logError) {
    console.error('Failed to write audit_log:', logError)
  }

  if (action === 'approve' && approval.target_webhook_url) {
    try {
      await fetch(approval.target_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agatha-secret': AGATHA_SECRET
        },
        body: JSON.stringify(approval.payload || {})
      })
    } catch (err) {
      console.error('Failed to forward to target webhook:', err)
    }
  }

  try {
    await fetch(ORCHESTRATOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'krish_approval_action',
        action,
        approval_id: id,
        draft_id: approval.draft_id,
        title: approval.title,
        agent: approval.agent_name || 'unknown',
        source_workflow: approval.source_workflow,
        timestamp: new Date().toISOString()
      })
    })
  } catch (err) {
    console.error('Failed to notify orchestrator:', err)
  }

  return res.status(200).json({
    ok: true,
    id,
    status,
    forwarded: action === 'approve' && !!approval.target_webhook_url
  })
}
