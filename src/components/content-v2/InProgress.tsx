import { useMemo, useState } from 'react'
import { CheckSquare, ChevronLeft, ChevronRight, GitMerge, Square } from '@/lib/icons'
import { useFitRows } from '../../hooks/useFitRows'
import type { ContentIdeaRow, IdeaState } from '../../hooks/useRealtimeContentIdeas'
import { ContentIdeaCardActionable } from '../ContentIdeaCardActionable'
import { SynthesisModal } from '../content/SynthesisModal'
import { Eyebrow } from '../shared/Eyebrow'

// The pieces already in flight for one format, grouped by state.
//
// This is the pipeline board from the retired desktop surface, folded into the
// lane so a format shows its work as well as its supply. Each state stays
// bounded (LANE_CAP) so the browser never mounts an unbounded list again; the
// overflow is a count, and the phone deck is where a long upstream pile gets
// cleared. Two or more drafts can be folded into one narrative here, which is
// the synthesis flow the old multi-select bar carried.

const LANE_CAP = 8

const STATE_ORDER: IdeaState[] = ['review', 'approved', 'drafting', 'researching', 'seeded']

const STATE_META: Record<IdeaState, { title: string; description: string; tone: string }> = {
  seeded:      { title: 'Seeded',      description: 'Raw idea captured, needs research.',    tone: 'text-ink-faint' },
  researching: { title: 'Researching', description: 'Being dug into for shape.',            tone: 'text-blue-300' },
  drafting:    { title: 'Drafting',    description: 'Being written now.',                  tone: 'text-violet-300' },
  review:      { title: 'Review',      description: 'Ready for you to read and approve.',  tone: 'text-amber-300' },
  approved:    { title: 'Approved',    description: 'Approved, waiting to go out.',        tone: 'text-emerald-300' },
  published:   { title: 'Published',   description: 'Live. Now watch how it performs.',    tone: 'text-emerald-400/80' },
  dropped:     { title: 'Dropped',     description: 'Killed before publish.',              tone: 'text-ink-faint' },
  absorbed:    { title: 'Absorbed',    description: 'Folded into a synthesized narrative.', tone: 'text-violet-300/60' },
}

export function InProgress({ ideas, testIdPrefix, fit = false }: {
  ideas: ContentIdeaRow[]
  testIdPrefix: string
  /** True on a desk, where this section owns the height it is given and must
   *  not exceed it. It then renders one flat, paged list instead of the
   *  stacked accordions, which cannot be bounded without clipping one. */
  fit?: boolean
}) {
  const [merging, setMerging] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [synthOpen, setSynthOpen] = useState(false)

  const byState = useMemo(() => {
    const out: Partial<Record<IdeaState, ContentIdeaRow[]>> = {}
    for (const i of ideas) (out[i.state] ||= []).push(i)
    return out
  }, [ideas])

  const inFlight = STATE_ORDER.reduce((n, s) => n + (byState[s]?.length || 0), 0)

  const mergeable = ideas.filter(i => ['drafting', 'review', 'researching'].includes(i.state))
  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const chosen = ideas.filter(i => selected.has(i.id))

  // ── the desk's flat, paged list ────────────────────────────────────────
  //
  // On a desk this section is inside a no-scroll stage, so it gets a height
  // and must live within it. The accordions cannot: five groups, each capped
  // at eight, is a pile no box bounds, and the only ways to bound it are to
  // clip a card or to scroll — the two things Krish named.
  //
  // Flat also removes a duplication that was already there. Every card prints
  // its own state chip, so the group header above four cards marked REVIEW
  // said REVIEW a fifth time.
  const ordered = useMemo(
    () => STATE_ORDER.flatMap(s => (byState[s] || [])),
    [byState],
  )
  const [page, setPage] = useState(0)
  const { count, width, boxRef, listRef } = useFitRows(ordered.length, { min: 1, max: LANE_CAP * 2 })
  // Two columns once the stage is wide enough for two readable cards side by
  // side. Measured off the box, never off the viewport: at 1920 the work
  // column is about 1600px and a single column left a third of the desk bare.
  const cols = width >= 760 ? 2 : 1
  const pages = Math.max(1, Math.ceil(ordered.length / Math.max(1, count)))
  const current = Math.min(page, pages - 1)
  const window_ = ordered.slice(current * count, current * count + count)
  const first = current * count + 1
  const last = Math.min(ordered.length, current * count + window_.length)

  // After every hook, not before: an early return above `useFitRows` changes
  // the hook count between renders, which React rejects outright (#310) and
  // which took the whole tab down to its error boundary.
  if (inFlight === 0) return null

  return (
    <section
      data-testid={`${testIdPrefix}-in-progress`}
      className={fit ? 'flex min-h-0 flex-1 flex-col' : undefined}
    >
      <h3 className={`mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 ${fit ? 'shrink-0' : ''}`}>
        <Eyebrow>In progress</Eyebrow>
        <span className="text-micro text-ink-faint tabular-nums">
          {fit && ordered.length > count ? `${first}–${last} of ${inFlight}` : `${inFlight} in flight`}
        </span>
        {mergeable.length >= 2 && !merging && (
          <button
            type="button"
            onClick={() => setMerging(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-micro font-medium text-ink-faint hover:bg-white/[0.05] hover:text-ink-muted"
          >
            <GitMerge size={11} /> Fold drafts together
          </button>
        )}
        {fit && pages > 1 && (
          <span className="ml-auto flex items-center gap-1" data-testid={`${testIdPrefix}-pager`}>
            <button
              type="button" aria-label="Previous page" disabled={current === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              className="rounded-md border border-white/10 p-1 text-ink-faint hover:bg-white/[0.05] hover:text-ink-muted disabled:opacity-30"
            ><ChevronLeft size={12} /></button>
            <button
              type="button" aria-label="Next page" disabled={current >= pages - 1}
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              className="rounded-md border border-white/10 p-1 text-ink-faint hover:bg-white/[0.05] hover:text-ink-muted disabled:opacity-30"
            ><ChevronRight size={12} /></button>
          </span>
        )}
      </h3>

      {merging && (
        <div className="mb-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.05] p-3">
          <div className="flex items-center gap-2">
            <p className="text-label text-ink-muted">Pick two or more to fold into one narrative{selected.size ? `, ${selected.size} chosen` : ''}.</p>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => { setMerging(false); setSelected(new Set()) }} className="rounded px-2 py-1 text-label text-ink-faint hover:text-ink-muted">Cancel</button>
              <button
                type="button"
                disabled={selected.size < 2}
                onClick={() => setSynthOpen(true)}
                className="rounded-md border border-violet-500/40 bg-violet-500/20 px-3 py-1.5 text-label font-medium text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
              >
                Fold {selected.size} into one
              </button>
            </div>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {mergeable.map(i => {
              const checked = selected.has(i.id)
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => toggle(i.id)}
                  className={`flex max-w-[240px] flex-shrink-0 items-start gap-2 rounded-md border px-2.5 py-1.5 text-left ${checked ? 'border-violet-400/50 bg-violet-500/15' : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'}`}
                >
                  {checked ? <CheckSquare size={12} className="mt-0.5 flex-shrink-0 text-violet-300" /> : <Square size={12} className="mt-0.5 flex-shrink-0 text-ink-faint" />}
                  <span className={`min-w-0 break-words text-label ${checked ? 'text-ink' : 'text-ink-muted'}`}>{i.idea}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {fit ? (
        // The box owns the height; the list inside it is measured against it
        // and never exceeds it. overflow-hidden is a backstop, not the plan:
        // if it ever clips, useFitRows has a bug and the desk spec says so.
        <div ref={boxRef} className="min-h-0 flex-1 overflow-hidden">
          <ul ref={listRef} className={cols === 2 ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'}>
            {window_.map(i => <li key={i.id}><ContentIdeaCardActionable idea={i} /></li>)}
          </ul>
        </div>
      ) : (
      <div className="space-y-3">
        {STATE_ORDER.map(state => {
          const rows = byState[state] || []
          if (!rows.length) return null
          const meta = STATE_META[state]
          const shown = rows.slice(0, LANE_CAP)
          const overflow = rows.length - shown.length
          return (
            <details key={state} open={state === 'review' || state === 'approved'} className="rounded-xl border border-white/[0.06] bg-white/[0.015]">
              <summary className="flex cursor-pointer list-none items-baseline justify-between px-3 py-2.5">
                <span className={`text-micro uppercase tracking-[0.14em] ${meta.tone}`}>
                  {meta.title} <span className="text-ink-faint tabular-nums">{rows.length}</span>
                </span>
                <span className="text-micro text-ink-faint">{meta.description}</span>
              </summary>
              <ul className="space-y-2.5 px-3 pb-3">
                {shown.map(i => <li key={i.id}><ContentIdeaCardActionable idea={i} /></li>)}
              </ul>
              {overflow > 0 && (
                <p className="px-3 pb-3 text-micro text-ink-faint">
                  {overflow} more waiting. Clear the pile from the Queue on your phone.
                </p>
              )}
            </details>
          )
        })}
      </div>
      )}

      <SynthesisModal
        open={synthOpen}
        selected={chosen}
        onClose={() => setSynthOpen(false)}
        onSynthesized={id => {
          setSynthOpen(false); setMerging(false); setSelected(new Set())
          window.location.hash = `#/content?idea=${id}`
        }}
      />
    </section>
  )
}
