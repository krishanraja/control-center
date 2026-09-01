import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// Bridge candidates are hunter's private judgment about named people in
// Krish's network (path evidence, relationship strength). Like
// contact_intelligence, the tables carry no anon policy at all and are
// reachable only through this gated route. See api/_auth.ts.

export const config = { maxDuration: 30 }

const STATES = new Set(['proposed', 'reached_out', 'snoozed', 'not_a_path'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return

  const state = typeof req.query.state === 'string' && STATES.has(req.query.state)
    ? req.query.state
    : 'proposed'

  try {
    const { data, error } = await supabase
      .from('bridge_candidates')
      .select('bridge_id, job_id, contact_key, path_tier, path_evidence, proximity, bridge_score, draft_ask, state, surfaced_at, state_changed_at')
      .eq('state', state)
      .order('bridge_score', { ascending: false })
      .limit(25)
    if (error) throw new Error(error.message)
    const rows = data || []

    const contactKeys = [...new Set(
      rows.map(b => b.contact_key as string | null)
        .filter((k): k is string => !!k && !k.includes(':')),
    )]
    const jobIds = [...new Set(rows.map(b => b.job_id as string))]

    const [contacts, roles, counts] = await Promise.all([
      contactKeys.length
        ? supabase
          .from('network_contacts')
          .select('contact_key, full_name, current_title, current_company, strength_score')
          .in('contact_key', contactKeys)
        : Promise.resolve({ data: [], error: null }),
      jobIds.length
        ? supabase
          .from('hunter_seen_roles')
          .select('job_id, company, title, url, score')
          .in('job_id', jobIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('bridge_candidates').select('state'),
    ])
    if (contacts.error) throw new Error(contacts.error.message)
    if (roles.error) throw new Error(roles.error.message)

    const byContact = new Map((contacts.data || []).map(c => [c.contact_key as string, c]))
    const byJob = new Map((roles.data || []).map(r => [r.job_id as string, r]))
    const stateCounts: Record<string, number> = {}
    for (const r of counts.data || []) {
      const s = (r as { state?: string }).state || 'proposed'
      stateCounts[s] = (stateCounts[s] || 0) + 1
    }

    const bridges = rows.map(b => ({
      ...b,
      contact: (b.contact_key && byContact.get(b.contact_key as string)) || null,
      role: byJob.get(b.job_id as string) || null,
    }))
    return res.status(200).json({ ok: true, bridges, stateCounts })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'bridges_failed' })
  }
}
