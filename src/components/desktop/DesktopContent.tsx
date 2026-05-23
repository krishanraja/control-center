import React, { useMemo } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from '../../hooks/useRealtimeContentIdeas'

const STATE_ORDER: IdeaState[] = ['seeded', 'researching', 'drafting', 'review', 'approved', 'published', 'dropped']

const STATE_META: Record<IdeaState, { title: string; description: string; tone: string }> = {
  seeded:      { title: 'Seeded',      description: 'Raw idea captured, needs research.',         tone: 'text-white/60' },
  researching: { title: 'Researching', description: 'Cleo or Vera digging for shape.',            tone: 'text-blue-300' },
  drafting:    { title: 'Drafting',    description: 'Active write. Sits with the assignee.',     tone: 'text-violet-300' },
  review:      { title: 'Review',      description: 'Ready for Krish read. Awaiting approval.',   tone: 'text-amber-300' },
  approved:    { title: 'Approved',    description: 'Cleared to ship. Awaiting distribution.',    tone: 'text-emerald-300' },
  published:   { title: 'Published',   description: 'Live. Watch for signal.',                    tone: 'text-emerald-400/80' },
  dropped:     { title: 'Dropped',     description: 'Killed before publish.',                     tone: 'text-white/30' },
}

export function DesktopContent() {
  const { ideas, loading } = useRealtimeContentIdeas()

  const byState = useMemo(() => groupByState(ideas), [ideas])
  const activeCount = ideas.filter(i => i.state !== 'dropped' && i.state !== 'published').length

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <FileText size={20} className="text-violet-300" />
            Content
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            LinkedIn, newsletter, Signal &amp; Noise, Builder Economy. From idea to live, in one lane.
          </p>
        </div>
        <span className="text-[11px] text-white/55 tabular-nums">
          {loading ? '…' : `${activeCount} active`}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_2fr] gap-5">
        <aside className="space-y-4">
          <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
              By state
            </h2>
            <ul className="space-y-1">
              {STATE_ORDER.map(s => {
                const count = (byState[s] || []).length
                return (
                  <li key={s} className="flex items-center justify-between gap-2 py-1 text-[12px]">
                    <span className="text-white/75 truncate">{STATE_META[s].title}</span>
                    <span className={`tabular-nums ${count > 0 ? 'text-white/85' : 'text-white/25'}`}>{count}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>

        <div className="space-y-3">
          {STATE_ORDER.map(s => (
            <ContentStateLane
              key={s}
              state={s}
              ideas={byState[s] || []}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ContentStateLane({ state, ideas }: { state: IdeaState; ideas: ContentIdeaRow[] }) {
  const meta = STATE_META[state]
  if (ideas.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.04] bg-white/[0.008] p-3">
        <h3 className={`text-[11px] uppercase tracking-[0.14em] ${meta.tone}`}>
          {meta.title} <span className="text-white/25 tabular-nums">0</span>
        </h3>
      </section>
    )
  }
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <header className="flex items-baseline justify-between mb-2">
        <h3 className={`text-[11px] uppercase tracking-[0.14em] ${meta.tone}`}>
          {meta.title} <span className="text-white/55 tabular-nums">{ideas.length}</span>
        </h3>
        <span className="text-[10px] text-white/35">{meta.description}</span>
      </header>
      <ul className="divide-y divide-white/[0.04]">
        {ideas.map(i => (
          <ContentIdeaRowDisplay key={i.id} idea={i} />
        ))}
      </ul>
    </section>
  )
}

function ContentIdeaRowDisplay({ idea }: { idea: ContentIdeaRow }) {
  return (
    <li className="py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white/90 leading-snug">{idea.idea}</p>
        {idea.thesis && (
          <p className="text-[11px] text-white/55 leading-snug mt-1 line-clamp-2">{idea.thesis}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {idea.assigned_to && (
            <span className="text-[10px] uppercase tracking-wider text-violet-300/80">{idea.assigned_to}</span>
          )}
          {(idea.distribution || []).map(d => (
            <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/55 border border-white/[0.06]">
              {d}
            </span>
          ))}
          <span className="text-[10px] text-white/30 ml-auto tabular-nums">
            {idea.updated_at && formatDistanceToNow(new Date(idea.updated_at), { addSuffix: true })}
          </span>
        </div>
      </div>
      {(idea.draft_link || idea.published_url) && (
        <a
          href={idea.published_url || idea.draft_link!}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[11px] text-violet-300 hover:text-violet-200 flex items-center gap-1 flex-shrink-0 mt-1"
        >
          {idea.published_url ? 'Live' : 'Draft'} <ExternalLink size={10} />
        </a>
      )}
    </li>
  )
}

function groupByState(ideas: ContentIdeaRow[]): Partial<Record<IdeaState, ContentIdeaRow[]>> {
  const out: Partial<Record<IdeaState, ContentIdeaRow[]>> = {}
  for (const i of ideas) {
    const arr = out[i.state] || (out[i.state] = [])
    arr.push(i)
  }
  return out
}
