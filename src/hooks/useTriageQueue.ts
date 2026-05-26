import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type TriageKind = 'content_idea' | 'lead' | 'visibility' | 'guest'

export interface TriageRow {
  kind: TriageKind
  id: string
  title: string
  description: string | null
  agent: string
  source_url: string | null
  confidence: number
  sort_at: string
  source_table: 'content_ideas' | 'leads' | 'visibility_targets' | 'guests'
  meta: Record<string, unknown>
}

/**
 * Polled fetch of triage_queue (view created in 2026-05-26 audit migration).
 * Refreshes via Postgres Realtime on the 4 underlying tables.
 */
export function useTriageQueue() {
  const [rows, setRows] = useState<TriageRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('triage_queue')
        .select('*')
        .order('sort_at', { ascending: true })
        .limit(200)
      if (cancelled) return
      if (error) {
        console.warn('[useTriageQueue] fetch error', error.message)
        setRows([])
      } else {
        setRows((data as TriageRow[]) || [])
      }
      setLoading(false)
    }
    load()
    const sources = ['content_ideas', 'leads', 'visibility_targets', 'guests'] as const
    const channels = sources.map(t =>
      supabase.channel(`triage-${t}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: t }, load)
        .subscribe()
    )
    return () => {
      cancelled = true
      for (const c of channels) supabase.removeChannel(c)
    }
  }, [])

  return { rows, loading }
}
