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

export type IdeaState =
  | 'seeded'
  | 'researching'
  | 'drafting'
  | 'review'
  | 'approved'
  | 'published'
  | 'dropped'

export interface ContentIdeaRow {
  id: string
  idea: string
  thesis?: string | null
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
  related_idea_ids?: string[] | null
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
