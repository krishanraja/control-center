import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// GET /api/hunter/review   what is waiting on Krish in hunter, in one read:
//   toRule     roles on his list with no verdict yet, with the case for each
//   approvals  per job, an application prepared for him and the link that opens
//              it filled in his browser (the extension does the filling)
//   pending    per job, a press he made that hunter has not applied yet
// Read only. Every button that changes something goes through /api/hunter/act.

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return
  try {
    const [roles, approvals, pending] = await Promise.all([
      supabase.from('hunter_seen_roles')
        .select('job_id, company, title, url, job_url, score, location, comp, why_it_fits, presented_at, judge_fit')
        .in('status', ['staging', 'presented'])
        .is('krish_verdict', null)
        .not('presented_at', 'is', null)
        .order('presented_at', { ascending: false })
        .order('score', { ascending: false, nullsFirst: false })
        .limit(60),
      supabase.from('hunter_application_approvals')
        .select('token, job_id, state, sent_at, opened_at, open_key, fill_payload')
        .in('state', ['awaiting', 'approved'])
        .order('sent_at', { ascending: false }),
      supabase.from('hunter_actions')
        .select('id, kind, job_id, payload, requested_at')
        .eq('status', 'queued'),
    ])
    for (const r of [roles, approvals, pending]) if (r.error) throw new Error(r.error.message)

    const open: Record<string, { state: string; sent_at: string | null; opened_at: string | null; open_url: string | null }> = {}
    for (const a of approvals.data || []) {
      const job = a.job_id as string
      if (open[job]) continue // the newest one still in play
      const url = (a.fill_payload as { url?: string } | null)?.url || ''
      open[job] = {
        state: a.state as string, sent_at: a.sent_at as string | null, opened_at: a.opened_at as string | null,
        // The same link the email carries: the posting, and the token and key
        // the extension trades for the filled answers. Without the key it is
        // only the posting.
        open_url: url && a.open_key ? `${url}#hunter=${a.token}.${a.open_key}` : null,
      }
    }
    const waiting: Record<string, { kind: string; payload: unknown; requested_at: string }> = {}
    for (const p of pending.data || []) {
      waiting[p.job_id as string] = { kind: p.kind as string, payload: p.payload, requested_at: p.requested_at as string }
    }
    const toRule = (roles.data || []).map(r => ({
      job_id: r.job_id, company: r.company, title: r.title, url: r.url || r.job_url, score: r.score,
      location: r.location, comp: r.comp, why_it_fits: r.why_it_fits, presented_at: r.presented_at,
      fit: r.judge_fit,
    }))
    return res.status(200).json({ ok: true, toRule, approvals: open, pending: waiting })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'review_failed' })
  }
}
