import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from '@/lib/icons'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { Working } from '../shared/Working'

// The month grid of scheduled and published pieces, with click-a-day
// scheduling. Ported unchanged from the retired v1 desktop surface so the
// Library keeps the one calendar the pipeline ever had.

interface CalendarCell {
  date: Date
  inMonth: boolean
  ideas: ContentIdeaRow[]
}

export function ContentCalendar({ ideas }: { ideas: ContentIdeaRow[] }) {
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
          className="px-2 py-1 rounded-md text-label text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={14} />
        </button>
        <h2 className="text-ui font-semibold text-white tabular-nums">{monthLabel}</h2>
        <button
          type="button"
          onClick={() => stepMonth(1)}
          className="px-2 py-1 rounded-md text-label text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          onClick={() => setCursor(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })}
          className="ml-2 px-2 py-1 rounded-md text-micro text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
        >
          Today
        </button>
        <span className="ml-auto text-micro text-white/45 tabular-nums">{monthIdeas.length} scheduled this month</span>
      </header>

      {monthIdeas.length === 0 && (
        <div className="mb-3 rounded-md border border-dashed border-white/[0.10] bg-white/[0.01] px-3 py-2.5 text-micro text-white/55">
          Nothing scheduled in {monthLabel}.{' '}
          {unscheduled > 0
            ? `Click any day to drop one of your ${unscheduled} in-flight idea${unscheduled === 1 ? '' : 's'} onto the calendar.`
            : 'Ideas with a publish date will appear here.'}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayHeaders.map(h => (
          <div key={h} className="text-micro uppercase tracking-[0.14em] text-white/35 text-center py-1">{h}</div>
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
              <div className={`flex items-center justify-between text-micro tabular-nums mb-1 ${isToday ? 'text-violet-200 font-semibold' : 'text-white/45'}`}>
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
                    className={`block text-micro leading-tight break-words px-1 py-0.5 rounded ${
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
                    {i.idea}
                  </a>
                ))}
                {c.ideas.length > 3 && (
                  <div className="text-micro text-white/45 px-1">+{c.ideas.length - 3}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 mt-3 text-micro text-white/45">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/40" /> Review</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500/40" /> Approved</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/40" /> Published</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/[0.15]" /> Other</span>
        <span className="ml-auto text-white/35">Click any day to schedule a draft</span>
      </div>

      {pickerDay && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Schedule a draft">
          <button aria-label="Cancel" onClick={() => setPickerDay(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-md max-h-[80vh] bg-base border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 flex flex-col">
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <h3 className="text-ui font-semibold text-white">
                Schedule for {pickerDay.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </h3>
              <p className="text-micro text-white/45 mt-0.5">
                {unscheduledIdeas.length} unscheduled idea{unscheduledIdeas.length === 1 ? '' : 's'}
              </p>
              {unscheduledIdeas.length > 8 && (
                <input
                  type="text"
                  autoFocus
                  value={pickerQuery}
                  onChange={e => setPickerQuery(e.target.value)}
                  placeholder="Filter ideas"
                  className="mt-2.5 w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-label text-white placeholder:text-white/30 focus:outline-none focus:border-violet-400/40"
                />
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {unscheduledIdeas.length === 0 ? (
                <p className="text-label text-white/45 px-3 py-8 text-center">Everything in flight already has a date.</p>
              ) : pickerMatches.length === 0 ? (
                <p className="text-label text-white/45 px-3 py-8 text-center">No ideas match “{pickerQuery}”.</p>
              ) : (
                pickerMatches.map(i => (
                  <button
                    key={i.id}
                    type="button"
                    disabled={scheduling != null}
                    onClick={() => schedule(i.id, pickerDay)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.05] disabled:opacity-50 flex items-center gap-2.5 transition-colors"
                  >
                    <span className="min-w-0 flex-1 break-words text-label text-white/85">{i.idea}</span>
                    <span className="text-micro uppercase tracking-[0.14em] text-white/40 flex-shrink-0">{i.state}</span>
                    {scheduling === i.id && <Working size={12} className="text-accent" />}
                  </button>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end">
              <button type="button" onClick={() => setPickerDay(null)} className="text-label text-white/55 hover:text-white/85 px-3 py-1.5">
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
