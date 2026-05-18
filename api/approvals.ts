import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

type ApprovalRow = {
  id: string
  source_workflow: string | null
  source_workflow_id: string | null
  draft_id: string | null
  title: string | null
  summary: string | null
  agent_name: string | null
  doc_url: string | null
  payload: unknown
  target_workflow: string | null
  target_webhook_url: string | null
  status: 'pending' | 'approved' | 'rejected' | 'needs-revision'
  feedback: string | null
  telegram_message_id: string | null
  submitted_at: string
  decided_at: string | null
  actor: string | null
  created_at: string
}

function shape(a: ApprovalRow) {
  return {
    id: a.id,
    agent_id: a.source_workflow_id || 'unknown',
    agent_name: a.agent_name || a.source_workflow || 'Unknown',
    type: 'content_approval',
    title: a.title || '(untitled)',
    doc_url: a.doc_url || '',
    status: a.status,
    submitted_at: a.submitted_at,
    feedback: a.feedback,
    approved_at: a.decided_at
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Pending first, newest at top — matches ApprovalPanel rendering order
  const { data: pending, error: pendingErr } = await supabase
    .from('approvals')
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })

  if (pendingErr) {
    return res.status(500).json({ error: pendingErr.message })
  }

  // Resolved: last 10 most recently decided
  const { data: resolved, error: resolvedErr } = await supabase
    .from('approvals')
    .select('*')
    .neq('status', 'pending')
    .order('decided_at', { ascending: false })
    .limit(10)

  if (resolvedErr) {
    console.error('Failed to fetch resolved approvals:', resolvedErr)
  }

  const items = [
    ...((pending || []) as ApprovalRow[]).map(shape),
    ...((resolved || []) as ApprovalRow[]).map(shape)
  ]

  return res.status(200).json({ items, total: items.length })
}
