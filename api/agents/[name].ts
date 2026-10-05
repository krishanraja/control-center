import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// One agent, as Control Center sees it: the agents row, its open tasks, its
// last runs (workflow_runs, which OpenClaw cron runs also land in since
// 2026-10-05 via the VPS openclaw-runs-to-cc bridge) and its plan.
//
// No Google Drive. Until 2026-10-05 this returned a drive_doc_id from
// google_drive_sync, the per-agent Identity/Action Google Doc mirrors written
// by the VPS sync-to-drive.py. Krish retired those mirrors that day (agents
// report to Control Center, never into his Drive), the table's rows were
// deleted, and Control Center data is the only detail served here.

// A task in one of these states is closed for display. `superseded` is how
// stale agent work is retired without deleting it.
const CLOSED_TASK_STATUSES = ['done', 'superseded']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const { name } = req.query
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'agent name required' })
  }

  const agentName = name.toLowerCase()

  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentName)
    .single()

  if (error || !agent) {
    // The roster is read live, so a retired agent (agents.active=false) is
    // still a valid lookup and a new agent needs no code change here.
    const { data: roster } = await supabase.from('agents').select('id').order('id')
    return res.status(404).json({
      error: `Agent not found: ${agentName}`,
      available_agents: (roster || []).map(r => r.id),
    })
  }

  const [tasksRes, runsRes, planRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, status, priority, urgency, updated_at')
      .eq('agent', agentName)
      .not('status', 'in', `(${CLOSED_TASK_STATUSES.join(',')})`)
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('workflow_runs')
      .select('workflow_id, workflow_name, status, run_at, outcome, error_message')
      .eq('agent_id', agentName)
      .order('run_at', { ascending: false })
      .limit(10),
    supabase
      .from('agent_plans')
      .select('objective, current_phase, next_milestone, progress_pct, updated_at')
      .eq('agent_id', agentName)
      .maybeSingle(),
  ])

  return res.json({
    success: true,
    agent: {
      ...agent,
      tasks: tasksRes.data || [],
      recent_runs: runsRes.data || [],
      plan: planRes.data || null,
    },
    source: 'supabase',
    synced_at: new Date().toISOString(),
  })
}
