import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type VisibilityTargetType = 'cfp' | 'conference' | 'podcast' | 'newsletter' | 'guest_appearance' | 'other'

export type VisibilityTargetStatus =
  | 'sourced'
  | 'queued'
  | 'applied'
  | 'accepted'
  | 'rejected'
  | 'done'
  | 'dropped'

export type VisibilityQualityScore = 'red' | 'amber' | 'green'

export interface VisibilityTargetRow {
  id: string
  title: string
  type: VisibilityTargetType
  event_url: string | null
  cfp_url: string | null
  deadline_at: string | null
  event_start_at: string | null
  audience: string | null
  audience_size: number | null
  why_relevant: string | null
  suggested_talk_title: string | null
  relevance_score: number | null
  quality_score: VisibilityQualityScore | null
  recommended_next_step: string | null
  status: VisibilityTargetStatus
  format: string | null
  location: string | null
  ticket_price_usd: number | null
  source: string
  created_at: string
  updated_at: string
}

/**
 * Polled fetch of visibility_targets: the canonical pipeline replacing
 * nova_target_conferences (deprecated 2026-05-22 by PR 4). Includes CFPs,
 * conferences, podcasts, newsletters, guest appearances. Default filter:
 * exclude dropped and done so the Home lane stays focused on what's actionable.
 */
export function useVisibilityTargets(opts: { includeArchived?: boolean } = {}) {
  const [targets, setTargets] = useState<VisibilityTargetRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let q = supabase
        .from('visibility_targets')
        .select('*')
        .order('deadline_at', { ascending: true, nullsFirst: false })
      if (!opts.includeArchived) {
        q = q.not('status', 'in', '("dropped","done")')
      }
      const { data, error } = await q
      if (cancelled) return
      if (error) {
        console.warn('[useVisibilityTargets] fetch error', error.message)
        setTargets([])
      } else {
        setTargets((data as VisibilityTargetRow[]) || [])
      }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [opts.includeArchived])

  return { targets, loading }
}
