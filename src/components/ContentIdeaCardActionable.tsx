import React, { useMemo, useState } from 'react'
import { ExternalLink, Maximize2, Search, X } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { LeadSourcePill } from './LeadSourcePill'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { FeedbackButton } from './shared/FeedbackButton'
import type { ContentIdeaRow, IdeaState } from '../hooks/useRealtimeContentIdeas'
import { useContentPillars, pillarTone } from '../hooks/useContentPillars'

interface Props {
  idea: ContentIdeaRow
  /** Retained for call-site compatibility; the card no longer expands inline —
   *  opening a piece launches the full-screen composer. */
  expanded?: boolean
  onClose?: () => void
}

/**
 * Light pipeline tile for a content idea. It shows the seed at a glance and
 * opens the full-screen ContentComposer on click — all the deep-work tooling
 * (draft, Cleo chat, Refine, Materials, Research, Standards, Save Draft) lives
 * there now, not stacked inside this card. This is what killed the old
 * infinite-scroll / buried-Expand / duplicate-Transform experience.
 */
export function ContentIdeaCardActionable({ idea: i, onClose }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const { pillars } = useContentPillars()
  const [busy, setBusy] = useState<null | IdeaState>(null)
  const pillar = useMemo(() => pillars.find(p => p.id === i.pillar_id) || null, [pillars, i.pillar_id])
  const pTone = pillarTone(i.pillar_id)
  const isSynthesis = i.source_type === 'synthesis_hypothesis'
  const meta = i.meta || {}
  const contrarian = meta.contrarian || null
  const distribution = Array.isArray(i.distribution) ? (i.distribution as string[]).filter(Boolean) : []

  const open = () => { h.tap(); window.location.hash = `#/content?idea=${i.id}` }

  const setState = async (next: IdeaState) => {
    h.heavy(); setBusy(next)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: i.id, state: next }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const labels: Partial<Record<IdeaState, string>> = {
        drafting: 'Promoted to drafting.', researching: 'Sent to Zara for research.', dropped: 'Dropped.',
      }
      h.success(); toast(labels[next] || 'Updated.', 'success')
    } catch {
      h.error(); toast('Could not update idea — try again.', 'error')
    } finally { setBusy(null) }
  }

  return (
    <article data-content-idea-id={i.id} data-idea-id={i.id} className="rounded-xl border border-rose-500/15 bg-rose-500/[0.03] p-3 hover:border-rose-500/30 transition-colors">
      <header className="flex items-center gap-1.5 flex-wrap text-[10px] mb-2">
        <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 uppercase tracking-[0.1em] font-semibold">{i.state}</span>
        <LeadSourcePill source={i.source_type} href={i.source_url || null} />
        {pillar && (
          <span className={`px-1.5 py-0.5 rounded border ${pTone.bg} ${pTone.text} ${pTone.border} uppercase tracking-[0.08em]`} title={pillar.description}>{pillar.name}</span>
        )}
        {isSynthesis && (
          <span className="px-1.5 py-0.5 rounded border border-violet-400/40 bg-violet-500/15 text-violet-100 uppercase tracking-[0.08em] font-semibold">Synthesis</span>
        )}
        {typeof i.brand_fit_score === 'number' && (
          <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/65 tabular-nums" title="Brand fit score (1-10)">Fit {i.brand_fit_score}</span>
        )}
        {i.body && i.body.trim() && (
          <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200/80" title="Has a draft">draft</span>
        )}
        <span className="text-white/35 tabular-nums ml-auto">{humanAge(i.updated_at)}</span>
        {onClose && (
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80 ml-1" aria-label="Close detail"><X size={12} /></button>
        )}
      </header>

      <button type="button" onClick={open} className="text-left w-full">
        <p className="text-[13px] font-semibold text-white leading-snug">{i.idea}</p>
      </button>

      {i.thesis && (
        <p className="text-[11px] text-white/65 leading-snug mt-1.5"><span className="text-white/35">Thesis: </span>{i.thesis}</p>
      )}

      {!isSynthesis && contrarian && (
        <details className="mt-2">
          <summary className="text-[10px] text-amber-300/70 cursor-pointer hover:text-amber-200 transition-colors">Contrarian view</summary>
          <p className="text-[11px] text-amber-200/80 italic mt-1 leading-snug">{contrarian}</p>
        </details>
      )}

      {distribution.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <span className="text-[10px] text-white/35">→</span>
          {distribution.map(d => (<span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/75">{d}</span>))}
        </div>
      )}

      {i.source_snippet && (
        <details className="mt-2">
          <summary className="text-[10px] text-white/35 cursor-pointer hover:text-white/55 transition-colors">Source quote</summary>
          <p className="text-[11px] text-white/55 italic mt-1 leading-snug">"{i.source_snippet}"</p>
        </details>
      )}

      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        <button type="button" onClick={open}
          className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-semibold border border-violet-500/40 text-violet-100 bg-violet-500/15 hover:bg-violet-500/25 transition-colors min-h-[44px]">
          <Maximize2 size={11} /> Open
        </button>

        {i.state === 'seeded' && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setState('researching') }} disabled={busy !== null}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors min-h-[44px]">
            <Search size={11} /> Research
          </button>
        )}

        {i.draft_link && (
          <a href={i.draft_link} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
            className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors min-h-[44px]">
            <ExternalLink size={11} /> Doc
          </a>
        )}

        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
          <FeedbackButton sourceTable="content_ideas" sourceId={i.id} agentId="cleo" compact />
          <button type="button" onClick={(e) => { e.stopPropagation(); setState('dropped') }} disabled={busy !== null}
            className="flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors min-h-[44px] min-w-[44px]" title="Drop this idea">
            <X size={11} />
          </button>
        </div>
      </div>
    </article>
  )
}
