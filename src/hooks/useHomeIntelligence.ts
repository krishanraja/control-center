import { useEffect, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Single canonical reader of `home_intelligence`.
 *
 * Marcus owns this row. The Mission Control surface (Home, daily brief,
 * top-three cards, momentum strip) all consume it through this hook so
 * we never duplicate parsing or polling logic across components.
 *
 * `summary`, `daily_brief`, `weekly_retro`, `top_three`, and `momentum`
 * are all stored as jsonb (or jsonb-like text) on the same `id='current'`
 * row. We parse defensively — production has rows where some columns are
 * stringified and some are objects.
 */

export type TopThreeKind = 'revenue' | 'growth' | 'risk'

export type DecisionKind = 'task' | 'idea' | 'guest' | 'visibility' | 'lead'

export interface TopThreeCard {
  kind: TopThreeKind
  title: string
  why_now: string
  action_label: string
  action_kind: DecisionKind
  action_target_id: string | null
  expires_at?: string | null
  // Synthesis upgrade (2026-05-28): Marcus rates leverage + explains the
  // cross-source frame so the UI can show "why this beats the alternates".
  // Optional — pre-upgrade rows in home_intelligence won't have these.
  leverage_score?: number
  reasoning?: string
  beats?: string[]
}

export interface MomentumPayload {
  days?: string[]
  mrr?: number[]
  leads?: number[]
  shipped?: number[]
  visibility?: number[]
}

export interface HomeSummary {
  headline?: string
  body?: string
  recommended_focus?: string
}

export interface DailyBrief {
  yesterday_mrr_delta_usd?: number
  one_bet?: string
  one_customer?: string
  one_anti_action?: string
  body?: string
  /** The brief could not be parsed and `body` is raw model output. Written by
   *  marcus-daily-brief's Parse + stamp node. Absent on a healthy brief. */
  degraded?: boolean
  /** Why it degraded, in the same voice the top_three fallbacks use. */
  reasoning?: string
}

export interface WeeklyRetro {
  what_worked?: string[]
  what_flopped?: string[]
  next_focus?: string
  generated_at?: string
}

export type SignalUrgency = 'critical' | 'high' | 'medium' | 'low'

/**
 * One row of Marcus's own scoreboard (`home_intelligence.metrics`). These are
 * Marcus-authored numbers with targets, not system-of-record reads — they
 * render inside his card, never in the deterministic KPI band. Stored as a
 * stringified array in production, hence the parseJson on read.
 */
export interface MarcusMetric {
  id: string
  label: string
  value: string
  target?: string
  progress_pct?: number
}

/**
 * One curated signal from Marcus's digest. The canonical shape — the Intel
 * tab, the Home intel drawer and the signal sheet all read THIS type; the
 * extended fields (urgency, days_until, source_url, event_id) have been in
 * the rows since the 2026-05-21 prompt patch and pass through untouched.
 */
export interface ExternalSignal {
  signal: string
  source?: string
  relevance?: string
  recommended_action?: string | null
  source_url?: string | null
  event_id?: string | null
  urgency?: SignalUrgency | null
  days_until?: number | null
}

export interface HomeIntelligence {
  summary: HomeSummary | null
  daily_brief: DailyBrief | null
  daily_brief_at: string | null
  weekly_retro: WeeklyRetro | null
  weekly_retro_at: string | null
  weekly_retro_ack_at: string | null
  external_signals: ExternalSignal[]
  metrics: MarcusMetric[]
  assessment: string | null
  top_three: TopThreeCard[]
  top_three_alternates: TopThreeCard[]
  top_three_reasoning: string | null
  top_three_at: string | null
  momentum: MomentumPayload | null
  momentum_at: string | null
  generated_at: string | null
}

const EMPTY: HomeIntelligence = {
  summary: null,
  daily_brief: null,
  daily_brief_at: null,
  weekly_retro: null,
  weekly_retro_at: null,
  weekly_retro_ack_at: null,
  external_signals: [],
  metrics: [],
  assessment: null,
  top_three: [],
  top_three_alternates: [],
  top_three_reasoning: null,
  top_three_at: null,
  momentum: null,
  momentum_at: null,
  generated_at: null,
}

let cache: HomeIntelligence = EMPTY
let loaded = false
let inflight: Promise<void> | null = null
let channel: RealtimeChannel | null = null
let refCount = 0
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

function parseJson<T>(raw: any, fallback: T): T {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw as T
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function parseTopThree(raw: any): TopThreeCard[] {
  const v = parseJson<any>(raw, [])
  if (!Array.isArray(v)) return []
  // Defensive: drop entries that don't have the minimum shape so the UI
  // never has to render undefined fields. Marcus's prompt enforces shape
  // but a malformed run shouldn't break Home.
  return v.filter((c): c is TopThreeCard =>
    c
    && typeof c.kind === 'string'
    && (c.kind === 'revenue' || c.kind === 'growth' || c.kind === 'risk')
    && typeof c.title === 'string'
    && typeof c.action_label === 'string'
    && typeof c.action_kind === 'string',
  )
}

async function fetchOne(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('home_intelligence')
      .select(`
        summary,
        daily_brief, daily_brief_at,
        weekly_retro, weekly_retro_at, weekly_retro_ack_at,
        external_signals,
        metrics, assessment,
        top_three, top_three_alternates, top_three_reasoning, top_three_at,
        momentum, momentum_at,
        generated_at
      `)
      .eq('id', 'current')
      .maybeSingle()
    if (error && error.code !== 'PGRST205' && error.code !== 'PGRST116') {
      console.warn('[useHomeIntelligence] fetch error', error.message)
    }
    if (!data) {
      cache = EMPTY
    } else {
      const externalRaw = (data as any).external_signals
      const external: ExternalSignal[] = Array.isArray(externalRaw)
        ? externalRaw
        : parseJson<ExternalSignal[]>(externalRaw, [])
      // metrics is stored as a stringified array in production — parseJson
      // handles both, and the shape filter drops anything half-formed.
      const metricsRaw = parseJson<any>((data as any).metrics, [])
      const metrics: MarcusMetric[] = (Array.isArray(metricsRaw) ? metricsRaw : [])
        .filter((m: any) => m && typeof m.id === 'string' && typeof m.label === 'string' && m.value != null)
        .map((m: any): MarcusMetric => ({
          id: m.id,
          label: m.label,
          value: String(m.value),
          target: m.target != null ? String(m.target) : undefined,
          progress_pct: Number.isFinite(Number(m.progress_pct)) ? Number(m.progress_pct) : undefined,
        }))
      cache = {
        summary: parseJson<HomeSummary | null>((data as any).summary, null),
        daily_brief: parseJson<DailyBrief | null>((data as any).daily_brief, null),
        daily_brief_at: (data as any).daily_brief_at ?? null,
        weekly_retro: parseJson<WeeklyRetro | null>((data as any).weekly_retro, null),
        weekly_retro_at: (data as any).weekly_retro_at ?? null,
        weekly_retro_ack_at: (data as any).weekly_retro_ack_at ?? null,
        external_signals: Array.isArray(external) ? external : [],
        metrics,
        assessment: typeof (data as any).assessment === 'string' ? (data as any).assessment : null,
        top_three: parseTopThree((data as any).top_three),
        top_three_alternates: parseTopThree((data as any).top_three_alternates),
        top_three_reasoning: typeof (data as any).top_three_reasoning === 'string'
          ? (data as any).top_three_reasoning
          : null,
        top_three_at: (data as any).top_three_at ?? null,
        momentum: parseJson<MomentumPayload | null>((data as any).momentum, null),
        momentum_at: (data as any).momentum_at ?? null,
        generated_at: (data as any).generated_at ?? null,
      }
    }
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('home-intelligence-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'home_intelligence' }, () => {
      fetchOne()
    })
    .subscribe()
}

function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useHomeIntelligence() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    refCount += 1
    attachChannelIfNeeded()
    if (!loaded && !inflight) fetchOne()
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      refCount -= 1
      setTimeout(detachChannelIfIdle, 0)
    }
  }, [])

  const refresh = useCallback(() => { fetchOne() }, [])
  const ackRetro = useCallback(async () => {
    const now = new Date().toISOString()
    cache = { ...cache, weekly_retro_ack_at: now }
    notify()
    await supabase
      .from('home_intelligence')
      .update({ weekly_retro_ack_at: now })
      .eq('id', 'current')
  }, [])

  return { intel: cache, loading: !loaded, refresh, ackRetro }
}
