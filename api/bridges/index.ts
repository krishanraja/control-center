import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// Bridge candidates are hunter's private judgment about named people in
// Krish's network (path evidence, relationship strength). Like
// contact_intelligence, the tables carry no anon policy at all and are
// reachable only through this gated route. See api/_auth.ts.

export const config = { maxDuration: 30 }

const STATES = new Set(['proposed', 'reached_out', 'snoozed', 'not_a_path'])

/** How close, on a 0-100 scale, from the one tier column that is consistent.
 *  An unknown or missing tier is null, never 0: "we never judged this person"
 *  and "this person is cold" are different claims and the card says so. */
const TIER_STRENGTH: Record<string, number> = {
  '1_reciprocated': 100,
  '2_core_network': 85,
  '3_known_network': 70,
  '4_owned_network': 50,
  '5_cold_lead': 15,
}

function strengthFor(tier: string | null): number | null {
  return tier && tier in TIER_STRENGTH ? TIER_STRENGTH[tier] : null
}

interface CcRow {
  id: string
  full_name: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  email: string | null
  intel?: { current_title: string | null; current_company: string | null; network_tier: string | null; why_them: string | null } | null
}

/** Shape a contacts row into the card's contact, preferring the enriched
 *  role and carrying the real relationship strength instead of a hardcoded 0. */
function enrichedContact(key: string, c: unknown, fallbackUrl: string | null) {
  const r = c as CcRow
  const intel = Array.isArray(r.intel) ? r.intel[0] : r.intel
  return {
    contact_key: key,
    full_name: r.full_name,
    current_title: intel?.current_title || r.title,
    current_company: intel?.current_company || r.company,
    // Derived from network_tier, NOT from tier_weight.
    //
    // tier_weight looks like the right column and is not safe to read: it
    // carries two different scales at once. Measured 2026-09-16, the same
    // tier appears with both values, e.g. 2_core_network = 3 and
    // 2_core_network = 85, so some rows are on a 1-5 rank and others on a
    // 1-100 weight. Reading it would print "Strength 3" and "Strength 85"
    // for two equally close contacts. network_tier is consistent, so the
    // number is derived from it here. See TIER_STRENGTH.
    strength_score: strengthFor(intel?.network_tier ?? null),
    linkedin_url: r.linkedin_url || fallbackUrl,
    strength_evidence: intel?.why_them || null,
    email: r.email,
  }
}

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
          .select('contact_key, full_name, current_title, current_company, strength_score, linkedin_url, strength_evidence, email')
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
    // People from the Control Center graph (contacts) carry a contact_key
    // that is their LinkedIn slug, or contact:<uuid> when they have none, and
    // are not in network_contacts. Look them up there so the card names them.
    const missing = contactKeys.filter(k => !byContact.has(k))
    const ccKeys = [...new Set(rows.map(b => b.contact_key as string | null)
      .filter((k): k is string => !!k && k.startsWith('contact:')))]
    const ccIds = ccKeys.map(k => k.slice('contact:'.length))
    // contact_intelligence rides along on both lookups below. This lane read
    // contacts.title/company and hardcoded strength_score: 0, so a person the
    // enrichment spine knew well - current role from a bought profile, a real
    // relationship tier, a stored judgment - showed up here with a stale title
    // and no strength at all. NetworkPersonSheet already prefers the enriched
    // role; this makes the Hunt cards agree with it.
    const CC_SELECT = 'id, full_name, title, company, linkedin_url, email, ' +
      'intel:contact_intelligence(current_title, current_company, network_tier, why_them)'

    if (ccIds.length) {
      const { data } = await supabase.from('contacts').select(CC_SELECT).in('id', ccIds)
      for (const c of (data || []) as unknown as CcRow[]) {
        byContact.set(`contact:${c.id}`, enrichedContact(`contact:${c.id}`, c, null))
      }
    }
    // One query for every remaining slug, not one query per slug. This was
    // up to 25 sequential round trips, each an `ilike` with a leading
    // wildcard that no index can serve.
    if (missing.length) {
      const slugs = missing.slice(0, 25)
      const { data } = await supabase.from('contacts').select(CC_SELECT)
        .or(slugs.map(sl => `linkedin_url_norm.ilike.%/in/${sl}%`).join(','))
        .limit(slugs.length * 2)
      for (const slug of slugs) {
        const c = (data || []).find(x => String((x as { linkedin_url?: string }).linkedin_url || '')
          .toLowerCase().includes(`/in/${slug.toLowerCase()}`))
        if (c) byContact.set(slug, enrichedContact(slug, c, `https://www.linkedin.com/in/${slug}`))
      }
    }
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
