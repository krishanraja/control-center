import { useMemo } from 'react'
import { ChevronRight, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { useRealtimeContentIdeas, type ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { useHaptics } from '../../hooks/useHaptics'

// MobileContent — the "Ready for you" deck.
//
// A phone is for reviewing what's next or urgent, making a quick magic
// adjustment, and pushing — not deep work. So mobile shows ONLY the pieces that
// are genuinely next in line (awaiting Krish's sign-off = `review`, or ready to
// ship = `approved`) or urgent (scheduled today / overdue / cadence-due).
// Everything upstream (seeded / researching / drafting) is desk work and hidden
// here. Tapping a card opens the review-first composer.

interface Props { ideaId?: string | null; onClearIdea?: () => void }

type Urgency = 'overdue' | 'today' | 'due' | null

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function urgencyOf(i: ContentIdeaRow): Urgency {
  const today = todayYMD()
  if (i.scheduled_for) {
    if (i.scheduled_for < today) return 'overdue'
    if (i.scheduled_for === today) return 'today'
  }
  if (i.cadence_due_at && !Number.isNaN(Date.parse(i.cadence_due_at))) {
    if (new Date(i.cadence_due_at).getTime() <= Date.now()) return 'due'
  }
  return null
}

const URGENCY_RANK: Record<string, number> = { overdue: 0, today: 1, due: 2 }

export function MobileContent(_props: Props = {}) {
  const { ideas, loading } = useRealtimeContentIdeas()
  const h = useHaptics()

  const deck = useMemo(() => {
    const rows = ideas
      .filter(i => i.state !== 'dropped' && i.state !== 'published')
      .map(i => ({ i, urg: urgencyOf(i) }))
      // next in line (review/approved) OR urgent
      .filter(({ i, urg }) => i.state === 'review' || i.state === 'approved' || urg !== null)

    return rows.sort((a, b) => {
      // urgent first, ranked by severity
      const ua = a.urg ? URGENCY_RANK[a.urg] : 9
      const ub = b.urg ? URGENCY_RANK[b.urg] : 9
      if (ua !== ub) return ua - ub
      // then review before approved (review is waiting on you)
      const sa = a.i.state === 'review' ? 0 : a.i.state === 'approved' ? 1 : 2
      const sb = b.i.state === 'review' ? 0 : b.i.state === 'approved' ? 1 : 2
      if (sa !== sb) return sa - sb
      // oldest first (longest waiting)
      return (a.i.updated_at || '') < (b.i.updated_at || '') ? -1 : 1
    })
  }, [ideas])

  const open = (id: string) => { h.tap(); window.location.hash = `#/content?idea=${id}` }

  return (
    <MobileShell header={<TabHeader title="Ready for you" subtitle="What's next or urgent. Review, adjust, push." />}>
      <div className="pb-6 space-y-2.5">
        {loading && <div className="text-[12px] text-white/45 text-center py-8">Loading…</div>}

        {!loading && deck.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-8 text-center mt-4">
            <CheckCircle2 size={22} className="text-emerald-400/70 mx-auto mb-2" />
            <p className="text-[13px] text-white/70">You're clear.</p>
            <p className="text-[11px] text-white/40 mt-1">Nothing is waiting on your sign-off or due right now. New work shows up here when it's ready for you.</p>
          </div>
        )}

        {!loading && deck.map(({ i, urg }) => (
          <button
            key={i.id}
            type="button"
            onClick={() => open(i.id)}
            className="w-full text-left rounded-2xl border border-white/[0.08] bg-white/[0.02] active:bg-white/[0.05] p-3.5 transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <StateChip state={i.state} />
              {urg && <UrgencyChip urg={urg} />}
              {i.lane && <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{i.lane.replace(/_/g, ' ')}</span>}
              <ChevronRight size={15} className="text-white/30 ml-auto" />
            </div>
            <p className="text-[14px] font-semibold text-white leading-snug">{i.idea}</p>
            {(i.body || i.thesis) && (
              <p className="text-[12px] text-white/55 leading-snug mt-1 line-clamp-2">
                {(i.body || i.thesis || '').slice(0, 180)}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {!i.body?.trim() && <span className="text-[10px] text-amber-200/70">no draft yet</span>}
              {i.body?.includes('—') && (
                <span className="text-[10px] text-rose-200/80 inline-flex items-center gap-0.5"><AlertTriangle size={10} /> em dash</span>
              )}
              <span className="ml-auto text-[11px] text-violet-300/90">Review →</span>
            </div>
          </button>
        ))}
      </div>
    </MobileShell>
  )
}

function StateChip({ state }: { state: ContentIdeaRow['state'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    review: { label: 'Awaiting you', cls: 'bg-amber-500/15 text-amber-200' },
    approved: { label: 'Ready to ship', cls: 'bg-emerald-500/15 text-emerald-200' },
  }
  const m = map[state] || { label: state, cls: 'bg-white/[0.08] text-white/70' }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.08em] font-semibold ${m.cls}`}>{m.label}</span>
}

function UrgencyChip({ urg }: { urg: Exclude<Urgency, null> }) {
  const map = {
    overdue: { label: 'Overdue', cls: 'bg-rose-500/20 text-rose-200' },
    today: { label: 'Today', cls: 'bg-orange-500/20 text-orange-200' },
    due: { label: 'Due', cls: 'bg-orange-500/15 text-orange-200' },
  } as const
  const m = map[urg]
  return <span className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${m.cls}`}><Clock size={9} /> {m.label}</span>
}
