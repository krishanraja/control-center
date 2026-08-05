import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  CouncilReviewRow, CreativeCardRow, GeoProbeRow, SocialAccountRow, TouchpointRow,
} from '../lib/growth'

/**
 * Data layer for the Growth tab.
 *
 * Reads go straight to Supabase on the anon key (house RLS is anon SELECT).
 * Every write goes through /api/growth/* on the service role, because an anon
 * client write against these tables silently does nothing. One realtime channel
 * keeps all four surfaces live while a workflow is writing behind us.
 */

async function growthApi<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || (body as { ok?: boolean })?.ok === false) {
    throw new Error((body as { error?: string })?.error || `http_${r.status}`)
  }
  return body as T
}

export function useGrowth() {
  const [touchpoints, setTouchpoints] = useState<TouchpointRow[]>([])
  const [cards, setCards] = useState<CreativeCardRow[]>([])
  const [reviews, setReviews] = useState<CouncilReviewRow[]>([])
  const [probes, setProbes] = useState<GeoProbeRow[]>([])
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const [tpQ, cardQ, revQ, probeQ, acctQ] = await Promise.all([
      supabase.from('growth_touchpoints').select('*')
        .order('product_slug', { ascending: true })
        .order('cost_efficiency_score', { ascending: false, nullsFirst: false }),
      supabase.from('growth_creative_queue').select('*')
        .order('batch_week', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('growth_council_reviews').select('*')
        .order('week_start', { ascending: false })
        .order('product_slug', { ascending: true }),
      supabase.from('growth_geo_probes').select('*').order('run_at', { ascending: false }).limit(500),
      supabase.from('growth_social_accounts').select('*').order('product_slug', { ascending: true }),
    ])
    if (!alive.current) return
    const firstErr = [tpQ, cardQ, revQ, probeQ, acctQ].map(q => q.error).find(Boolean)
    setError(firstErr ? firstErr.message : null)
    setTouchpoints((tpQ.data as TouchpointRow[]) || [])
    setCards((cardQ.data as CreativeCardRow[]) || [])
    setReviews((revQ.data as CouncilReviewRow[]) || [])
    setProbes((probeQ.data as GeoProbeRow[]) || [])
    setAccounts((acctQ.data as SocialAccountRow[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    alive.current = true
    refresh()
    const ch = supabase
      .channel('growth-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_touchpoints' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_creative_queue' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_council_reviews' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'growth_geo_probes' }, refresh)
      .subscribe()
    return () => {
      alive.current = false
      supabase.removeChannel(ch)
    }
  }, [refresh])

  // ── Touchpoint map ────────────────────────────────────────────────────────
  const patchTouchpoint = useCallback(async (id: string, patch: Record<string, unknown>) => {
    // Optimistic: the select/input snaps immediately, then the row is replaced
    // by whatever the database actually stored.
    setTouchpoints(prev => prev.map(t => (t.id === id ? { ...t, ...patch } as TouchpointRow : t)))
    const r = await growthApi<{ touchpoint: TouchpointRow }>('/api/growth/touchpoints', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch }),
    })
    setTouchpoints(prev => prev.map(t => (t.id === id ? r.touchpoint : t)))
  }, [])

  const addTouchpoint = useCallback(async (body: Record<string, unknown>) => {
    const r = await growthApi<{ touchpoint: TouchpointRow }>('/api/growth/touchpoints', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setTouchpoints(prev => [...prev, r.touchpoint])
    return r.touchpoint
  }, [])

  const answerAssumption = useCallback(async (id: string, answer: string) => {
    const r = await growthApi<{ touchpoint: TouchpointRow }>('/api/growth/touchpoints', {
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'answer_assumption', answer }),
    })
    setTouchpoints(prev => prev.map(t => (t.id === id ? r.touchpoint : t)))
  }, [])

  // ── Creative board ────────────────────────────────────────────────────────
  const patchCard = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setCards(prev => prev.map(c => (c.id === id ? { ...c, ...patch } as CreativeCardRow : c)))
    const r = await growthApi<{ card: CreativeCardRow }>('/api/growth/creative', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch }),
    })
    setCards(prev => prev.map(c => (c.id === id ? r.card : c)))
  }, [])

  const addCard = useCallback(async (body: Record<string, unknown>) => {
    const r = await growthApi<{ card: CreativeCardRow }>('/api/growth/creative', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    setCards(prev => [...prev, r.card])
    return r.card
  }, [])

  // ── Council ───────────────────────────────────────────────────────────────
  const recordDecision = useCallback(async (id: string, decision: string) => {
    const r = await growthApi<{ review: CouncilReviewRow }>('/api/growth/council', {
      method: 'PATCH',
      body: JSON.stringify({ id, krish_decision: decision }),
    })
    setReviews(prev => prev.map(v => (v.id === id ? r.review : v)))
  }, [])

  return {
    touchpoints, cards, reviews, probes, accounts, loading, error, refresh,
    patchTouchpoint, addTouchpoint, answerAssumption,
    patchCard, addCard,
    recordDecision,
  }
}

export type GrowthData = ReturnType<typeof useGrowth>
