import React, { useEffect, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from '../../hooks/useRealtimeContentIdeas'
import { ContentIdeaCardActionable } from '../ContentIdeaCardActionable'
import { NextActionStrip } from '../shared/NextActionStrip'

const ACTIVE_STATES: IdeaState[] = ['seeded', 'researching', 'drafting', 'review', 'approved']
const STATE_LABEL: Record<IdeaState, string> = {
  seeded: 'Seeded',
  researching: 'Researching',
  drafting: 'Drafting',
  review: 'Review',
  approved: 'Approved',
  published: 'Published',
  dropped: 'Dropped',
}

interface Props {
  ideaId?: string | null
  onClearIdea?: () => void
}

export function MobileContent({ ideaId, onClearIdea }: Props = {}) {
  const { ideas, loading } = useRealtimeContentIdeas({ stateIn: ACTIVE_STATES })

  const detailIdea = useMemo(() => (ideaId ? ideas.find(i => i.id === ideaId) || null : null), [ideaId, ideas])

  useEffect(() => {
    if (detailIdea) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [detailIdea?.id])

  const grouped = useMemo(() => {
    const out: Partial<Record<IdeaState, ContentIdeaRow[]>> = {}
    for (const i of ideas) {
      const arr = out[i.state] || (out[i.state] = [])
      arr.push(i)
    }
    return out
  }, [ideas])

  // Next action: oldest 'review' idea (blocking ship), else drafting backlog.
  const nextDecisionIdea = useMemo(() => {
    const inReview = ideas.filter(i => i.state === 'review')
    if (inReview.length > 0) {
      return [...inReview].sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))[0]
    }
    return ideas.filter(i => i.state === 'drafting')[0] || null
  }, [ideas])
  const reviewCount = (grouped.review || []).length
  const draftCount = (grouped.drafting || []).length

  const focusIdea = () => {
    if (!nextDecisionIdea) return
    const el = document.querySelector(`[data-content-idea-id="${nextDecisionIdea.id}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid rgba(245, 158, 11, 0.7)'
      el.style.outlineOffset = '4px'
      el.style.borderRadius = '12px'
      setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 3500)
    }
  }

  return (
    <MobileShell
      header={<TabHeader title="Content" subtitle="Ideas to live, one lane" />}
    >
      <div className="pb-6 space-y-3">
        <NextActionStrip
          headline={reviewCount}
          headlineLabel="in review"
          insight={nextDecisionIdea
            ? nextDecisionIdea.state === 'review'
              ? `"${nextDecisionIdea.idea.slice(0, 70)}${nextDecisionIdea.idea.length > 70 ? '…' : ''}" awaiting your approval`
              : `${draftCount} drafting · oldest: "${nextDecisionIdea.idea.slice(0, 60)}${nextDecisionIdea.idea.length > 60 ? '…' : ''}"`
            : `${ideas.length} active · no drafts awaiting your read`}
          ctaLabel={nextDecisionIdea ? 'Open' : 'View pipeline'}
          onCta={focusIdea}
          icon={FileText}
          accent={reviewCount > 0 ? 'text-amber-300' : 'text-violet-300'}
          disabled={!nextDecisionIdea}
        />

        {detailIdea && (
          <section
            aria-label="Selected idea"
            className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-1"
          >
            <ContentIdeaCardActionable idea={detailIdea} expanded onClose={onClearIdea} />
          </section>
        )}

        {loading && (
          <div className="text-[12px] text-white/45 text-center py-4">Loading…</div>
        )}

        {!loading && ideas.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center">
            <FileText size={18} className="text-white/30 mx-auto mb-2" />
            <p className="text-[12px] text-white/55">No active content ideas.</p>
            <p className="text-[11px] text-white/35 mt-1">Quick-capture an idea or wait for Cleo&rsquo;s next sweep.</p>
          </div>
        )}

        {ACTIVE_STATES.map(state => {
          const rows = grouped[state] || []
          if (rows.length === 0) return null
          return (
            <section key={state} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-violet-300 mb-2 flex items-baseline gap-2">
                {STATE_LABEL[state]} <span className="text-white/45 tabular-nums">{rows.length}</span>
              </h3>
              <ul className="space-y-2.5">
                {rows.map(i => (
                  <li key={i.id}>
                    {/* Hide the inline card if it's already pinned at the top as the detail. */}
                    {i.id !== (ideaId || null) && <ContentIdeaCardActionable idea={i} />}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </MobileShell>
  )
}
