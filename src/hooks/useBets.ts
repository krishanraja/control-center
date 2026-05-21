import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export type BetStatus = 'live' | 'won' | 'lost' | 'paused'
export type BetKind   = 'content' | 'outreach' | 'product' | 'pricing' | 'partnership' | 'other'

export interface BetRow {
  id: string
  hypothesis: string
  success_criterion: string
  kind: BetKind
  time_box_days: number
  status: BetStatus
  agent_owner?: string | null
  est_mrr_impact_usd?: number | null
  actual_mrr_impact_usd?: number | null
  learning?: string | null
  replaces_bet_id?: string | null
  started_at: string
  decided_at?: string | null
  created_at: string
  updated_at: string
}

const MS_PER_DAY = 86_400_000

/** Days elapsed of the bet's time_box. >100% means overdue for decision. */
export function elapsedPct(bet: BetRow): number {
  const elapsed = (Date.now() - new Date(bet.started_at).getTime()) / MS_PER_DAY
  return (elapsed / bet.time_box_days) * 100
}

/** True when a live bet has passed its time_box without a decision. */
export function isOverdue(bet: BetRow): boolean {
  return bet.status === 'live' && elapsedPct(bet) >= 100
}

export interface HitRate {
  kind: BetKind | 'all'
  won: number
  lost: number
  total: number
  pct: number
  mrr_won_usd: number
  mrr_lost_usd: number
}

let cache: BetRow[] = []
let loadingCache = true
let inflight: Promise<void> | null = null
let refCount = 0
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(200)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useBets] fetch error', error.message)
    }
    cache = (data as BetRow[]) || []
    loadingCache = false
    notify()
    inflight = null
  })()
  return inflight
}

let channel: any = null
function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('bets-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => fetchAll())
    .subscribe()
}
function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useBets() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    refCount += 1
    attachChannelIfNeeded()
    if (loadingCache && !inflight) fetchAll()
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      refCount -= 1
      setTimeout(detachChannelIfIdle, 0)
    }
  }, [])

  const live    = useMemo(() => cache.filter(b => b.status === 'live'),    [cache])
  const decided = useMemo(() => cache.filter(b => b.status === 'won' || b.status === 'lost'), [cache])
  const paused  = useMemo(() => cache.filter(b => b.status === 'paused'),  [cache])

  // 90-day rolling hit-rate, bucketed by kind + overall.
  const hitRates = useMemo<HitRate[]>(() => {
    const cutoff = Date.now() - 90 * MS_PER_DAY
    const recent = decided.filter(b => b.decided_at && new Date(b.decided_at).getTime() >= cutoff)
    const kinds: (BetKind | 'all')[] = ['all', 'content', 'outreach', 'product', 'pricing', 'partnership', 'other']
    return kinds.map(kind => {
      const pool = kind === 'all' ? recent : recent.filter(b => b.kind === kind)
      const won  = pool.filter(b => b.status === 'won').length
      const lost = pool.filter(b => b.status === 'lost').length
      const total = won + lost
      const mrrWon  = pool.filter(b => b.status === 'won').reduce((s, b) => s + (Number(b.actual_mrr_impact_usd) || 0), 0)
      const mrrLost = pool.filter(b => b.status === 'lost').reduce((s, b) => s + (Number(b.actual_mrr_impact_usd) || 0), 0)
      return {
        kind, won, lost, total,
        pct: total > 0 ? (won / total) * 100 : 0,
        mrr_won_usd: mrrWon,
        mrr_lost_usd: mrrLost,
      }
    }).filter(r => r.total > 0 || r.kind === 'all')
  }, [decided])

  const overdueLive = useMemo(() => live.filter(isOverdue), [live])

  return {
    bets: cache,
    live, decided, paused, overdueLive,
    hitRates,
    loading: loadingCache,
    refresh: () => fetchAll(),
  }
}

export const BET_KIND_LABEL: Record<BetKind, string> = {
  content: 'Content',
  outreach: 'Outreach',
  product: 'Product',
  pricing: 'Pricing',
  partnership: 'Partnership',
  other: 'Other',
}

export const BET_KIND_ACCENT: Record<BetKind, string> = {
  content: 'bg-rose-400',
  outreach: 'bg-emerald-400',
  product: 'bg-violet-400',
  pricing: 'bg-amber-400',
  partnership: 'bg-sky-400',
  other: 'bg-white/40',
}
