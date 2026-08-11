import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { supabase } from '../../_supabase.js'

// GET /api/network/person/:id
//
// The full joined record behind one search result: identity from contacts, the
// judgment layer from contact_intelligence, and the RE Dossier Engine passes.
// Gated for the same reason as search — why_them and risk are private
// assessments of a named person.

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  // Reject before hitting the database: a malformed id is a 400, not a 500 from
  // Postgres failing to cast it to uuid.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ ok: false, error: 'invalid_id' })
  }

  try {
    const [contact, intel] = await Promise.all([
      supabase.from('contacts')
        .select('id, full_name, email, linkedin_url, company, title, location, consent_tier, primary_venture, heat_score, fit_scores, relationship_strength, status, tags, owner_agent, dossier, first_met_channel, first_met_context, last_touch_at, next_touch_due_at, origin_venture, origin_campaign, enrichment_status, deep_enriched_at')
        .eq('id', id).maybeSingle(),
      supabase.from('contact_intelligence').select('*').eq('contact_id', id).maybeSingle(),
    ])
    if (contact.error) throw new Error(contact.error.message)
    if (!contact.data) return res.status(404).json({ ok: false, error: 'not_found' })

    // The embedding is 1536 floats and useless to a client. Dropping it keeps
    // the response two orders of magnitude smaller.
    const intelligence = intel.data ? { ...(intel.data as Record<string, unknown>) } : null
    if (intelligence) { delete intelligence.embedding; delete intelligence.intel_tsv }

    return res.status(200).json({ ok: true, contact: contact.data, intelligence })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'lookup_failed' })
  }
}
