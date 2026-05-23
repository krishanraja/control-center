import React, { useMemo } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { MobileShell } from './MobileShell'
import { TabHeader } from './TabHeader'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from '../../hooks/useRealtimeContentIdeas'

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

export function MobileContent() {
  const { ideas, loading } = useRealtimeContentIdeas({ stateIn: ACTIVE_STATES })

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
              <ul className="divide-y divide-white/[0.04]">
                {rows.map(i => (
                  <li key={i.id} className="py-2">
                    <p className="text-[13px] text-white/90 leading-snug">{i.idea}</p>
                    {i.thesis && (
                      <p className="text-[11px] text-white/55 leading-snug mt-1 line-clamp-2">{i.thesis}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {i.assigned_to && (
                        <span className="text-[10px] uppercase tracking-wider text-violet-300/80">{i.assigned_to}</span>
                      )}
                      {(i.draft_link || i.published_url) && (
                        <a
                          href={i.published_url || i.draft_link!}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[10px] text-violet-300 hover:text-violet-200 flex items-center gap-1"
                        >
                          {i.published_url ? 'Live' : 'Draft'} <ExternalLink size={9} />
                        </a>
                      )}
                      <span className="text-[10px] text-white/30 ml-auto tabular-nums">
                        {i.updated_at && formatDistanceToNow(new Date(i.updated_at), { addSuffix: true })}
                      </span>
                    </div>
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
