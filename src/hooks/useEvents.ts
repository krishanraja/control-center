import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useHomeCity, type HomeCity } from '../lib/homeCity'

/**
 * The attend lane.
 *
 * `events` has been live since August 2026 and NOTHING in this repo read it
 * until now: no route, no hook, no component. 355 rows, two working SQL
 * functions, a spec in docs/MINDMAKE_OS_ARCHITECTURE.md §3, and no surface. The
 * tab labelled Events was reading `visibility_targets`, which is a press and
 * podcast register: on 2026-09-24 its live queue was 46 press contacts, 9
 * podcasts and 1 expired CFP, and no events at all.
 *
 * Reads through the view, not the table, so the single most important rule in the
 * spec is enforced by the database rather than remembered here:
 * events_recommendable is `archived_at is null AND date_verified AND starts_at is
 * not null`. An unverified date is worse than no date.
 */

export type EventCity = HomeCity | 'virtual' | 'other'
export type EventDecision = 'attend' | 'apply' | 'ask_invite' | 'decline' | 'ask_someone'
export type EventOutcome = 'worth_it' | 'not_worth_it'
export type EventCost = 'free' | 'cheap' | 'paid' | 'unknown'
export type EventHostKind = 'operator' | 'vendor' | 'media' | 'community' | 'unknown'

/** Home first, then the three flavours of away. Produced by events_for() in SQL
 *  and recomputed here so a client-side sort cannot disagree with it. */
export type Actionability = 'home' | 'away, named attendee' | 'away, bookable' | 'away, needs a trip'

export interface EventRow {
  id: string
  title: string
  host: string | null
  host_kind: EventHostKind | null
  url: string | null
  description: string | null
  starts_at: string | null
  ends_at: string | null
  city: EventCity | null
  venue: string | null
  date_verified: boolean
  date_source_url: string | null
  item_kind: 'durable' | 'temporary'
  expires_at: string | null
  archived_at: string | null
  archive_reason: string | null
  cost_kind: EventCost | null
  ticket_price_usd: number | null
  can_attend: boolean
  can_speak: boolean
  speak_deadline_at: string | null
  /** Peer density: founders and owners running real businesses. Redefined from
   *  "technical-leader density" on 2026-09-24 (docs/DECISIONS/024). */
  draw_score: number | null
  /** Buyer density: who in the room could hire Mindmake or buy the pilot. */
  demand_score: number | null
  score_reason: string | null
  goal_ids: string[] | null
  named_attendees: string[] | null
  scored_at: string | null
  source: string
  source_ref: string | null
  decision: EventDecision | null
  decided_at: string | null
  outcome: EventOutcome | null
  outcome_note: string | null
  outcome_at: string | null
  created_at: string
  updated_at: string
  // Scoring inputs (migration 20260924120000). Kept so a surprising rank can be
  // explained on the card without a re-run.
  peer_density: number | null
  buyer_density: number | null
  practitioner_density: number | null
  vendor_density: number | null
  seniority: number | null
  seniority_note: string | null
  score_version: number
  scored_source: 'cron' | 'manual' | 'vps_legacy' | null
}

export interface RankedEvent extends EventRow {
  actionability: Actionability
  rank_score: number
  /** True while this row has never been judged under the current definition.
   *  The card shows it rather than presenting a stale number as a verdict. */
  unscored: boolean
}

/** The same weights as api/_eventScore.ts and events_for(). Peer density leads
 *  because the stated ask was people to learn from first. */
const RANK_DRAW = 0.55
const RANK_DEMAND = 0.45

const TWENTY_ONE_DAYS_MS = 21 * 24 * 3600 * 1000

export function actionabilityOf(e: EventRow, home: HomeCity): Actionability {
  if (e.city === home || e.city === 'virtual') return 'home'
  if ((e.named_attendees || []).length > 0) return 'away, named attendee'
  if (e.starts_at && new Date(e.starts_at).getTime() > Date.now() + TWENTY_ONE_DAYS_MS) return 'away, bookable'
  return 'away, needs a trip'
}

export function rankScoreOf(e: EventRow): number {
  return Math.round(((e.draw_score ?? 0) * RANK_DRAW + (e.demand_score ?? 0) * RANK_DEMAND) * 10) / 10
}

/**
 * Polled read of the attend lane, ranked for one city.
 *
 * AWAY CITIES ARE RANKED DOWN, NEVER FILTERED OUT. Archiving is only ever for the
 * dead; an away-city event is unactionable, not dead, and becomes live the moment
 * a trip is booked. Filtering here would rebuild the mistake that destroyed 26
 * New York rows once already, just in TypeScript instead of SQL.
 */
export function useEvents(opts: { city?: HomeCity; upcomingOnly?: boolean } = {}) {
  const { city: activeCity } = useHomeCity()
  const city = opts.city ?? activeCity
  const upcomingOnly = opts.upcomingOnly !== false

  const [rows, setRows] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let q = supabase
        .from('events_recommendable')
        .select('*')
        .order('starts_at', { ascending: true })
      if (upcomingOnly) q = q.gt('starts_at', new Date().toISOString())
      const { data, error: err } = await q
      if (cancelled) return
      if (err) {
        console.warn('[useEvents] fetch error', err.message)
        setRows([])
        setError(err.message)
      } else {
        setRows((data as EventRow[]) || [])
        setError(null)
      }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [upcomingOnly])

  const events = useMemo<RankedEvent[]>(() => {
    const ranked = rows.map(e => ({
      ...e,
      actionability: actionabilityOf(e, city),
      rank_score: rankScoreOf(e),
      unscored: e.scored_at === null || e.scored_source === 'vps_legacy',
    }))
    ranked.sort((a, b) => {
      const ah = a.actionability === 'home' ? 0 : 1
      const bh = b.actionability === 'home' ? 0 : 1
      if (ah !== bh) return ah - bh
      if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score
      return (a.starts_at || '').localeCompare(b.starts_at || '')
    })
    return ranked
  }, [rows, city])

  const home = useMemo(() => events.filter(e => e.actionability === 'home'), [events])
  const away = useMemo(() => events.filter(e => e.actionability !== 'home'), [events])

  return {
    events,
    home,
    away,
    city,
    loading,
    error,
    /** How much of the lane has never been judged under the current axes. The
     *  surface says this out loud rather than showing stale numbers as verdicts. */
    unscoredCount: useMemo(() => events.filter(e => e.unscored).length, [events]),
  }
}
