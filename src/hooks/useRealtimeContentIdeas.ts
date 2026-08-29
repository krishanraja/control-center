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
  /** Output of /api/content-ideas/synthesize — a narrative drafted from N source cards. */
  | 'synthesis'
  /** Cleo | Content Lane Sourcing drafts (was mislabeled inspiration_sweep until 2026-07-27). */
  | 'lane_sourcing'

export type IdeaState =
  | 'seeded'
  | 'researching'
  | 'drafting'
  | 'review'
  | 'approved'
  | 'published'
  | 'dropped'
  /** Synthesis fold-in target — source cards flip to 'absorbed' after their
   *  cluster is synthesized into a parent narrative draft. Carries a
   *  meta.absorbed_into pointer. Excluded from the triage deck. */
  | 'absorbed'

/** The VENTURES on the Content tab: what am I working on, picked before the
 *  work (Krish 2026-08-06). Not destinations. Where a piece goes is a channel
 *  (MediaChannel), and the theme layer is still pillars. */
export type ContentLane =
  | 'publication'

/**
 * Lane values that can still be sitting on a stored row, none of which is
 * offered as a new choice; all normalize to 'publication' for display
 * (contentLanes.normalizeLane).
 *
 * The trail, because it is genuinely confusing: Techonomic retired 2026-08-06
 * and folded into MYMU. Its rows were re-laned to 'publication', which was
 * then renamed to the channel slug 'makeyourmindup' the same day. On
 * 2026-08-11 the whole content arm became Publication, so 'publication'
 * is the CANONICAL value again, and 'makeyourmindup' is now a product surface
 * (the lead magnet into CTRL) rather than a content brand.
 */
export type StoredContentLane =
  | ContentLane
  | 'mindmake' | 'builder_economy_ig'   // pre venture/channel split
  | 'makeyourmindup' | 'mymu' | 'techonomic'
  | 'signal_noise' | 'builder_economy'   // retired 2026-08-11

/**
 * Channel cuts of one piece, keyed by media channel.
 *
 * This is where a piece's per-CHANNEL derivatives live. Formats (Paid, Built)
 * are different pieces and get their own child rows via /transform; a channel
 * cut is the same argument in a different shape, so it belongs on the row.
 *
 * Written by POST /api/content-ideas/:id/channel-cut, which merges rather than
 * replaces so one piece can hold a Substack cut and a LinkedIn cut at once.
 * Until 2026-08-13 nothing wrote this column at all: channel adapts went
 * through /revise and overwrote the working draft, so only the most recent cut
 * survived and it destroyed its own source.
 */
export type TransformedOutputs = Partial<Record<
  // Live channels. Mirrors MEDIA_CHANNELS in src/lib/contentEngine.ts, minus
  // TikTok, which has no register in the corpus yet.
  | 'substack'
  | 'linkedin'
  | 'youtube'
  | 'instagram'
  | 'podcast'
  | 'signal_noise'
  // Legacy keys, still readable on old rows. Never written now: the
  // channel-cut endpoint maps them forward. 'expand' is the one that exists in
  // production, from a retired n8n flow.
  | 'twitter'
  | 'cohort_prompt'
  | 'mindmake_block'
  | 'expand',
  {
    body: string
    generated_at: string
    model?: string | null
    notes?: string | null
    visual_suggestion?: string | null
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
  /** Brand lane this piece is committed to (signal_noise | mindmake | builder_economy_ig),
   *  or a legacy stored value from before the Techonomic retirement. */
  lane?: StoredContentLane | null
  /** Sub-cadence within a lane. Mindmake: 'roundup' | 'field_learning'. Null elsewhere. */
  lane_slot?: string | null
  /** Parent idea this row was transformed from (Transform §5.5). Null for parents. */
  parent_idea_id?: string | null
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
    // Research + enrichment (dive-deeper / challenge / transform).
    research?: string[] | null
    sources?: string[] | null
    deep_dives?: Array<{ query: string; findings: string; citations?: string[]; at: string }> | null
    visual_suggestion?: string | null
    generated_by?: 'transform' | null
    // Content Engine layer (revise / challenge / score / push-to-cleo).
    revisions?: Array<{ mode: string; value?: string | null; instruction?: string | null; at: string; chars?: number }> | null
    challenges?: Array<{
      mode: string; steelman?: string; counter?: string; sharper_take?: string
      commercial_hook?: string | null; gaps?: string | null
      citations?: string[]; news?: string[]; at: string
    }> | null
    standards?: {
      scores: Record<'unique' | 'researched' | 'thoughtful' | 'kind' | 'helpful', number>
      failing: string[]
      notes?: Record<string, string>
      verdict?: string | null
      artifact_sourced?: boolean
      scored_at: string
    } | null
    cleo_pushes?: Array<{ channel: string; at: string }> | null
    /** Each Save Draft → factory run (channel + when + the Google Doc it built). */
    saved_drafts?: Array<{ channel: string; at: string; doc_url?: string | null }> | null
    /** The latest factory Google Doc + the publish-follow-up flag. */
    factory_doc?: {
      url: string | null
      channel: string
      at: string
      /** True until Krish actually publishes — keeps the piece in "your move". */
      awaiting_publish?: boolean
    } | null
  } | null
  // Content Engine v2 (spec §3): time horizon + purge deadline + dossier/library links.
  horizon?: 'news' | 'evergreen' | null
  expires_at?: string | null
  shift_id?: string | null
  library_at?: string | null
  /** 'user' rows are never auto-buried by the backburner sweep. */
  origin?: 'user' | 'agent' | null
  buried_at?: string | null
  buried_reason?: string | null
  protected_at?: string | null
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
