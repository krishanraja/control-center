import React, { useState } from 'react'
import { ExternalLink, PenLine, Search, X } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { LeadSourcePill } from './LeadSourcePill'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { FeedbackButton } from './shared/FeedbackButton'
import type { ContentIdeaRow, IdeaState } from '../hooks/useRealtimeContentIdeas'

interface Props {
  idea: ContentIdeaRow
  onOpen?: (id: string) => void
}

/**
 * Content idea card. Replaces the title+age+link card on the Content lane.
 *
 * Renders the user's stated columns: what idea has been seeded, why it's a
 * good one (thesis), where it should go (distribution). Plus provenance
 * front-and-centre so "where did this come from?" is one glance.
 */
export function ContentIdeaCard({ idea: i, onOpen }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | IdeaState>(null)

  const setState = async (next: IdeaState) => {
    h.heavy()
    setBusy(next)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: i.id, state: next }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const labels: Partial<Record<IdeaState, string>> = {
        drafting: 'Promoted to drafting.',
        researching: 'Sent to Zara for research.',
        dropped: 'Dropped.',
      }
      h.success()
      toast(labels[next] || 'Updated.', 'success')
    } catch {
      h.error()
      toast('Could not update idea — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const distribution = Array.isArray(i.distribution)
    ? (i.distribution as string[]).filter(Boolean)
    : []

  return (
    <article className="rounded-xl border border-rose-500/15 bg-rose-500/[0.03] p-3 hover:border-rose-500/25 transition-colors">
      {/* Header: state · source · age */}
      <header className="flex items-center gap-1.5 flex-wrap text-[10px] mb-2">
        <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 uppercase tracking-[0.1em] font-semibold">
          {i.state}
        </span>
        <LeadSourcePill source={i.source_type} href={i.source_url || null} />
        <span className="text-white/35 tabular-nums ml-auto">
          {humanAge(i.updated_at)}
        </span>
      </header>

      <button
        type="button"
        onClick={() => onOpen?.(i.id)}
        className="text-left w-full"
      >
        <p className="text-[13px] font-semibold text-white leading-snug">{i.idea}</p>
      </button>

      {i.thesis && (
        <p className="text-[11px] text-white/65 leading-snug mt-1.5">
          <span className="text-white/35">Thesis: </span>
          {i.thesis}
        </p>
      )}

      {distribution.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <span className="text-[10px] text-white/35">→</span>
          {distribution.map((d) => (
            <span
              key={d}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/75"
            >
              {d}
            </span>
          ))}
        </div>
      )}

      {i.source_snippet && (
        <details className="mt-2">
          <summary className="text-[10px] text-white/35 cursor-pointer hover:text-white/55 transition-colors">
            Source quote
          </summary>
          <p className="text-[11px] text-white/55 italic mt-1 leading-snug">
            "{i.source_snippet}"
          </p>
        </details>
      )}

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {i.state === 'seeded' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setState('drafting') }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-rose-500/30 text-rose-200 hover:bg-rose-500/15 disabled:opacity-40 transition-colors"
          >
            <PenLine size={11} />
            Draft now
          </button>
        )}
        {i.state === 'seeded' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setState('researching') }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          >
            <Search size={11} />
            Research
          </button>
        )}
        {i.draft_link && (
          <a
            href={i.draft_link}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Draft
          </a>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setState('dropped') }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors ml-auto"
          title="Drop this idea"
        >
          <X size={11} />
        </button>
      </div>
    </article>
  )
}
