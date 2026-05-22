import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PodchaserPodcast {
  id: string
  podchaser_id: string
  title: string
  author?: string | null
  web_url?: string | null
  description?: string | null
  number_of_episodes?: number | null
  latest_episode_date?: string | null
  latest_episode_title?: string | null
  latest_episode_summary?: string | null
  fit_score?: number | null
  why_relevant?: string | null
  recommended_next_step?: string | null
  host_email?: string | null
  host_linkedin?: string | null
  pitch_status?: 'discovered' | 'queued' | 'pitched' | 'responded' | 'booked' | 'dropped' | null
  last_scraped_at?: string | null
  created_at?: string | null
}

/**
 * Polled fetch of Nova's discovered podcast targets (Podchaser-sourced).
 * Mirrors the useNovaConferences shape — the Closed-Loop PR Engine writes
 * here after the Podchaser GraphQL search + Apollo enrich legs.
 *
 * If the table doesn't exist yet (migration not applied) we log a warning
 * and return [] so the Visibility lane keeps working with conferences only.
 */
export function usePodchaserPodcasts() {
  const [podcasts, setPodcasts] = useState<PodchaserPodcast[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('podchaser_podcasts')
        .select('*')
        .neq('pitch_status', 'dropped')
        .order('fit_score', { ascending: false, nullsFirst: false })
        .order('latest_episode_date', { ascending: false, nullsFirst: false })
        .limit(50)
      if (cancelled) return
      if (error) {
        console.warn('[usePodchaserPodcasts] fetch error', error.message)
        setPodcasts([])
      } else {
        setPodcasts((data as PodchaserPodcast[]) || [])
      }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  return { podcasts, loading }
}
