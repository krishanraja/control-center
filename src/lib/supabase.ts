import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function logKrishAction(taskId: string, action: string, agent?: string, notes?: string) {
  await supabase.from('audit_log').insert({
    event_type: 'krish_action',
    actor: 'krish',
    target: taskId,
    details: JSON.stringify({ action, agent: agent || 'unknown', notes: notes || '' })
  })
  fetch('https://krishraja10101.app.n8n.cloud/webhook/mindmaker-orchestrator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'krish_action', agent: agent || 'unknown', taskId, action, notes: notes || '', timestamp: new Date().toISOString() })
  }).catch(() => {})
}
