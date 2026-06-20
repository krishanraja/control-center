// _apollo — shared Apollo.io client for search + bulk enrichment.
//
// Today the codebase only calls Apollo people/match (one person at a time, in
// api/_enrich.ts). The credit burn-down needs two more capabilities, both here
// so a script and a future API route share one implementation:
//
//   - apolloSearch()     — mixed_people/search. Cheap, no credits: it pulls a
//                          PAGE of candidates matching ICP filters. Emails come
//                          back locked/masked; this is the pre-qualifier pool.
//   - apolloBulkEnrich() — people/bulk_match (≤10/call). This is the CREDIT-
//                          SPENDING reveal: verified email + full org/career.
//
// All functions are best-effort and gated on APOLLO_API_KEY. Throwing is
// reserved for missing config so callers can fail fast before a mass run.

const APOLLO_BASE = 'https://api.apollo.io/api/v1'

function apolloKey(): string {
  const key = process.env.APOLLO_API_KEY
  if (!key) throw new Error('APOLLO_API_KEY not configured')
  return key
}

async function apolloFetch(path: string, body: Record<string, any>): Promise<any> {
  const r = await fetch(`${APOLLO_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apolloKey() },
    body: JSON.stringify(body),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`apollo_${r.status}:${(j?.error || j?.message || '').toString().slice(0, 160)}`)
  return j
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface ApolloSearchFilters {
  person_titles?: string[]
  person_seniorities?: string[]
  organization_num_employees_ranges?: string[]   // e.g. ["11,50","51,200"]
  person_locations?: string[]
  q_keywords?: string
  q_organization_keyword_tags?: string[]
  organization_industry_tag_ids?: string[]
  page?: number
  per_page?: number
}

/** A normalized, lightweight person from a search page (emails are NOT revealed
 *  here — `email_status` tells you whether a reveal would yield a verified one). */
export interface ApolloPersonLite {
  id?: string
  first_name?: string
  last_name?: string
  name?: string
  title?: string
  headline?: string
  linkedin_url?: string
  email_status?: string
  city?: string
  state?: string
  country?: string
  organization_name?: string
  organization?: any
  raw: any
}

function liteFromPerson(p: any): ApolloPersonLite {
  return {
    id: p?.id,
    first_name: p?.first_name,
    last_name: p?.last_name,
    name: p?.name || [p?.first_name, p?.last_name].filter(Boolean).join(' '),
    title: p?.title,
    headline: p?.headline,
    linkedin_url: p?.linkedin_url,
    email_status: p?.email_status,
    city: p?.city, state: p?.state, country: p?.country,
    organization_name: p?.organization?.name || p?.organization_name,
    organization: p?.organization,
    raw: p,
  }
}

/** One page of mixed_people/search. Returns the page of people plus the total
 *  available so a caller can decide whether to paginate. No credits consumed. */
export async function apolloSearch(filters: ApolloSearchFilters): Promise<{
  people: ApolloPersonLite[]
  page: number
  per_page: number
  total_entries: number
}> {
  const per_page = Math.min(filters.per_page ?? 25, 100)
  const page = filters.page ?? 1
  const body: Record<string, any> = { page, per_page }
  if (filters.person_titles?.length) body.person_titles = filters.person_titles
  if (filters.person_seniorities?.length) body.person_seniorities = filters.person_seniorities
  if (filters.organization_num_employees_ranges?.length) body.organization_num_employees_ranges = filters.organization_num_employees_ranges
  if (filters.person_locations?.length) body.person_locations = filters.person_locations
  if (filters.q_keywords) body.q_keywords = filters.q_keywords
  if (filters.q_organization_keyword_tags?.length) body.q_organization_keyword_tags = filters.q_organization_keyword_tags
  if (filters.organization_industry_tag_ids?.length) body.organization_industry_tag_ids = filters.organization_industry_tag_ids
  const j = await apolloFetch('/mixed_people/search', body)
  const people = (Array.isArray(j?.people) ? j.people : []).map(liteFromPerson)
  const pag = j?.pagination || {}
  return { people, page: pag.page ?? page, per_page: pag.per_page ?? per_page, total_entries: pag.total_entries ?? people.length }
}

// ── Bulk enrich (the credit-spending reveal) ─────────────────────────────────

export interface ApolloEnriched {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  headline?: string
  email?: string | null
  email_status?: string
  linkedin_url?: string
  city?: string
  state?: string
  country?: string
  organization_name?: string
  organization_industry?: string
  organization_website?: string
  organization_num_employees?: number
  employment_history?: Array<{ title?: string; organization_name?: string }>
  /** True when this match returned a usable, verified email (the credit signal). */
  revealed: boolean
  raw: any
}

function enrichedFromMatch(p: any): ApolloEnriched {
  const org = p?.organization || {}
  const email = p?.email && !/email_not_unlocked/i.test(String(p.email)) ? p.email : null
  return {
    id: p?.id,
    name: p?.name || [p?.first_name, p?.last_name].filter(Boolean).join(' '),
    first_name: p?.first_name, last_name: p?.last_name,
    title: p?.title, headline: p?.headline,
    email,
    email_status: p?.email_status,
    linkedin_url: p?.linkedin_url,
    city: p?.city, state: p?.state, country: p?.country,
    organization_name: org.name,
    organization_industry: org.industry,
    organization_website: org.website_url,
    organization_num_employees: org.estimated_num_employees,
    employment_history: Array.isArray(p?.employment_history)
      ? p.employment_history.slice(0, 5).map((e: any) => ({ title: e?.title, organization_name: e?.organization_name }))
      : [],
    revealed: !!email && /verified/i.test(String(p?.email_status || '')),
    raw: p,
  }
}

export interface BulkMatchDetail {
  id?: string
  first_name?: string
  last_name?: string
  name?: string
  organization_name?: string
  linkedin_url?: string
  email?: string
}

/** people/bulk_match in chunks of 10. CONSUMES CREDITS for each record whose
 *  email is revealed. `revealPersonalEmails` mirrors Apollo's flag. Returns the
 *  enriched records plus a count of revealed emails (the credit proxy). */
export async function apolloBulkEnrich(
  details: BulkMatchDetail[],
  opts: { revealPersonalEmails?: boolean } = {},
): Promise<{ enriched: ApolloEnriched[]; revealedCount: number }> {
  const enriched: ApolloEnriched[] = []
  for (let i = 0; i < details.length; i += 10) {
    const chunk = details.slice(i, i + 10)
    const j = await apolloFetch('/people/bulk_match', {
      reveal_personal_emails: opts.revealPersonalEmails ?? true,
      details: chunk,
    })
    const matches = Array.isArray(j?.matches) ? j.matches : []
    for (const m of matches) if (m) enriched.push(enrichedFromMatch(m))
  }
  const revealedCount = enriched.filter(e => e.revealed).length
  return { enriched, revealedCount }
}

// ── Credit usage (best-effort metering) ──────────────────────────────────────

/** Best-effort credit balance read. Apollo's credit endpoint is not stable
 *  across plans, so callers should treat a null as "unknown" and rely on the
 *  local revealed-email counter for the hard cap. */
export async function apolloCreditsRemaining(): Promise<number | null> {
  try {
    const r = await fetch(`${APOLLO_BASE}/usage_stats/credit_usage_stats`, {
      method: 'GET',
      headers: { 'X-Api-Key': apolloKey(), 'Cache-Control': 'no-cache' },
    })
    if (!r.ok) return null
    const j: any = await r.json().catch(() => null)
    // Shapes vary; probe the common ones.
    const v = j?.credits_remaining ?? j?.email_credits?.remaining ?? j?.remaining ?? null
    return typeof v === 'number' ? v : null
  } catch {
    return null
  }
}
