import { useMemo, useState } from 'react'
import { ChevronRight, Clock, AlertTriangle, CheckCircle2, Layers, GitMerge, Sparkles } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './primitives'
import { type ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { useContentTriage } from '../../hooks/useContentTriage'
import { TriageDeck } from '../content/TriageDeck'
import { BackburnerSection } from '../shared/BackburnerSection'
import { SynthesisModal } from '../content/SynthesisModal'
import { clusterDrafts, type DraftCluster } from '../../lib/draftClusters'

// MobileContent — two modes, driven by useContentTriage:
//
// • TRIAGE (backlog > 30): a one-card-at-a-time swipe deck over the WHOLE active
//   backlog. Left = drop, right = advance, tap = open. This is how you clear a
//   pile of 200 from your phone without a wall of cards.
// • ACTION (backlog <= 30): the "ready for you" surface — what's awaiting your
//   sign-off or due, PLUS your drafts (previously invisible), PLUS a count of
//   what's still upstream. The old build only showed review/approved, so with 0
//   of each it rendered a false "You're clear" over 25 hidden drafts. That can no
//   longer happen: the all-clear state is gated on activeCount === 0.

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
const DRAFT_CAP = 12

export function MobileContent({ ideaId }: Props = {}) {
  const triage = useContentTriage()
  const { active, activeCount, counts, loading, mode, buried } = triage
  // Drafts the user chose to merge — opens SynthesisModal (lane + optional angle),
  // which calls /api/content-ideas/synthesize and deep-links into the new draft.
  const [mergeSelection, setMergeSelection] = useState<ContentIdeaRow[] | null>(null)

  // tier 1 — genuinely next or urgent: review / approved / scheduled-today-or-overdue.
  const readyDeck = useMemo(() => {
    const rows = active
      .map(i => ({ i, urg: urgencyOf(i) }))
      .filter(({ i, urg }) => i.state === 'review' || i.state === 'approved' || urg !== null)
    return rows.sort((a, b) => {
      const ua = a.urg ? URGENCY_RANK[a.urg] : 9
      const ub = b.urg ? URGENCY_RANK[b.urg] : 9
      if (ua !== ub) return ua - ub
      const sa = a.i.state === 'review' ? 0 : a.i.state === 'approved' ? 1 : 2
      const sb = b.i.state === 'review' ? 0 : b.i.state === 'approved' ? 1 : 2
      if (sa !== sb) return sa - sb
      return (a.i.updated_at || '') < (b.i.updated_at || '') ? -1 : 1
    })
  }, [active])

  // tier 2 — drafts. Oldest first, then grouped into narrative clusters (via the
  // nightly-written related_idea_ids) so the tab can act as an editor, not just a
  // list: similar drafts cluster with a one-tap "merge into one narrative".
  const draftAll = useMemo(() => {
    return active
      .filter(i => i.state === 'drafting')
      .sort((a, b) => (a.updated_at || '') < (b.updated_at || '') ? -1 : 1)
  }, [active])
  const { clusters, looseDrafts } = useMemo(() => {
    const { clusters, loose } = clusterDrafts(draftAll)
    return { clusters, looseDrafts: loose.slice(0, DRAFT_CAP) }
  }, [draftAll])
  const renderedDraftCount = clusters.reduce((n, c) => n + c.members.length, 0) + looseDrafts.length

  const open = (id: string) => { window.location.hash = `#/content?idea=${id}` }

  // ── Triage mode: the swipe deck owns the screen.
  if (mode === 'triage') {
    return (
      <MobileShell
        scroll="none"
        header={<TabHeader title="Clear the pile" subtitle={`${activeCount} in the backlog · swipe to clear`} />}
      >
        <TriageDeck triage={triage} narrow paused={!!ideaId} />
      </MobileShell>
    )
  }

  // ── Action mode: ready-for-you + drafts + upstream count.
  const draftTotal = counts.drafting

  return (
    <MobileShell header={<TabHeader title="Content" subtitle="What's next, your drafts, and the backlog." />}>
      <div className="px-4 pb-6 space-y-2.5">
        {loading && <div className="text-[12px] text-white/45 text-center py-8">Loading…</div>}

        {!loading && activeCount === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-8 text-center mt-4">
            <CheckCircle2 size={22} className="text-emerald-400/70 mx-auto mb-2" />
            <p className="text-[13px] text-white/70">You're clear.</p>
            <p className="text-[11px] text-white/40 mt-1">Nothing in flight. New work shows up here when it's ready.</p>
          </div>
        )}

        {!loading && activeCount > 0 && (
          <>
            {/* tier 1 — ready for you */}
            {readyDeck.length > 0 && (
              <div className="mb-1.5 mt-1 text-[11px] uppercase tracking-[0.12em] text-white/40">Ready for you</div>
            )}
            {readyDeck.map(({ i, urg }) => (
              <IdeaButton key={i.id} i={i} urg={urg} onClick={() => open(i.id)} />
            ))}

            {/* tier 2 — drafts, narrative clusters first then loose */}
            {(clusters.length > 0 || looseDrafts.length > 0) && (
              <div className="flex items-center gap-2 mb-1.5 mt-4">
                <span className="text-[11px] uppercase tracking-[0.12em] text-white/40">Drafts waiting on you</span>
                <span className="text-[11px] text-white/30 tabular-nums">{draftTotal}</span>
              </div>
            )}
            {clusters.map(c => (
              <DraftClusterBlock key={c.key} cluster={c} onOpen={open} onMerge={() => setMergeSelection(c.members)} />
            ))}
            {looseDrafts.map(i => (
              <IdeaButton key={i.id} i={i} urg={null} onClick={() => open(i.id)} />
            ))}
            {draftTotal > renderedDraftCount && (
              <p className="text-[11px] text-white/35 px-1 mt-1">+{draftTotal - renderedDraftCount} more drafts</p>
            )}

            {/* readyDeck + drafts can both be empty even with active>0 — everything
                upstream. Surface it instead of a false all-clear. */}
            {readyDeck.length === 0 && clusters.length === 0 && looseDrafts.length === 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 text-center mt-2">
                <p className="text-[13px] text-white/70">Nothing awaiting your sign-off yet.</p>
                <p className="text-[11px] text-white/40 mt-1">Everything in flight is still upstream (research / seeds).</p>
              </div>
            )}

            {/* upstream count + triage entry */}
            {counts.upstream > 0 && (
              <button
                type="button"
                onClick={triage.forceTriage}
                className="w-full mt-4 flex items-center gap-2.5 rounded-2xl border border-violet-400/30 bg-violet-500/10 active:bg-violet-500/20 p-3.5 text-left transition-colors"
              >
                <Layers size={18} className="text-violet-300 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-violet-100">{counts.upstream} upstream to triage</p>
                  <p className="text-[11px] text-white/45">Seeds &amp; research piling up — swipe to clear them fast.</p>
                </div>
                <ChevronRight size={16} className="text-violet-300/70 ml-auto flex-shrink-0" />
              </button>
            )}
          </>
        )}

        {/* Retained / auto-buried ideas — set aside, promote to research from here. */}
        {!loading && buried.length > 0 && (
          <div className="pt-2">
            <BackburnerSection
              table="content_ideas"
              items={buried.map(i => ({ id: i.id, title: i.idea || '(untitled)', buried_reason: i.buried_reason }))}
              promote={{ label: 'Research', toState: 'researching' }}
            />
          </div>
        )}
      </div>

      <SynthesisModal
        open={!!mergeSelection}
        selected={mergeSelection || []}
        onClose={() => setMergeSelection(null)}
      />
    </MobileShell>
  )
}

// A group of drafts the nightly clustering flagged as one narrative thread. Shows
// the members plus a one-tap merge that folds them into a single draft (keeping
// every point + citations) via the existing synthesize flow.
function DraftClusterBlock({ cluster, onOpen, onMerge }: { cluster: DraftCluster; onOpen: (id: string) => void; onMerge: () => void }) {
  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-2.5 space-y-2">
      <div className="flex items-start gap-2 px-1 pt-0.5">
        <GitMerge size={14} className="text-violet-300 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-violet-100">
            {cluster.members.length} drafts share a narrative
          </p>
          {cluster.summary && (
            <p className="text-[11px] text-white/55 leading-snug mt-0.5">{cluster.summary}</p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {cluster.members.map(i => (
          <IdeaButton key={i.id} i={i} urg={null} onClick={() => onOpen(i.id)} />
        ))}
      </div>
      <button
        type="button"
        onClick={onMerge}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-violet-400/40 bg-violet-500/15 active:bg-violet-500/25 py-2.5 text-[12.5px] font-semibold text-violet-100 transition-colors"
      >
        <Sparkles size={13} />
        Merge into one narrative
      </button>
    </div>
  )
}

function IdeaButton({ i, urg, onClick }: { i: ContentIdeaRow; urg: Urgency; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        <span className="ml-auto text-[11px] text-violet-300/90">Open →</span>
      </div>
    </button>
  )
}

function StateChip({ state }: { state: ContentIdeaRow['state'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    review: { label: 'Awaiting you', cls: 'bg-amber-500/15 text-amber-200' },
    approved: { label: 'Ready to ship', cls: 'bg-emerald-500/15 text-emerald-200' },
    drafting: { label: 'Drafting', cls: 'bg-violet-500/15 text-violet-200' },
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
