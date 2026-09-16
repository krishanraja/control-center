import { useEffect, useMemo, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// ─── Relationship Engine: the durable Person spine ────────────────────────────
// Backs the Leads tab. Distinct from the older `leads` table (Services pipeline).
// A contact graduates: Person (contacts) → Play (opportunities.play_status='proposed')
// → Opportunity (committed). Provenance (origin_*) is immutable; tier/score evolve.

export type ConsentTier =
  | 'cold_scraped'
  | 'cold_engaged'
  | 'permissioned'
  | 'warm'
  | 'customer'

export type TriageStatus = 'pending' | 'triaged' | 'skipped'

export type ContactStatus = 'active' | 'dormant' | 'closed' | 'do_not_contact'

export interface ContactRow {
  id: string
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  linkedin_url?: string | null
  twitter_handle?: string | null
  company?: string | null
  title?: string | null
  location?: string | null
  // provenance (immutable by design — how we know how to speak to them)
  origin_channel?: string | null
  origin_venture?: string | null
  origin_campaign?: string | null
  acquired_at?: string | null
  sources?: Array<Record<string, unknown>> | null
  // evolving relationship state
  consent_tier?: ConsentTier | null
  relationship_strength?: number | null
  fit_scores?: Record<string, number> | null
  primary_venture?: string | null
  primary_play_type?: string | null
  heat_score?: number | null
  triage_status?: TriageStatus | null
  triaged_at?: string | null
  enrichment_status?: string | null
  deep_enriched_at?: string | null
  dossier?: Record<string, unknown> | null
  status?: ContactStatus | null
  tags?: string[] | null
  owner_agent?: string | null
  last_touch_at?: string | null
  next_touch_due_at?: string | null
  concept_id?: string | null
  created_at: string
  updated_at: string
}

export interface Options {
  /** Cap on rows pulled from PostgREST (anon caps at 1000). Default 1000. */
  limit?: number
  /** Server-side: only these triage statuses. Default ['triaged']. */
  triageStatusIn?: TriageStatus[]
  /**
   * Server-side narrowing. These used to filter the already-fetched page,
   * which meant a venture filter searched only the top 1000 contacts by heat
   * rather than the corpus: a matching person at rank 1200 was invisible and
   * the UI gave no sign anything had been left out. They are part of the
   * query now, and the store keeps one page per distinct query.
   */
  ventureIn?: string[]
  tierIn?: ConsentTier[]
  minHeat?: number
  /** Still client-side: it changes on every keystroke, and narrowing a page
   *  that is now correctly scoped is the cheap half of the problem. */
  search?: string
  filter?: (c: ContactRow) => boolean
}

// ─── Shared store (ADR-002: one channel per table, fanout listeners) ───────────

/** Server-side query parameters. Everything that changes what PostgREST
 *  returns lives here and becomes part of the store key. */
interface Query {
  limit: number
  triage: TriageStatus[]
  ventures: string[]
  tiers: ConsentTier[]
  minHeat: number | null
}

function queryKey(q: Query): string {
  return [q.limit, q.triage.join('|'), q.ventures.join('|'), q.tiers.join('|'), q.minHeat ?? ''].join('::')
}

// One page per distinct query, not one page shared by every consumer. The
// single channel per table stays (ADR-002); only the store is keyed.
const pages = new Map<string, ContactRow[]>()
const loadingKeys = new Set<string>()
const inflightByKey = new Map<string, Promise<void>>()
let channel: RealtimeChannel | null = null
let refCount = 0
let currentQuery: Query = { limit: 1000, triage: ['triaged'], ventures: [], tiers: [], minHeat: null }
/**
 * The columns ContactRow actually declares, named rather than starred.
 *
 * `select('*')` on this table pulls `identity_embedding`, a vector(1536), for
 * every row in the page. At the default limit of 1000 that is over a million
 * floats crossing the wire into a browser that immediately throws them away,
 * because the column is not on ContactRow and nothing reads it. `dossier` and
 * `linkedin_url_norm` rode along the same way.
 *
 * Keep this list and the ContactRow interface above in step. A column named
 * here that does not exist makes Postgres reject the whole query, which
 * surfaces as an empty list rather than an error, so run
 * `scripts/check-select-columns.mts` after changing it.
 */
const CONTACT_COLUMNS =
  'id, full_name, first_name, last_name, email, linkedin_url, twitter_handle, ' +
  'company, title, location, origin_channel, origin_venture, origin_campaign, ' +
  'acquired_at, sources, consent_tier, relationship_strength, fit_scores, ' +
  'primary_venture, primary_play_type, heat_score, triage_status, triaged_at, ' +
  'enrichment_status, deep_enriched_at, dossier, status, tags, owner_agent, ' +
  'last_touch_at, next_touch_due_at, concept_id, created_at, updated_at'

const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function fetchPage(q: Query): Promise<void> {
  const key = queryKey(q)
  const running = inflightByKey.get(key)
  if (running) return running
  loadingKeys.add(key)
  const run = (async () => {
    let req = supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .in('triage_status', q.triage)
    if (q.ventures.length) req = req.in('primary_venture', q.ventures)
    if (q.tiers.length) req = req.in('consent_tier', q.tiers)
    if (q.minHeat != null) req = req.gte('heat_score', q.minHeat)
    const { data, error } = await req
      .order('heat_score', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(q.limit)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useRealtimeContacts] fetch error', error.message)
    }
    pages.set(key, (data as unknown as ContactRow[]) || [])
    loadingKeys.delete(key)
    inflightByKey.delete(key)
    notify()
  })()
  inflightByKey.set(key, run)
  return run
}

/** A write to contacts can land in any page, so every cached page is stale.
 *  The one a consumer is mounted on is refetched now; the rest are dropped
 *  and refetched on demand if anyone asks for them again. */
function refetchAll(): void {
  for (const k of Array.from(pages.keys())) {
    if (k !== queryKey(currentQuery)) pages.delete(k)
  }
  void fetchPage(currentQuery)
}

function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('contacts-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
      refetchAll()
    })
    .subscribe()
}

function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useRealtimeContacts(opts: Options = {}) {
  const [version, setVersion] = useState(0)

  const query: Query = {
    limit: opts.limit ?? 1000,
    triage: opts.triageStatusIn ?? ['triaged'],
    ventures: opts.ventureIn ?? [],
    tiers: opts.tierIn ?? [],
    minHeat: typeof opts.minHeat === 'number' ? opts.minHeat : null,
  }
  const key = queryKey(query)

  useEffect(() => {
    currentQuery = query
    if (!pages.has(key)) void fetchPage(query)
    // `query` is rebuilt every render; `key` is its value, which is what
    // actually decides whether a refetch is owed.
  }, [key])

  useEffect(() => {
    refCount += 1
    attachChannelIfNeeded()

    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
      refCount -= 1
      setTimeout(detachChannelIfIdle, 0)
    }
  }, [])

  const refresh = useCallback(() => { void fetchPage(currentQuery) }, [])

  const ventureKey = opts.ventureIn ? opts.ventureIn.join('|') : ''
  const tierKey = opts.tierIn ? opts.tierIn.join('|') : ''
  const minHeat = opts.minHeat
  const search = opts.search?.trim().toLowerCase() ?? ''
  const filterFn = opts.filter

  const contacts = useMemo(() => {
    // Venture, tier and heat are already applied by the query.
    let out: ContactRow[] = pages.get(key) || []
    if (search) {
      out = out.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(search) ||
        (c.company ?? '').toLowerCase().includes(search) ||
        (c.title ?? '').toLowerCase().includes(search) ||
        (c.origin_campaign ?? '').toLowerCase().includes(search)
      )
    }
    if (filterFn) out = out.filter(filterFn)
    // `version` is the store's change counter: the page lives in a module
    // map, so the memo needs an explicit signal that it was rewritten.
    return out
  }, [key, search, filterFn, version])

  return { contacts, loading: loadingKeys.has(key) && !pages.has(key), refresh }
}
