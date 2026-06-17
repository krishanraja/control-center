import React, { useEffect, useMemo, useState } from 'react'
import { FileText, ExternalLink, Calendar as CalendarIcon, List, Plus, Loader2, Layers, GitMerge, CheckSquare, Square, Sparkles, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from '../../hooks/useRealtimeContentIdeas'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { ContentIdeaCardActionable } from '../ContentIdeaCardActionable'
import { LaneToggle, CadenceBar, type LaneFilter } from '../content/LaneControls'
import { ContentSeedRail } from '../content/ContentSeedRail'
import { contentEngineEnabled } from '../../lib/contentEngine'
import { NextActionStrip } from '../shared/NextActionStrip'
import { BackburnerSection } from '../shared/BackburnerSection'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'
import { AppFrame } from '../shared/AppFrame'
import { useContentTriage } from '../../hooks/useContentTriage'
import { SwipeCockpit } from '../shared/SwipeCockpit'
import { buildContentTriageConfig } from '../../lib/triageConfig'
import { SynthesisModal } from '../content/SynthesisModal'

// Past this many cards a lane stops stacking and offers the triage deck instead —
// the guard that makes it structurally impossible to mount 200 cards again.
const LANE_CAP = 8
// Safety net for the focus-mode path (which flattens all states into one list).
const FOCUS_CAP = 40

const STATE_ORDER: IdeaState[] = ['seeded', 'researching', 'drafting', 'review', 'approved', 'published', 'dropped']

const STATE_META: Record<IdeaState, { title: string; description: string; tone: string }> = {
  seeded:      { title: 'Seeded',      description: 'Raw idea captured, needs research.',         tone: 'text-white/60' },
  researching: { title: 'Researching', description: 'Cleo or Vera digging for shape.',            tone: 'text-blue-300' },
  drafting:    { title: 'Drafting',    description: 'Active write. Sits with the assignee.',     tone: 'text-violet-300' },
  review:      { title: 'Review',      description: 'Ready for Krish read. Awaiting approval.',   tone: 'text-amber-300' },
  approved:    { title: 'Approved',    description: 'Cleared to ship. Awaiting distribution.',    tone: 'text-emerald-300' },
  published:   { title: 'Published',   description: 'Live. Watch for signal.',                    tone: 'text-emerald-400/80' },
  dropped:     { title: 'Dropped',     description: 'Killed before publish.',                     tone: 'text-white/30' },
  absorbed:    { title: 'Absorbed',    description: 'Folded into a synthesized narrative.',       tone: 'text-violet-300/60' },
}

interface Props {
  ideaId?: string | null
  onClearIdea?: () => void
}

export function DesktopContent({ ideaId, onClearIdea }: Props = {}) {
  const { ideas, loading } = useRealtimeContentIdeas()
  const { toast } = useToast()
  const triage = useContentTriage()
  const [view, setView] = useState<'lanes' | 'calendar'>('lanes')
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all')

  // Multi-select for narrative synthesis (Workstream 2): Krish picks 2-25
  // cards and folds them into one drafted narrative via /synthesize.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [synthOpen, setSynthOpen] = useState(false)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const clearSelection = () => { setSelectedIds(new Set()); setSelectMode(false) }
  const selectedCards = useMemo(
    () => ideas.filter(i => selectedIds.has(i.id)),
    [ideas, selectedIds],
  )

  // Desktop triage cockpit config (same swipe grammar as the other surfaces).
  const triageConfig = useMemo(() => buildContentTriageConfig(ideas, { toast }, loading), [ideas, toast, loading])

  // Everything below the lane toggle operates on the selected lane's slice.
  // Backburner-buried ideas drop out of the lanes and show in the collapsed
  // section at the bottom instead.
  const laneIdeas = useMemo(
    () => (laneFilter === 'all' ? ideas : ideas.filter(i => i.lane === laneFilter)).filter(i => !i.buried_at),
    [ideas, laneFilter],
  )
  const buriedIdeas = useMemo(
    () => ideas.filter(i => i.buried_at && i.state !== 'dropped' && i.state !== 'published'),
    [ideas],
  )

  const byState = useMemo(() => groupByState(laneIdeas), [laneIdeas])
  const activeCount = laneIdeas.filter(i => i.state !== 'dropped' && i.state !== 'published').length
  const detailIdea = useMemo(() => (ideaId ? ideas.find(i => i.id === ideaId) || null : null), [ideaId, ideas])

  // Next action: the oldest idea in `review` state — that's the one blocking
  // Krish's approval to ship. Falls back to drafting backlog if no reviews.
  const nextDecisionIdea = useMemo(() => {
    const inReview = laneIdeas.filter(i => i.state === 'review')
    if (inReview.length > 0) {
      return [...inReview].sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))[0]
    }
    const inDraft = laneIdeas.filter(i => i.state === 'drafting')
    return inDraft[0] || null
  }, [laneIdeas])
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

  const header = (
    <div className="px-6 pt-5 pb-3 border-b border-white/[0.05]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <FileText size={20} className="text-violet-300" />
            Content
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            LinkedIn, newsletter, Signal &amp; Noise, Builder Economy. From idea to live, in one lane.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/55 tabular-nums">
            {loading ? '…' : `${activeCount} active`}
          </span>
          <button
            type="button"
            onClick={() => { setSelectMode(s => !s); if (selectMode) setSelectedIds(new Set()) }}
            className={`inline-flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-3 py-1.5 transition-colors border ${
              selectMode
                ? 'text-violet-100 border-violet-400/50 bg-violet-500/20'
                : 'text-white/60 border-white/[0.08] hover:text-white/85 hover:bg-white/[0.04]'
            }`}
            title="Select multiple cards to synthesize into one narrative"
          >
            <GitMerge size={13} /> {selectMode ? `Synthesize · ${selectedIds.size}` : 'Synthesize'}
          </button>
          {activeCount > 0 && <SweepTriageButton />}
          {triage.mode === 'action' && activeCount > 0 && (
            <button
              type="button"
              onClick={triage.forceTriage}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-100 border border-violet-400/40 bg-violet-500/15 hover:bg-violet-500/25 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Layers size={13} /> Triage deck
            </button>
          )}
        </div>
      </div>
      {triage.mode === 'action' && (
        <div className="mt-3">
          <LaneToggle value={laneFilter} onChange={setLaneFilter} ideas={ideas} />
        </div>
      )}
    </div>
  )

  return (
    <AppFrame
      header={header}
      scroll={triage.mode === 'triage' ? 'none' : 'auto'}
      padded={triage.mode !== 'triage'}
    >
      {selectMode && (
        <MultiSelectBar
          ideas={ideas.filter(i => !i.buried_at && i.state !== 'dropped' && i.state !== 'published' && i.state !== 'absorbed')}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          onSynthesize={() => setSynthOpen(true)}
          onCancel={clearSelection}
        />
      )}
      <SynthesisModal
        open={synthOpen}
        onClose={() => setSynthOpen(false)}
        selected={selectedCards}
        onSynthesized={() => { clearSelection() }}
      />
      {triage.mode === 'triage' ? (
        <SwipeCockpit config={triageConfig} onExit={triage.exitTriage} />
      ) : (
        <div className="space-y-5">
      {laneFilter !== 'all' && <CadenceBar lane={laneFilter} ideas={ideas} />}

      {contentEngineEnabled() && <ContentSeedRail />}

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
                  rows={visibleIdeas.slice(0, FOCUS_CAP)}
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
                  cap={LANE_CAP}
                  onOverflow={triage.forceTriage}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <ContentCalendar ideas={laneIdeas} />
      )}

      <BackburnerSection
        table="content_ideas"
        items={buriedIdeas.map(i => ({ id: i.id, title: i.idea || '(untitled)', buried_reason: i.buried_reason }))}
        promote={{ label: 'Research', toState: 'researching' }}
      />
        </div>
      )}
    </AppFrame>
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

  // In-flight ideas with no scheduled/published date — the pool that can be
  // planned onto the calendar. Powers both the empty-state hint and the
  // click-a-day scheduling picker.
  const unscheduledIdeas = useMemo(
    () => ideas.filter(i => !i.scheduled_for && !i.published_at && i.state !== 'dropped'),
    [ideas],
  )
  const unscheduled = unscheduledIdeas.length

  const { toast } = useToast()
  const h = useHaptics()
  const [pickerDay, setPickerDay] = useState<Date | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [scheduling, setScheduling] = useState<string | null>(null)

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return unscheduledIdeas
    return unscheduledIdeas.filter(i => i.idea.toLowerCase().includes(q))
  }, [unscheduledIdeas, pickerQuery])

  // Close the picker on Escape (consistent with every other dialog).
  useEffect(() => {
    if (!pickerDay) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerDay(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerDay])

  // Reset the picker search each time it opens.
  useEffect(() => { setPickerQuery('') }, [pickerDay])

  // Schedule an idea onto a day. scheduled_for is a `date` column, so we send
  // the YYYY-MM-DD built from the clicked cell's LOCAL components (not ISO/UTC)
  // so it lands on exactly the day that was clicked. Realtime refreshes the grid.
  const schedule = async (ideaId: string, day: Date) => {
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    h.heavy()
    setScheduling(ideaId)
    try {
      const r = await fetch(`/api/content-ideas/${ideaId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: ymd }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast('Scheduled.', 'success')
      setPickerDay(null)
    } catch {
      h.error()
      toast('Could not schedule — try again.', 'error')
    } finally {
      setScheduling(null)
    }
  }

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

      {monthIdeas.length === 0 && (
        <div className="mb-3 rounded-md border border-dashed border-white/[0.10] bg-white/[0.01] px-3 py-2.5 text-[11px] text-white/55">
          Nothing scheduled in {monthLabel}.{' '}
          {unscheduled > 0
            ? `Click any day to drop one of your ${unscheduled} in-flight idea${unscheduled === 1 ? '' : 's'} onto the calendar.`
            : 'Ideas with a publish date will appear here.'}
        </div>
      )}

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
              onClick={c.inMonth ? () => { h.tap(); setPickerDay(c.date) } : undefined}
              role={c.inMonth ? 'button' : undefined}
              title={c.inMonth ? 'Schedule a draft on this day' : undefined}
              className={`group relative min-h-[80px] rounded-md border p-1.5 transition-colors ${
                c.inMonth
                  ? isToday
                    ? 'border-violet-400/50 bg-violet-500/[0.06] cursor-pointer hover:border-violet-400/70'
                    : 'border-white/[0.06] bg-white/[0.015] cursor-pointer hover:border-white/20 hover:bg-white/[0.03]'
                  : 'border-white/[0.03] bg-transparent opacity-40'
              }`}
            >
              <div className={`flex items-center justify-between text-[10px] tabular-nums mb-1 ${isToday ? 'text-violet-200 font-semibold' : 'text-white/45'}`}>
                <span>{c.date.getDate()}</span>
                {c.inMonth && <Plus size={11} className="opacity-0 group-hover:opacity-60 text-white/70" />}
              </div>
              <div className="space-y-0.5">
                {c.ideas.slice(0, 3).map(i => (
                  <a
                    key={i.id}
                    href={i.published_url || i.draft_link || `#/content?idea=${i.id}`}
                    target={i.published_url || i.draft_link ? '_blank' : undefined}
                    rel="noreferrer noopener"
                    onClick={e => e.stopPropagation()}
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
        <span className="ml-auto text-white/35">Click any day to schedule a draft</span>
      </div>

      {pickerDay && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Schedule a draft">
          <button aria-label="Cancel" onClick={() => setPickerDay(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-md max-h-[80vh] bg-[#0f0f12] border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 flex flex-col">
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <h3 className="text-[14px] font-semibold text-white">
                Schedule for {pickerDay.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </h3>
              <p className="text-[11px] text-white/45 mt-0.5">
                {unscheduledIdeas.length} unscheduled idea{unscheduledIdeas.length === 1 ? '' : 's'}
              </p>
              {unscheduledIdeas.length > 8 && (
                <input
                  type="text"
                  autoFocus
                  value={pickerQuery}
                  onChange={e => setPickerQuery(e.target.value)}
                  placeholder="Filter ideas…"
                  className="mt-2.5 w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-violet-400/40"
                />
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {unscheduledIdeas.length === 0 ? (
                <p className="text-[12px] text-white/45 px-3 py-8 text-center">Everything in flight already has a date.</p>
              ) : pickerMatches.length === 0 ? (
                <p className="text-[12px] text-white/45 px-3 py-8 text-center">No ideas match “{pickerQuery}”.</p>
              ) : (
                pickerMatches.map(i => (
                  <button
                    key={i.id}
                    type="button"
                    disabled={scheduling != null}
                    onClick={() => schedule(i.id, pickerDay)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.05] disabled:opacity-50 flex items-center gap-2.5 transition-colors"
                  >
                    <span className="text-[12px] text-white/85 truncate flex-1">{i.idea}</span>
                    <span className="text-[9px] uppercase tracking-[0.1em] text-white/40 flex-shrink-0">{i.state}</span>
                    {scheduling === i.id && <Loader2 size={12} className="animate-spin text-violet-300 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end">
              <button type="button" onClick={() => setPickerDay(null)} className="text-[12px] text-white/55 hover:text-white/85 px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function ContentStateLane({
  state, ideas, selectedId, cap, onOverflow,
}: {
  state: IdeaState
  ideas: ContentIdeaRow[]
  selectedId: string | null
  /** Max cards to render before deferring the rest to the triage deck. */
  cap?: number
  onOverflow?: () => void
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
  // Never mount an unbounded list — that was the browser-crashing bug. Past `cap`
  // we render the first slice and route the overflow into the triage deck.
  const shown = cap != null ? ideas.slice(0, cap) : ideas
  const overflow = ideas.length - shown.length
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <header className="flex items-baseline justify-between mb-2">
        <h3 className={`text-[11px] uppercase tracking-[0.14em] ${meta.tone}`}>
          {meta.title} <span className="text-white/55 tabular-nums">{ideas.length}</span>
        </h3>
        <span className="text-[10px] text-white/35">{meta.description}</span>
      </header>
      <ul className="space-y-2.5">
        {shown.map(i => (
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
      {overflow > 0 && (
        <button
          type="button"
          onClick={onOverflow}
          className="mt-2.5 w-full text-[12px] text-violet-200 border border-violet-400/30 bg-violet-500/10 hover:bg-violet-500/20 rounded-lg px-3 py-2 transition-colors"
        >
          +{overflow} more — clear in triage deck
        </button>
      )}
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

/**
 * SweepTriageButton — preview-then-apply auto-cleanup that drops off-vertical /
 * too-technical cards from the content triage deck, then trims the lowest-scoring
 * survivors until the deck is at <30. Every drop replays a manual swipe-left
 * (terminal state + feedback_queue −1 vote with reason_code), so Vera's weekly
 * aggregation clusters the pattern and proposes brief edits to Cleo.
 *
 * Calls POST /api/triage/relevance-sweep with dry=true first to show counts +
 * sample; only on Apply does it call with dry=false. Idempotent — re-clicking
 * after a clean sweep reports 0 to drop.
 */
interface SweepSample {
  id: string
  title: string
  reason_code: string
  rationale: string
  sweep: 'relevance' | 'volume_trim'
  vertical?: string | null
  confidence?: number
}
interface SweepReport {
  loaded: number
  protected: number
  relevance: { ran: boolean; off_vertical: number; too_technical: number; by_vertical: Record<string, number> }
  trim: number
  total_dropped: number
  remaining: number
  target: number
  sample: SweepSample[]
  committed: boolean
  feedback_inserted: number
}

function SweepTriageButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<SweepReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const { toast } = useToast()

  const fetchReport = async (dry: boolean): Promise<SweepReport | null> => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/triage/relevance-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'content_ideas', target: 30, dry }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) { setError(j.error || `HTTP ${r.status}`); return null }
      return j as SweepReport
    } catch (e) {
      setError(String((e as any)?.message || e)); return null
    } finally { setLoading(false) }
  }

  const onOpen = async () => {
    setOpen(true); setApplied(false); setReport(null)
    const r = await fetchReport(true)
    if (r) setReport(r)
  }

  const onApply = async () => {
    const r = await fetchReport(false)
    if (r) {
      setReport(r)
      setApplied(true)
      toast(`Dropped ${r.total_dropped} cards. Vera will cluster these.`, 'success')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/60 border border-white/[0.08] hover:text-white/85 hover:bg-white/[0.04] rounded-lg px-3 py-1.5 transition-colors"
        title="Auto-clear off-vertical and too-technical cards, then trim to 30"
      >
        <Sparkles size={13} /> Sweep
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Sweep triage">
          <button aria-label="Cancel" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#0f0f12] border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 flex flex-col">
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <h3 className="text-[14px] font-semibold text-white flex items-center gap-2">
                <Sparkles size={14} className="text-violet-300" /> Sweep triage to &lt;30
              </h3>
              <p className="text-[11px] text-white/45 mt-0.5">
                Drops off-vertical and too-technical cards, then trims the lowest-scoring rest. Every drop teaches Vera (your hand-captured cards are never touched).
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && !report && (
                <div className="flex items-center gap-2 text-[12px] text-white/55">
                  <Loader2 size={12} className="animate-spin" /> Classifying cards…
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 text-[12px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {report && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2">
                    <Stat label="Loaded" value={report.loaded} />
                    <Stat label="Off-vertical" value={report.relevance.off_vertical} tone="violet" />
                    <Stat label="Too technical" value={report.relevance.too_technical} tone="violet" />
                    <Stat label="Volume trim" value={report.trim} tone="amber" />
                  </div>
                  <div className="flex items-baseline gap-3 text-[12px]">
                    <span className="text-white/55">Will drop</span>
                    <span className="text-white tabular-nums text-[18px] font-semibold">{report.total_dropped}</span>
                    <span className="text-white/55">→ deck at</span>
                    <span className="text-white tabular-nums">{report.remaining}</span>
                    <span className="text-white/45">/ {report.target}</span>
                    {report.protected > 0 && (
                      <span className="ml-auto text-[10.5px] text-white/40">
                        {report.protected} protected (in progress / your captures)
                      </span>
                    )}
                  </div>
                  {Object.keys(report.relevance.by_vertical).length > 0 && (
                    <div className="text-[11px] text-white/55">
                      <span className="text-white/35">By vertical: </span>
                      {Object.entries(report.relevance.by_vertical)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`)
                        .join(' · ')}
                    </div>
                  )}
                  {report.sample.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-white/35 mb-2">
                        Sample (first {report.sample.length} of {report.total_dropped})
                      </p>
                      <ul className="space-y-1 max-h-[34vh] overflow-y-auto pr-1">
                        {report.sample.map(s => (
                          <li key={s.id} className="text-[12px] flex items-start gap-2 py-1 border-b border-white/[0.04]">
                            <span className={`text-[9.5px] uppercase tracking-[0.08em] font-medium flex-shrink-0 mt-1 ${
                              s.sweep === 'relevance' ? 'text-violet-300/85' : 'text-amber-300/85'
                            }`}>
                              {s.reason_code.replace(/^[a-z]+_/, '')}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-white/85 truncate">{s.title}</p>
                              <p className="text-[10.5px] text-white/40 truncate">{s.rationale}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.total_dropped === 0 && (
                    <p className="text-[12px] text-white/55 py-4 text-center">
                      Nothing to drop. The deck is already clean.
                    </p>
                  )}
                  {applied && report.committed && (
                    <div className="text-[12px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
                      Done. Dropped {report.total_dropped} cards and wrote {report.feedback_inserted} feedback votes. Vera will cluster these on Sunday.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] text-white/55 hover:text-white/85 px-3 py-1.5"
              >
                {applied ? 'Close' : 'Cancel'}
              </button>
              {report && report.total_dropped > 0 && !applied && (
                <button
                  type="button"
                  onClick={onApply}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md border border-violet-500/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Apply · drop {report.total_dropped}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'violet' | 'amber' }) {
  const valueColor = value === 0
    ? 'text-white/30'
    : tone === 'violet' ? 'text-violet-200'
    : tone === 'amber' ? 'text-amber-200'
    : 'text-white/85'
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <p className="text-[9.5px] uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p className={`text-[18px] font-semibold tabular-nums mt-0.5 ${valueColor}`}>{value}</p>
    </div>
  )
}

/**
 * MultiSelectBar — full-width strip that appears when select mode is on. Shows
 * a scrollable list of active cards with checkboxes, a running selection
 * count, and the launch button into the SynthesisModal.
 */
function MultiSelectBar({
  ideas, selectedIds, onToggle, onSynthesize, onCancel,
}: {
  ideas: ContentIdeaRow[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSynthesize: () => void
  onCancel: () => void
}) {
  const selectedCount = selectedIds.size
  // Prioritize cards with a related_idea_ids cluster — they're the most
  // obvious candidates to fold together.
  const sorted = useMemo(() => {
    return ideas.slice().sort((a, b) => {
      const ar = (a.related_idea_ids?.length || 0)
      const br = (b.related_idea_ids?.length || 0)
      if (ar !== br) return br - ar
      return (b.updated_at || '').localeCompare(a.updated_at || '')
    })
  }, [ideas])

  return (
    <div className="sticky top-0 z-20 mb-3 -mx-6 px-6 py-3 bg-[#0c0c0f]/95 backdrop-blur border-b border-violet-400/20">
      <div className="flex items-center gap-3 mb-2">
        <GitMerge size={13} className="text-violet-300" />
        <p className="text-[12px] font-medium text-white">
          Select cards to fold into one narrative
          {selectedCount > 0 && <span className="ml-2 text-violet-200 tabular-nums">· {selectedCount} chosen</span>}
        </p>
        <p className="text-[10.5px] text-white/40 hidden md:block">
          Tip: cards with the violet <span className="text-violet-300">+N</span> badge are already auto-clustered.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[12px] px-2.5 py-1 rounded text-white/60 hover:text-white/85 hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSynthesize}
            disabled={selectedCount < 2}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md border border-violet-500/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Synthesize {selectedCount} → 1
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 [scrollbar-width:thin]">
        {sorted.slice(0, 60).map(i => {
          const checked = selectedIds.has(i.id)
          const related = i.related_idea_ids?.length || 0
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => onToggle(i.id)}
              className={`flex-shrink-0 flex items-start gap-2 max-w-[240px] px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                checked
                  ? 'border-violet-400/50 bg-violet-500/15'
                  : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
              }`}
            >
              {checked
                ? <CheckSquare size={12} className="text-violet-300 flex-shrink-0 mt-0.5" />
                : <Square size={12} className="text-white/40 flex-shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <p className={`text-[11.5px] truncate ${checked ? 'text-white' : 'text-white/75'}`}>{i.idea}</p>
                <p className="text-[10px] text-white/40 truncate">
                  {[i.state, i.lane ? i.lane.replace(/_/g, ' ') : null].filter(Boolean).join(' · ')}
                  {related >= 2 && <span className="ml-1.5 text-violet-300/90">+{related}</span>}
                </p>
              </div>
            </button>
          )
        })}
        {sorted.length > 60 && (
          <div className="flex-shrink-0 flex items-center px-3 text-[11px] text-white/35">
            …{sorted.length - 60} more (filter by lane to narrow)
          </div>
        )}
      </div>
    </div>
  )
}
