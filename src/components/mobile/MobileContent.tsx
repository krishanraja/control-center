import React, { useEffect, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './TabHeader'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from '../../hooks/useRealtimeContentIdeas'
import { ContentIdeaCardActionable } from '../ContentIdeaCardActionable'

import { FeedbackButton } from '../shared/FeedbackButton'
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

  return (
    <MobileShell
      header={<TabHeader title="Content" subtitle="Ideas to live, one lane" />}
    >
      <div className="px-3 pb-6 space-y-3">
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
