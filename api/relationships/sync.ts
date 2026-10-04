import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { syncAccount, type SyncResult } from '../_relationshipSync.js'

// GET  /api/relationships/sync              (cron) every connected account
// POST /api/relationships/sync?account=...  (backfill) one account, one slice
//
// Reads Krish's own mail and calendars for who he talks to and meets, as
// counts and dates only (see api/_relationshipSync.ts), then recomputes warmth
// and reciprocity on contact_intelligence. Each call advances each account's
// saved position as far as the time budget allows, so the multi-year backfill
// is the same call repeated until `caughtUp` is true for every account.

export const config = { maxDuration: 300 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  const only = typeof req.query.account === 'string' ? req.query.account.toLowerCase() : null
  const { data, error } = await supabase.from('google_accounts').select('email')
  if (error) return res.status(500).json({ ok: false, error: error.message })
  const accounts = ((data || []) as { email: string }[]).map(a => a.email).filter(e => !only || e === only)
  if (!accounts.length) return res.status(200).json({ ok: true, results: [], note: 'no connected accounts' })

  // Share the 300s ceiling across accounts, leaving room for the rollup.
  const per = Math.floor(240_000 / accounts.length)
  const results: SyncResult[] = []
  for (const a of accounts) {
    try { results.push(await syncAccount(a, { budgetMs: per })) }
    catch (e) { results.push({ account: a, caughtUp: false, error: String((e as Error)?.message || e).slice(0, 200) }) }
  }

  const { data: rolled, error: rerr } = await supabase.rpc('refresh_relationship_rollup')
  // Plays and shared history read titles and career rows that enrichment keeps
  // changing, so they are recomputed on the same daily beat. A failure here
  // does not fail the sync: warmth is the job, plays ride along.
  const { error: perr } = await supabase.rpc('refresh_shared_history_and_plays')
  // A new LinkedIn connection or a merge changes which networks someone is in.
  const { error: terr } = await supabase.rpc('refresh_ties')
  return res.status(200).json({
    ok: true,
    results,
    contacts_updated: rerr ? null : rolled,
    rollup_error: rerr?.message || null,
    plays_error: perr?.message || null,
    ties_error: terr?.message || null,
    caughtUp: results.every(r => r.caughtUp),
  })
}
