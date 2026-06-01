import React, { useEffect, useMemo, useState } from 'react'
import { FileText, ExternalLink, Calendar as CalendarIcon, List } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from '../../hooks/useRealtimeContentIdeas'
import { ContentIdeaCardActionable } from '../ContentIdeaCardActionable'
import { NextActionStrip } from '../shared/NextActionStrip'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

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

interface Props {
  ideaId?: string | null
  onClearIdea?: () => void
}

export function DesktopContent({ ideaId, onClearIdea }: Props = {}) {
  const { ideas, loading } = useRealtimeContentIdeas()
  const [view, setView] = useState<'lanes' | 'calendar'>('lanes')

  const byState = useMemo(() => groupByState(ideas), [ideas])
  const activeCount = ideas.filter(i => i.state !== 'dropped' && i.state !== 'published').length
  const detailIdea = useMemo(() => (ideaId ? ideas.find(i => i.id === ideaId) || null : null), [ideaId, ideas])

  // Next action: the oldest idea in `review` state — that's the one blocking
  // Krish's approval to ship. Falls back to drafting backlog if no reviews.
  const nextDecisionIdea = useMemo(() => {
    const inReview = ideas.filter(i => i.state === 'review')
    if (inReview.length > 0) {
      return [...inReview].sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))[0]
    }
    const inDraft = ideas.filter(i => i.state === 'drafting')
    return inDraft[0] || null
  }, [ideas])
  const reviewCount = (byState.review || []).length
  const draftCount = (byState.drafting || []).length

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the lanes
  // view regroups the visible ideas into the 3 daily-target lanes via
  // relevance_index (table 'content_ideas'). Calendar view is left untouched.
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'

  // Flat, state-ordered array of the ideas the lanes view would normally show.
  const visibleIdeas = useMemo(
    () => STATE_ORDER.flatMap(s => byState[s] || []),
    [byState],
  )

  // Uniform row renderer mirroring the normal lane card + its select behavior.
  const renderIdeaRow = (idea: ContentIdeaRow) =>
    idea.id === (ideaId || null)
      ? <ContentIdeaRowDisplay idea={idea} muted />
      : <ContentIdeaCardActionable idea={idea} />

  // If a deep-link was provided, scroll the lane into view once data lands.
  useEffect(() => {
    if (detailIdea) {
      // Scroll idle to top so the detail panel is visible above the lanes.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [detailIdea?.id])

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

      <NextActionStrip
        headline={reviewCount}
        headlineLabel="in review"
        insight={nextDecisionIdea
          ? nextDecisionIdea.state === 'review'
            ? `"${nextDecisionIdea.idea.slice(0, 70)}${nextDecisionIdea.idea.length > 70 ? '…' : ''}" awaiting your approval`
            : `${draftCount} drafting · oldest: "${nextDecisionIdea.idea.slice(0, 60)}${nextDecisionIdea.idea.length > 60 ? '…' : ''}"`
          : `${activeCount} active · no drafts awaiting your read`}
        ctaLabel={nextDecisionIdea ? 'Open idea' : 'View pipeline'}
        onCta={() => {
          if (!nextDecisionIdea) return
          const el = document.querySelector(`[data-content-idea-id="${nextDecisionIdea.id}"]`) as HTMLElement | null
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.style.outline = '2px solid rgba(245, 158, 11, 0.7)'
            el.style.outlineOffset = '4px'
            el.style.borderRadius = '12px'
            setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 3500)
          }
        }}
        icon={FileText}
        accent={reviewCount > 0 ? 'text-amber-300' : 'text-violet-300'}
        disabled={!nextDecisionIdea}
      />

      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.015] p-1">
          <button
            type="button"
            onClick={() => setView('lanes')}
            className={`px-3 py-1.5 text-[12px] rounded-md transition-colors inline-flex items-center gap-1.5 ${
              view === 'lanes' ? 'bg-violet-500/20 border border-violet-400/40 text-violet-100' : 'border border-transparent text-white/60 hover:text-white/85'
            }`}
          >
            <List size={12} /> Lanes
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={`px-3 py-1.5 text-[12px] rounded-md transition-colors inline-flex items-center gap-1.5 ${
              view === 'calendar' ? 'bg-violet-500/20 border border-violet-400/40 text-violet-100' : 'border border-transparent text-white/60 hover:text-white/85'
            }`}
          >
            <CalendarIcon size={12} /> Calendar
          </button>
        </div>
        {view === 'lanes' && isFocusModeEnabled() && calibrated && (
          <FocusModeToggle mode={mode} onChange={setMode} />
        )}
      </div>

      {detailIdea && (
        <section
          aria-label="Selected idea"
          className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-1"
        >
          <ContentIdeaCardActionable idea={detailIdea} expanded onClose={onClearIdea} />
        </section>
      )}

      {view === 'lanes' ? (
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
            {showFocus ? (
              <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                <FocusLanes
                  rows={visibleIdeas}
                  table="content_ideas"
                  keyOf={i => String(i.id)}
                  renderItem={renderIdeaRow}
                  fallback={null}
                  mutedLabel="Off focus"
                />
              </section>
            ) : (
              STATE_ORDER.map(s => (
                <ContentStateLane
                  key={s}
                  state={s}
                  ideas={byState[s] || []}
                  selectedId={ideaId || null}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <ContentCalendar ideas={ideas} />
      )}
    </div>
  )
}

interface CalendarCell {
  date: Date
  inMonth: boolean
  ideas: ContentIdeaRow[]
}

function ContentCalendar({ ideas }: { ideas: ContentIdeaRow[] }) {
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })

  // Bucket ideas by ISO date. Use scheduled_for first (planned), then published_at
  // (historical) as a fallback. Anything without either is dropped from the grid.
  const byDay = useMemo(() => {
    const out: Record<string, ContentIdeaRow[]> = {}
    for (const i of ideas) {
      const when = i.scheduled_for || i.published_at
      if (!when) continue
      const d = new Date(when)
      if (Number.isNaN(d.getTime())) continue
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      out[key] = out[key] || []
      out[key].push(i)
    }
    return out
  }, [ideas])

  const cells: CalendarCell[] = useMemo(() => {
    const first = new Date(year, month, 1)
    const startDow = first.getDay() // 0..6 (Sun..Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result: CalendarCell[] = []
    // Leading days from previous month
    for (let i = 0; i < startDow; i++) {
      const d = new Date(year, month, i - startDow + 1)
      result.push({ date: d, inMonth: false, ideas: [] })
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day)
      const key = `${year}-${month + 1}-${day}`
      result.push({ date: d, inMonth: true, ideas: byDay[key] || [] })
    }
    // Trailing pad to a full 6 rows (42 cells) so layout doesn't jump.
    while (result.length < 42) {
      const last = result[result.length - 1].date
      const d = new Date(last)
      d.setDate(last.getDate() + 1)
      result.push({ date: d, inMonth: false, ideas: [] })
    }
    return result
  }, [year, month, byDay])

  const monthIdeas = useMemo(() => ideas.filter(i => {
    const when = i.scheduled_for || i.published_at
    if (!when) return false
    const d = new Date(when)
    return d.getFullYear() === year && d.getMonth() === month
  }), [ideas, year, month])

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const stepMonth = (delta: number) => setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))

  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <header className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          className="px-2 py-1 rounded-md text-[12px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          aria-label="Previous month"
        >
          ‹
        </button>
        <h2 className="text-[14px] font-semibold text-white tabular-nums">{monthLabel}</h2>
        <button
          type="button"
          onClick={() => stepMonth(1)}
          className="px-2 py-1 rounded-md text-[12px] text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          aria-label="Next month"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => setCursor(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })}
          className="ml-2 px-2 py-1 rounded-md text-[11px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          Today
        </button>
        <span className="ml-auto text-[11px] text-white/45 tabular-nums">{monthIdeas.length} scheduled this month</span>
      </header>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayHeaders.map(h => (
          <div key={h} className="text-[10px] uppercase tracking-[0.12em] text-white/35 text-center py-1">{h}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, idx) => {
          const isToday = isSameDay(c.date, new Date())
          return (
            <div
              key={idx}
              className={`min-h-[80px] rounded-md border p-1.5 ${
                c.inMonth
                  ? isToday
                    ? 'border-violet-400/50 bg-violet-500/[0.06]'
                    : 'border-white/[0.06] bg-white/[0.015]'
                  : 'border-white/[0.03] bg-transparent opacity-40'
              }`}
            >
              <div className={`text-[10px] tabular-nums mb-1 ${isToday ? 'text-violet-200 font-semibold' : 'text-white/45'}`}>
                {c.date.getDate()}
              </div>
              <div className="space-y-0.5">
                {c.ideas.slice(0, 3).map(i => (
                  <a
                    key={i.id}
                    href={i.published_url || i.draft_link || `#/content?idea=${i.id}`}
                    target={i.published_url || i.draft_link ? '_blank' : undefined}
                    rel="noreferrer noopener"
                    className={`block text-[10px] leading-tight truncate px-1 py-0.5 rounded ${
                      i.state === 'published'
                        ? 'bg-emerald-500/15 text-emerald-200'
                        : i.state === 'approved'
                          ? 'bg-violet-500/15 text-violet-200'
                          : i.state === 'review'
                            ? 'bg-amber-500/15 text-amber-200'
                            : 'bg-white/[0.06] text-white/75'
                    }`}
                    title={`${i.idea} · ${i.state}`}
                  >
                    {i.idea.slice(0, 36)}{i.idea.length > 36 ? '…' : ''}
                  </a>
                ))}
                {c.ideas.length > 3 && (
                  <div className="text-[9px] text-white/45 px-1">+{c.ideas.length - 3}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 mt-3 text-[10px] text-white/45">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/40" /> Review</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500/40" /> Approved</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/40" /> Published</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/[0.15]" /> Other</span>
      </div>
    </section>
  )
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function ContentStateLane({
  state, ideas, selectedId,
}: {
  state: IdeaState
  ideas: ContentIdeaRow[]
  selectedId: string | null
}) {
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
      <ul className="space-y-2.5">
        {ideas.map(i => (
          <li key={i.id}>
            {i.id === selectedId ? (
              // Detail card already shown at the top — render a compact placeholder here.
              <ContentIdeaRowDisplay idea={i} muted />
            ) : (
              <ContentIdeaCardActionable idea={i} />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ContentIdeaRowDisplay({ idea, muted }: { idea: ContentIdeaRow; muted?: boolean }) {
  return (
    <div className={`py-2 px-3 rounded-md flex items-start gap-3 ${muted ? 'opacity-50' : ''}`}>
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
    </div>
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
