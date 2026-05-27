import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ContentPillar {
  id: string
  name: string
  description: string
  good_looks_like: Record<string, string>
  anti_patterns: string[]
  evidence_required: string[]
  active: boolean
}

let cache: ContentPillar[] | null = null
let inflight: Promise<ContentPillar[]> | null = null
const listeners = new Set<() => void>()

async function fetchPillars(): Promise<ContentPillar[]> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('content_pillars')
      .select('*')
      .eq('active', true)
      .order('id')
    if (error && error.code !== 'PGRST205') {
      console.warn('[useContentPillars] fetch error', error.message)
    }
    cache = (data as ContentPillar[]) || []
    inflight = null
    for (const l of listeners) l()
    return cache
  })()
  return inflight
}

export function useContentPillars() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!cache && !inflight) fetchPillars()
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  return { pillars: cache || [], loading: !cache && !!inflight }
}

const PILLAR_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'pillar:agentic_ops':        { bg: 'bg-rose-500/15',    text: 'text-rose-200',    border: 'border-rose-500/30' },
  'pillar:open_web_econ':      { bg: 'bg-amber-500/15',   text: 'text-amber-200',   border: 'border-amber-500/30' },
  'pillar:builder_economy':    { bg: 'bg-emerald-500/15', text: 'text-emerald-200', border: 'border-emerald-500/30' },
  'pillar:ai_decision_making': { bg: 'bg-violet-500/15',  text: 'text-violet-200',  border: 'border-violet-500/30' },
  'pillar:portfolio_operating':{ bg: 'bg-sky-500/15',     text: 'text-sky-200',     border: 'border-sky-500/30' },
}

export function pillarTone(id: string | null | undefined) {
  if (!id) return { bg: 'bg-white/[0.06]', text: 'text-white/65', border: 'border-white/10' }
  return PILLAR_COLORS[id] || { bg: 'bg-white/[0.06]', text: 'text-white/65', border: 'border-white/10' }
}
