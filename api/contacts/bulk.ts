import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/contacts/bulk — batch operations on Relationship Engine contacts.
//
// body: { ids: string[], action, value? }
//   assign_owner   → contacts.owner_agent = value
//   set_tier       → contacts.consent_tier = value (one of the 5 tiers)
//   do_not_contact → contacts.status = 'do_not_contact'
//   dismiss_plays  → opportunities.play_status 'proposed' → 'dismissed' for ids
//   queue_dossier  → contacts.enrichment_status = 'queued' (Dossier Engine stub)
//
// Returns { ok: true, updated: N }. Uses the service-role client.

const TIERS = new Set(['cold_scraped', 'cold_engaged', 'permissioned', 'warm', 'customer'])
const ACTIONS = new Set(['assign_owner', 'set_tier', 'do_not_contact', 'dismiss_plays', 'queue_dossier'])
const MAX_IDS = 500

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as {
    ids?: unknown
    action?: string
    value?: string
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  if (ids.length === 0) {
    return res.status(400).json({ ok: false, error: 'ids must be a non-empty array' })
  }
  if (ids.length > MAX_IDS) {
    return res.status(400).json({ ok: false, error: `too many ids (max ${MAX_IDS})` })
  }
  if (!body.action || !ACTIONS.has(body.action)) {
    return res.status(400).json({ ok: false, error: `invalid action: ${body.action}` })
  }

  try {
    if (body.action === 'assign_owner') {
      if (!body.value || typeof body.value !== 'string') {
        return res.status(400).json({ ok: false, error: 'value (owner_agent) required' })
      }
      const { data, error } = await supabase
        .from('contacts')
        .update({ owner_agent: body.value })
        .in('id', ids)
        .select('id')
      if (error) throw new Error(error.message)
      return res.json({ ok: true, updated: data?.length ?? 0 })
    }

    if (body.action === 'set_tier') {
      if (!body.value || !TIERS.has(body.value)) {
        return res.status(400).json({ ok: false, error: `invalid consent_tier: ${body.value}` })
      }
      const { data, error } = await supabase
        .from('contacts')
        .update({ consent_tier: body.value })
        .in('id', ids)
        .select('id')
      if (error) throw new Error(error.message)
      return res.json({ ok: true, updated: data?.length ?? 0 })
    }

    if (body.action === 'do_not_contact') {
      const { data, error } = await supabase
        .from('contacts')
        .update({ status: 'do_not_contact' })
        .in('id', ids)
        .select('id')
      if (error) throw new Error(error.message)
      return res.json({ ok: true, updated: data?.length ?? 0 })
    }

    if (body.action === 'queue_dossier') {
      const { data, error } = await supabase
        .from('contacts')
        .update({ enrichment_status: 'queued' })
        .in('id', ids)
        .select('id')
      if (error) throw new Error(error.message)
      return res.json({ ok: true, updated: data?.length ?? 0 })
    }

    // dismiss_plays — operates on opportunities, scoped to proposed plays.
    if (body.action === 'dismiss_plays') {
      const { data, error } = await supabase
        .from('opportunities')
        .update({ play_status: 'dismissed' })
        .in('contact_id', ids)
        .eq('play_status', 'proposed')
        .select('id')
      if (error) throw new Error(error.message)
      return res.json({ ok: true, updated: data?.length ?? 0 })
    }

    return res.status(400).json({ ok: false, error: 'unhandled action' })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
