import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { supabase } from '../../_supabase.js'
import { knownFrom } from '../../../src/lib/knownFrom.js'

// GET /api/network/person/:id
//
// The full joined record behind one search result: identity from contacts, the
// judgment layer from contact_intelligence, and the RE Dossier Engine passes.
// Gated for the same reason as search — why_them and risk are private
// assessments of a named person.
//
// Also where the person's other handles come together (2026-10-04): every
// network they were found in, each Meta link and how it was made, and any open
// question about them. An id that a merge retired resolves to the person it
// was merged into, so a cached proposal or a bookmark never dead-ends.

export const config = { maxDuration: 30 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNS = 'id, full_name, email, linkedin_url, company, title, location, consent_tier, primary_venture, heat_score, fit_scores, relationship_strength, status, status_reason, tags, owner_agent, dossier, sources, first_met_channel, first_met_context, last_touch_at, next_touch_due_at, origin_venture, origin_campaign, enrichment_status, deep_enriched_at'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return

  const asked = typeof req.query.id === 'string' ? req.query.id : ''
  // Reject before hitting the database: a malformed id is a 400, not a 500 from
  // Postgres failing to cast it to uuid.
  if (!UUID.test(asked)) {
    return res.status(400).json({ ok: false, error: 'invalid_id' })
  }

  try {
    let id = asked
    let contact = await supabase.from('contacts').select(COLUMNS).eq('id', id).maybeSingle()
    if (contact.error) throw new Error(contact.error.message)
    let mergedInto: string | null = null
    if (!contact.data) {
      // Merged away? Follow the ledger, at most a few hops.
      for (let hop = 0; hop < 4 && !contact.data; hop++) {
        const { data: m } = await supabase.from('contact_merges').select('survivor_id')
          .eq('loser_id', id).order('merged_at', { ascending: false }).limit(1).maybeSingle()
        if (!m) break
        id = String((m as { survivor_id: string }).survivor_id)
        mergedInto = id
        contact = await supabase.from('contacts').select(COLUMNS).eq('id', id).maybeSingle()
        if (contact.error) throw new Error(contact.error.message)
      }
      if (!contact.data) return res.status(404).json({ ok: false, error: 'not_found' })
    }

    const [intel, idents, open] = await Promise.all([
      supabase.from('contact_intelligence').select('*').eq('contact_id', id).maybeSingle(),
      supabase.from('contact_identities').select('kind, basis, verified, source').eq('contact_id', id),
      supabase.from('suggestions').select('id, surface').eq('subject_id', id).in('surface', ['contact_merge', 'contact_link']),
    ])

    // The embedding is 1536 floats and useless to a client. Dropping it keeps
    // the response two orders of magnitude smaller.
    const intelligence = intel.data ? { ...(intel.data as Record<string, unknown>) } : null
    if (intelligence) { delete intelligence.embedding; delete intelligence.intel_tsv }

    const c = contact.data as Record<string, unknown>
    const kinds = ((idents.data || []) as Array<Record<string, unknown>>).map(i => String(i.kind))
    // Each Meta link, and whether it rests on a name alone. Only those can be
    // undone from the sheet ("Not them").
    const metaLinks = (Array.isArray(c.sources) ? (c.sources as Array<Record<string, unknown>>) : [])
      .filter(s => s && s.type === 'meta_export')
      .map(s => ({ ref: String(s.ref || ''), networks: Array.isArray(s.networks) ? s.networks : [], basis: String(s.basis || '') }))

    // Questions still open about this person (unanswered by any verdict).
    let questions = 0
    const qIds = ((open.data || []) as Array<{ id: string }>).map(q => q.id)
    if (qIds.length) {
      const { data: answered } = await supabase.from('suggestion_verdicts').select('suggestion_id, verdict').in('suggestion_id', qIds)
      const done = new Set(((answered || []) as Array<{ suggestion_id: string; verdict: string }>)
        .filter(v => v.verdict !== 'deferred').map(v => v.suggestion_id))
      questions = qIds.filter(q => !done.has(q)).length
    }

    const { sources: _s, ...publicContact } = c
    void _s
    return res.status(200).json({
      ok: true,
      contact: publicContact,
      intelligence,
      known_from: knownFrom(c.sources, kinds),
      meta_links: metaLinks,
      questions,
      merged_into: mergedInto,
    })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'lookup_failed' })
  }
}
