import { useEffect, useMemo, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type IdeaSourceType =
  | 'signal_inbox'
  | 'cleo_chat'
  | 'agatha_chat'
  | 'openclaw_workspace'
  | 'zara_signal'
  | 'manual'
  | 'inspiration_sweep'
  | 'synthesis_hypothesis'

export type IdeaState =
  | 'seeded'
  | 'researching'
  | 'drafting'
  | 'review'
  | 'approved'
  | 'published'
  | 'dropped'

/** The four brand lanes on the Content tab (destinations, not themes — pillars are the theme layer). */
export type ContentLane =
  | 'signal_noise'
  | 'mindmaker'
  | 'techonomic'
  | 'builder_economy_ig'

/**
 * Container for Cleo's derivative outputs keyed by target format. Cleo's
 * transform webhook (`POST /webhook/cleo/transform`) writes the long-form
 * variants here so the editor can flip between them without losing the seed.
 */
export type TransformedOutputs = Partial<Record<
  | 'linkedin'
  | 'substack'
  | 'twitter'
  | 'cohort_prompt'
  | 'mindmaker_block'
  | 'expand',
  {
    body: string
    generated_at: string
    model?: string | null
    notes?: string | null
  }
>>

export interface ContentIdeaRow {
  id: string
  idea: string
  thesis?: string | null
  /** Long-form draft body, edited inline by Krish or expanded by Cleo. */
  body?: string | null
  distribution?: string[] | null
  source_type: IdeaSourceType
  source_ref?: string | null
  source_url?: string | null
  source_snippet?: string | null
  source_captured_at?: string | null
  state: IdeaState
  draft_link?: string | null
  assigned_to?: string | null
  scheduled_for?: string | null
  published_at?: string | null
  published_url?: string | null
  confidence?: number | null
  brand_fit_score?: number | null
  quality_score?: 'green' | 'amber' | 'red' | null
  pillar_id?: string | null
  related_idea_ids?: string[] | null
  /** Brand lane this piece is committed to (signal_noise | mindmaker | techonomic | builder_economy_ig). */
  lane?: ContentLane | null
  /** Sub-cadence within a lane. Mindmaker: 'roundup' | 'field_learning'. Null elsewhere. */
  lane_slot?: string | null
  /** Denormalized next-due timestamp from the cadence ledger (sort key on the All view). */
  cadence_due_at?: string | null
  /** Cleo's per-format derivatives. Empty until Transform is fired. */
  transformed_outputs?: TransformedOutputs | null
  meta?: {
    contrarian?: string | null
    adjacent_stories?: Array<{ title: string; url: string; published_date_iso?: string; why_relevant?: string }> | null
    evidence_present?: string[] | null
    source_label?: string | null
    connected_threads?: Array<{ type: 'content_idea' | 'zara_signal' | 'inspiration_doc'; id?: string; name?: string; title?: string }> | null
    falsifiable_test?: string | null
    named_entities?: string[] | null
    why_non_obvious?: string | null
  } | null
  created_at: string
  updated_at: string
}

interface Options {
  filter?: (i: ContentIdeaRow) => boolean
  sourceTypeIn?: IdeaSourceType[]
  stateIn?: IdeaState[]
}

let cache: ContentIdeaRow[] = []
let loadingCache = true
let channel: RealtimeChannel | null = null
let refCount = 0
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('content_ideas')
      .select('*')
      .order('created_at', { ascending: false })
    if (error && error.code !== 'PGRST205') {
      console.warn('[useRealtimeContentIdeas] fetch error', error.message)
    }
    cache = (data as ContentIdeaRow[]) || []
    loadingCache = false
    notify()
    inflight = null
  })()
  return inflight
}

function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('content-ideas-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'content_ideas' }, () => {
      fetchAll()
    })
    .subscribe()
}

function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useRealtimeContentIdeas(opts: Options = {}) {
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

  const refresh = useCallback(() => { fetchAll() }, [])

  const sourceKey = opts.sourceTypeIn ? opts.sourceTypeIn.join('|') : ''
  const stateKey = opts.stateIn ? opts.stateIn.join('|') : ''
  const filterFn = opts.filter

  const ideas = useMemo(() => {
    let out: ContentIdeaRow[] = cache
    if (opts.sourceTypeIn && opts.sourceTypeIn.length) {
      const allow = new Set(opts.sourceTypeIn)
      out = out.filter(i => allow.has(i.source_type))
    }
    if (opts.stateIn && opts.stateIn.length) {
      const allow = new Set(opts.stateIn)
      out = out.filter(i => allow.has(i.state))
    }
    if (filterFn) out = out.filter(filterFn)
    return out
  }, [sourceKey, stateKey, filterFn, cache])

  return { ideas, loading: loadingCache, refresh }
}
