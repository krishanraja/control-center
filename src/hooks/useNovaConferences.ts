import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface NovaConferenceRow {
  id: string
  name: string
  url?: string | null
  speaker_page_url?: string | null
  cfp_url?: string | null
  category?: string | null
  notes?: string | null
  active?: boolean
  audience_size?: number | null
  audience_description?: string | null
  deadline_at?: string | null
  event_start_at?: string | null
  ticket_price_usd?: number | null
  format?: 'in_person' | 'hybrid' | 'online' | null
  location?: string | null
  why_relevant?: string | null
  relevance_score?: number | null
  recommended_next_step?: string | null
  last_scraped_at?: string | null
  created_at?: string | null
}

/**
 * Polled fetch of Nova's target conferences. Single source of truth for the
 * rich Visibility cards (audience / deadline / why-relevant / next step).
 * Polled rather than realtime — Nova writes to this table on her workflow
 * cadence (a few times a day max), so realtime would be overkill.
 */
export function useNovaConferences() {
  const [conferences, setConferences] = useState<NovaConferenceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('nova_target_conferences')
        .select('*')
        .eq('active', true)
        .order('deadline_at', { ascending: true, nullsFirst: false })
      if (cancelled) return
      if (error) {
        console.warn('[useNovaConferences] fetch error', error.message)
        setConferences([])
      } else {
        setConferences((data as NovaConferenceRow[]) || [])
      }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  return { conferences, loading }
}
