import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Governed content-seed engine.
//
// Replaces the old client-side ContentSeedRail, which hardcoded two raw table
// reads (zara_signals + customer_contacts) with no time-box, no quality gate,
// no dedupe — so it surfaced 8-week-old podcast-booking leads, a literal "test"
// row, and a lone CRM fragment as "this week's artifacts".
//
// This module is the single source of truth for what counts as a content-grade
// seed. Each source declares its own time-box, type/quality gate, normalization
// and weight. The engine then dedupes, drops already-seeded artifacts, ranks,
// and caps. New sources plug into SEED_SOURCES — never into the UI again.
//
// Honest-by-construction: if no source has a fresh, content-grade artifact, the
// engine returns [] and the rail renders its empty state. It does NOT scrape
// the bottom of a dead table to look busy.
// ─────────────────────────────────────────────────────────────────────────────

export interface SeedCandidate {
  /** Stable key for React + dedupe-vs-dismissed. */
  key: string
  kind: 'signal' | 'customer' | 'deal'
  /** The seed line shown in the card (already trimmed/normalized). */
  text: string
  /** Small tag chip under the card. */
  sub: string | null
  /** Provenance forwarded to /api/content-ideas (must be in its ALLOWED_SOURCE). */
  source_type: string
  /** Bare row id — used to exclude artifacts already turned into ideas. */
  source_ref: string
  source_url: string | null
  /** Display score on the source's own scale (nullable). */
  score: number | null
  /** 0..1 normalized score used for ranking. */
  norm_score: number
  /** ISO timestamp the artifact actually occurred — drives recency ranking. */
  occurred_at: string
  /** Source weight, copied onto the candidate for ranking + debugging. */
  weight: number
}

interface SeedSource {
  key: string
  weight: number
  fetch: (sb: SupabaseClient, sinceISO: string, limit: number) => Promise<SeedCandidate[]>
}

// How far back "recent" reaches. Deliberately wider than 7 days: the artifact
// feeders are low-cadence, so a 7-day window would near-always be empty and the
// affordance would feel broken. 21 days keeps it honest without going stale.
export const DEFAULT_WINDOW_DAYS = 21
const PER_SOURCE_LIMIT = 50
const RECENCY_HALF_LIFE_DAYS = 10

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

const trimText = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > 240 ? `${t.slice(0, 237)}…` : t
}

/** Normalized fingerprint for near-duplicate collapse. */
const fingerprint = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 64)

// ── Source: customer voice ───────────────────────────────────────────────────
// The right *kind* of artifact (real customer language). Thin today, but when
// the customer-voice capture is live this is premium content fuel.
interface CustomerRow {
  id: string
  summary: string | null
  reason: string | null
  channel: string | null
  contacted_at: string | null
  created_at: string | null
}

const customerVoice: SeedSource = {
  key: 'customer_contacts',
  weight: 0.9,
  fetch: async (sb, sinceISO, limit) => {
    const { data } = await sb
      .from('customer_contacts')
      .select('id,summary,reason,channel,contacted_at,created_at')
      .or(`contacted_at.gte.${sinceISO},created_at.gte.${sinceISO}`)
      .order('contacted_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    const rows = (data ?? []) as CustomerRow[]
    const out: SeedCandidate[] = []
    for (const r of rows) {
      const raw = (r.summary || r.reason || '').trim()
      if (raw.length < 12) continue
      const occurred_at = r.contacted_at || r.created_at
      if (!occurred_at) continue
      out.push({
        key: `cust:${r.id}`,
        kind: 'customer',
        text: trimText(raw),
        sub: r.channel ? `customer voice · ${r.channel}` : 'customer voice',
        source_type: 'customer_voice',
        source_ref: r.id,
        source_url: null,
        score: null,
        norm_score: 0.5,
        occurred_at,
        weight: 0.9,
      })
    }
    return out
  },
}

// ── Source: market signals (Zara) ────────────────────────────────────────────
// Content-grade market intelligence only. Visibility/booking signal types are
// outbound opportunities, NOT content — they belong in the Visibility tab, and
// surfacing them here is exactly what made the old rail read as generic.
const SIGNAL_TYPE_DENY = new Set([
  'visibility-window',
  'guest-window',
  'haro',
  'test',
])
const SIGNAL_STATUS_DENY = new Set(['closed', 'dropped'])

interface SignalRow {
  id: string
  summary: string | null
  description: string | null
  signal_type: string | null
  venture: string | null
  signal_score: number | null
  krish_rating: number | null
  source_url: string | null
  status: string | null
  surfaced_at: string | null
  created_at: string | null
}

const marketSignals: SeedSource = {
  key: 'zara_signals',
  weight: 0.8,
  fetch: async (sb, sinceISO, limit) => {
    const { data } = await sb
      .from('zara_signals')
      .select(
        'id,summary,description,signal_type,venture,signal_score,krish_rating,source_url,status,surfaced_at,created_at',
      )
      .or(`surfaced_at.gte.${sinceISO},created_at.gte.${sinceISO}`)
      .order('surfaced_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    const rows = (data ?? []) as SignalRow[]
    const out: SeedCandidate[] = []
    for (const r of rows) {
      if (r.status && SIGNAL_STATUS_DENY.has(r.status)) continue
      if (r.signal_type && SIGNAL_TYPE_DENY.has(r.signal_type)) continue
      if ((r.venture || '').toLowerCase() === 'test') continue
      const raw = (r.summary || r.description || '').trim()
      if (raw.length < 12) continue
      const occurred_at = r.surfaced_at || r.created_at
      if (!occurred_at) continue
      const score = r.krish_rating ?? r.signal_score ?? null
      out.push({
        key: `sig:${r.id}`,
        kind: 'signal',
        text: trimText(raw),
        sub: r.venture || r.signal_type || null,
        source_type: 'zara_signal',
        source_ref: r.id,
        source_url: r.source_url,
        score,
        norm_score: score === null ? 0.45 : clamp01(score / 10),
        occurred_at,
        weight: 0.8,
      })
    }
    return out
  },
}

// ── Source: closed deals (won/lost) ──────────────────────────────────────────
// Real builder-operator gold: "we won/lost X because Y". Hard-gated to closed
// stages with a substantive reason so the 2.4k AI-generated *proposed* rows can
// never leak in. Yields nothing until real deals close — which is correct.
interface OpportunityRow {
  id: string
  company_name: string | null
  venture: string | null
  stage: string | null
  notes: string | null
  rationale: string | null
  updated_at: string | null
  created_at: string | null
}

const closedDeals: SeedSource = {
  key: 'opportunities',
  weight: 1.0,
  fetch: async (sb, sinceISO, limit) => {
    const { data } = await sb
      .from('opportunities')
      .select('id,company_name,venture,stage,notes,rationale,updated_at,created_at')
      .or('stage.ilike.%won%,stage.ilike.%lost%')
      .or(`updated_at.gte.${sinceISO},created_at.gte.${sinceISO}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    const rows = (data ?? []) as OpportunityRow[]
    const out: SeedCandidate[] = []
    for (const r of rows) {
      const stage = (r.stage || '').toLowerCase()
      const outcome = stage.includes('won') ? 'Won' : stage.includes('lost') ? 'Lost' : null
      if (!outcome) continue
      // Prefer a human note; fall back to AI rationale. Require substance.
      const reason = (r.notes || r.rationale || '').trim()
      if (reason.length < 40) continue
      const occurred_at = r.updated_at || r.created_at
      if (!occurred_at) continue
      const co = r.company_name || 'a deal'
      out.push({
        key: `opp:${r.id}`,
        kind: 'deal',
        text: trimText(`${outcome} ${co} — ${reason}`),
        sub: r.venture ? `${r.venture} · ${outcome.toLowerCase()}` : outcome.toLowerCase(),
        source_type: 'crm_opportunity',
        source_ref: r.id,
        source_url: null,
        score: null,
        norm_score: 0.6,
        occurred_at,
        weight: 1.0,
      })
    }
    return out
  },
}

// ── Source: judgment-economy lens radar ──────────────────────────────────────
// Topics / POVs / headlines the lens radar found in the wider world (sharp
// voices + theme search), gated to the "judgment economy" direction and written
// to lens_seed_candidates on a cadence by api/discover-lens-radar.ts. This
// feeder is a FAST read of that cached table - it never scrapes on rail load,
// so it stays instant and cost-disciplined like every other source. Honest-by-
// construction: if the radar found nothing fresh + on-direction, this is empty.
interface LensRow {
  id: string
  text: string | null
  sub: string | null
  source_url: string | null
  author: string | null
  fit_score: number | null
  occurred_at: string | null
  status: string | null
}

const lensRadar: SeedSource = {
  key: 'lens_seed_candidates',
  weight: 0.85,
  fetch: async (sb, sinceISO, limit) => {
    const { data } = await sb
      .from('lens_seed_candidates')
      .select('id,text,sub,source_url,author,fit_score,occurred_at,status')
      .eq('status', 'new')
      .gte('occurred_at', sinceISO)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .limit(limit)
    const rows = (data ?? []) as LensRow[]
    const out: SeedCandidate[] = []
    for (const r of rows) {
      const raw = (r.text || '').trim()
      if (raw.length < 12) continue
      if (!r.occurred_at) continue
      const fit = typeof r.fit_score === 'number' ? r.fit_score : 0.5
      out.push({
        key: `lens:${r.id}`,
        kind: 'signal',
        text: trimText(raw),
        sub: r.sub || (r.author ? `voice · ${r.author}` : 'judgment economy'),
        source_type: 'lens_radar',
        source_ref: r.id,
        source_url: r.source_url,
        score: Math.round(fit * 10),
        norm_score: clamp01(fit),
        occurred_at: r.occurred_at,
        weight: 0.85,
      })
    }
    return out
  },
}

// Registry. Order is irrelevant — ranking decides display order.
export const SEED_SOURCES: SeedSource[] = [closedDeals, customerVoice, marketSignals, lensRadar]

export interface CollectOptions {
  windowDays?: number
  limit?: number
  /** Injected for deterministic tests; defaults to wall-clock now. */
  now?: Date
}

/**
 * Run every source, then apply the global gates that no single source can:
 * exclude already-seeded artifacts, collapse near-duplicates (highest-ranked
 * wins), rank by weight × (recency, score), and cap.
 */
export async function collectSeedCandidates(
  sb: SupabaseClient,
  opts: CollectOptions = {},
): Promise<SeedCandidate[]> {
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS
  const cap = opts.limit ?? 8
  const sinceISO = new Date(now.getTime() - windowDays * 86_400_000).toISOString()

  // Artifacts already turned into ideas — never re-offer them.
  const { data: existing } = await sb
    .from('content_ideas')
    .select('source_ref')
    .not('source_ref', 'is', null)
    .limit(1000)
  const seeded = new Set(
    ((existing ?? []) as { source_ref: string | null }[])
      .map((r) => r.source_ref)
      .filter((v): v is string => typeof v === 'string'),
  )

  const batches = await Promise.all(
    SEED_SOURCES.map((s) =>
      s.fetch(sb, sinceISO, PER_SOURCE_LIMIT).catch(() => [] as SeedCandidate[]),
    ),
  )

  const ranked = batches
    .flat()
    .filter((c) => !seeded.has(c.source_ref))
    .map((c) => {
      const ageDays = (now.getTime() - new Date(c.occurred_at).getTime()) / 86_400_000
      const recency = Math.exp(-Math.max(0, ageDays) / RECENCY_HALF_LIFE_DAYS)
      const rank = c.weight * (0.6 * recency + 0.4 * c.norm_score)
      return { c, rank }
    })
    .sort((a, b) => b.rank - a.rank)

  // Collapse near-duplicates: first (highest-ranked) occurrence of a
  // fingerprint wins, the rest are dropped.
  const seenPrints = new Set<string>()
  const out: SeedCandidate[] = []
  for (const { c } of ranked) {
    const fp = fingerprint(c.text)
    if (seenPrints.has(fp)) continue
    seenPrints.add(fp)
    out.push(c)
    if (out.length >= cap) break
  }
  return out
}
