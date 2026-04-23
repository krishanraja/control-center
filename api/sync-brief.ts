/**
 * /api/sync-brief
 *
 * Dual-write handler for "Deploy Master Brief":
 *   1. If `brief_content` is supplied in the POST body, we PATCH the
 *      `agents` row directly so the new brief is immediately visible
 *      everywhere the UI reads from (single source of truth: Supabase).
 *   2. Regardless of whether `brief_content` is supplied, we also enqueue
 *      a row in `sync_queue` so any downstream consumer can pick it up.
 *
 * IMPORTANT — Google Docs ↔ local-FS mirror is NOT implemented here.
 * There is no server-side worker in this repo that reads `sync_queue`
 * and pushes brief text into Google Docs or a local filesystem. That
 * must live in an external worker (e.g. a cron job or n8n flow) that
 * consumes `sync_queue` rows where `status = 'pending'`. Until such a
 * worker exists, the enqueue step is advisory-only — the real state
 * change is the PATCH to `agents`.
 *
 * Audit date: 2026-04-23. Previously this handler only enqueued and
 * claimed the Deploy button was functional; it was not. See PR
 * "Fix: audit remediations" for the split-brain fix.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { agentId, brief_content } = req.body || {}
  if (!agentId) return res.status(400).json({ error: 'agentId is required' })

  // Require explicit brief text so we never silently overwrite with
  // whatever was last cached or enqueue a blank deploy. The frontend
  // must pass `selected.brief_content` from the current agent row.
  if (typeof brief_content !== 'string' || brief_content.length === 0) {
    return res.status(400).json({
      error: 'brief_content (string) is required. The frontend must send the current brief text so the server can dual-write to Supabase and enqueue a sync.',
    })
  }

  // 1. Primary write: update the agents table directly so the Deploy
  //    button has a real effect visible on next fetch.
  const nowIso = new Date().toISOString()
  const { error: patchError } = await supabase
    .from('agents')
    .update({ brief_content, brief_updated_at: nowIso })
    .eq('id', agentId)
  if (patchError) return res.status(500).json({ error: patchError.message })

  // 2. Secondary: enqueue for any downstream consumer (Google Docs /
  //    local-FS mirror). Failures here are logged but NOT fatal —
  //    the authoritative state is already in Supabase.
  const { error: queueError } = await supabase
    .from('sync_queue')
    .insert({ agent_id: agentId, status: 'pending' })
  if (queueError) {
    // Log but don't fail the request — the PATCH succeeded.
    console.warn('[sync-brief] enqueue failed:', queueError.message)
  }

  return res.json({
    ok: true,
    agent_id: agentId,
    brief_updated_at: nowIso,
    enqueued: !queueError,
  })
}
