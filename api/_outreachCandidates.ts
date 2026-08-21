import { supabase } from './_supabase.js'

// The outreach inventory red mode judges a send/reply ask against. Three
// deterministic sources, best artifacts first:
//
//   1. email_drafts with sent_at null: already written, sitting in Gmail.
//      Sending one IS the fifteen-minute action, so these outrank everything.
//   2. leads that are enriched and reachable but not recently emailed: no
//      draft yet, and the existing draft-email routes can write one on the
//      spot, so a match here is a build-then-send.
//   3. guests with a pitch drafted and an address: same shape as leads.
//
// No LLM here; the judge in resolve-ask reads this list. Every query fails
// soft so a broken source never empties the whole inventory.

export interface OutreachCandidate {
  kind: 'email_draft' | 'lead' | 'guest'
  /** email_draft: the drafts row id. lead/guest: the entity id. */
  id: string
  entityType: 'lead' | 'guest' | 'customer' | null
  entityId: string | null
  name: string
  detail: string | null
  /** Gmail draft url for ready drafts; null when the draft is still to build. */
  url: string | null
  ageDays: number | null
}

const DRAFT_WINDOW_DAYS = 14
const RECENTLY_EMAILED_DAYS = 7

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
}

async function readyDrafts(): Promise<OutreachCandidate[]> {
  try {
    const since = new Date(Date.now() - DRAFT_WINDOW_DAYS * 86400000).toISOString()
    const { data } = await supabase
      .from('email_drafts')
      // email_drafts columns are: id, entity_type, entity_id, subject,
      // body_preview, gmail_draft_id, gmail_draft_url, created_by, created_at.
      // There is no recipient_email and no sent_at — naming them made
      // PostgREST reject the whole select, and because this sits in a
      // try/catch it degraded to an empty list rather than an error, so
      // ready drafts silently never appeared as outreach candidates.
      .select('id, entity_type, entity_id, subject, gmail_draft_url, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(6)
    return (data || [])
      .filter((d: any) => d.subject)
      .map((d: any) => ({
        kind: 'email_draft' as const,
        id: String(d.id),
        entityType: (['lead', 'guest', 'customer'].includes(d.entity_type) ? d.entity_type : null),
        entityId: d.entity_id ? String(d.entity_id) : null,
        name: d.recipient_email || 'the recipient',
        detail: d.subject || null,
        url: d.gmail_draft_url || null,
        ageDays: daysAgo(d.created_at),
      }))
  } catch {
    return []
  }
}

async function draftableLeads(): Promise<OutreachCandidate[]> {
  try {
    const recently = new Date(Date.now() - RECENTLY_EMAILED_DAYS * 86400000).toISOString()
    const { data } = await supabase
      .from('leads')
      .select('id, full_name, company, title, why_relevant, fit_score, email, last_emailed_at, updated_at')
      .in('status', ['new', 'ready'])
      .not('email', 'is', null)
      .or(`last_emailed_at.is.null,last_emailed_at.lt.${recently}`)
      .order('fit_score', { ascending: false, nullsFirst: false })
      .limit(6)
    return (data || [])
      .filter((l: any) => l.full_name || l.company)
      .map((l: any) => ({
        kind: 'lead' as const,
        id: String(l.id),
        entityType: 'lead' as const,
        entityId: String(l.id),
        name: l.full_name || l.company,
        detail: [
          [l.title, l.company].filter(Boolean).join(' at ') || null,
          typeof l.fit_score === 'number' ? `fit ${l.fit_score}/10` : null,
          l.why_relevant ? String(l.why_relevant).slice(0, 160) : null,
        ].filter(Boolean).join('. '),
        url: null,
        ageDays: daysAgo(l.updated_at),
      }))
  } catch {
    return []
  }
}

async function pitchedGuests(): Promise<OutreachCandidate[]> {
  try {
    const recently = new Date(Date.now() - RECENTLY_EMAILED_DAYS * 86400000).toISOString()
    const { data } = await supabase
      .from('guests')
      .select('id, name, email, one_liner, why_fit, pitch_draft, last_outreach_at, updated_at')
      .in('status', ['scouted', 'enriched'])
      .not('email', 'is', null)
      .not('pitch_draft', 'is', null)
      .or(`last_outreach_at.is.null,last_outreach_at.lt.${recently}`)
      .order('updated_at', { ascending: false })
      .limit(4)
    return (data || [])
      .filter((g: any) => g.name)
      .map((g: any) => ({
        kind: 'guest' as const,
        id: String(g.id),
        entityType: 'guest' as const,
        entityId: String(g.id),
        name: g.name,
        detail: [
          g.one_liner ? String(g.one_liner).slice(0, 120) : null,
          g.why_fit ? String(g.why_fit).slice(0, 140) : null,
          'pitch drafted',
        ].filter(Boolean).join('. '),
        url: null,
        ageDays: daysAgo(g.updated_at),
      }))
  } catch {
    return []
  }
}

/** Drafts first (send is the action), then leads by fit, then guests. */
export async function fetchOutreachCandidates(limit = 10): Promise<OutreachCandidate[]> {
  const [drafts, leads, guests] = await Promise.all([readyDrafts(), draftableLeads(), pitchedGuests()])
  return [...drafts, ...leads, ...guests].slice(0, limit)
}
