import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')

  const { name } = req.query
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'agent name required' })
  }

  const agentName = name.toLowerCase()

  // Fetch agent from DB
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentName)
    .single()

  if (error || !agent) {
    return res.status(404).json({
      error: `Agent not found: ${agentName}`,
      available_agents: ['arlo', 'cleo', 'felix', 'leo', 'marcus', 'maya', 'nell', 'nova', 'priya', 'vera', 'zara', 'agatha', 'marty', 'kai']
    })
  }

  // Fetch agent's tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, priority, urgency')
    .eq('agent', agentName)

  // Fetch Google Drive sync info
  const { data: driveSync } = await supabase
    .from('google_drive_sync')
    .select('doc_id, last_synced, checksum')
    .eq('agent_id', agentName)
    .single()

  return res.json({
    success: true,
    agent: {
      ...agent,
      tasks: tasks || [],
      drive_doc_id: driveSync?.doc_id || null,
      last_brief_sync: driveSync?.last_synced || null,
    },
    source: 'supabase',
    synced_at: new Date().toISOString()
  })
}
