import { useMemo, useState } from 'react'
import { CheckSquare, GitMerge, Square } from '@/lib/icons'
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
  seeded:      { title: 'Seeded',      description: 'Raw idea captured, needs research.',    tone: 'text-white/60' },
  researching: { title: 'Researching', description: 'Being dug into for shape.',            tone: 'text-blue-300' },
  drafting:    { title: 'Drafting',    description: 'Being written now.',                  tone: 'text-violet-300' },
  review:      { title: 'Review',      description: 'Ready for you to read and approve.',  tone: 'text-amber-300' },
  approved:    { title: 'Approved',    description: 'Approved, waiting to go out.',        tone: 'text-emerald-300' },
  published:   { title: 'Published',   description: 'Live. Now watch how it performs.',    tone: 'text-emerald-400/80' },
  dropped:     { title: 'Dropped',     description: 'Killed before publish.',              tone: 'text-white/30' },
  absorbed:    { title: 'Absorbed',    description: 'Folded into a synthesized narrative.', tone: 'text-violet-300/60' },
}

export function InProgress({ ideas, testIdPrefix }: { ideas: ContentIdeaRow[]; testIdPrefix: string }) {
  const [merging, setMerging] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [synthOpen, setSynthOpen] = useState(false)

  const byState = useMemo(() => {
    const out: Partial<Record<IdeaState, ContentIdeaRow[]>> = {}
    for (const i of ideas) (out[i.state] ||= []).push(i)
    return out
  }, [ideas])

  const inFlight = STATE_ORDER.reduce((n, s) => n + (byState[s]?.length || 0), 0)
  if (inFlight === 0) return null

  const mergeable = ideas.filter(i => ['drafting', 'review', 'researching'].includes(i.state))
  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const chosen = ideas.filter(i => selected.has(i.id))

  return (
    <section data-testid={`${testIdPrefix}-in-progress`}>
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Eyebrow>In progress</Eyebrow>
        <span className="text-micro text-white/40 tabular-nums">{inFlight} in flight</span>
        {mergeable.length >= 2 && !merging && (
          <button
            type="button"
            onClick={() => setMerging(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-micro font-medium text-white/60 hover:bg-white/[0.05] hover:text-white/85"
          >
            <GitMerge size={11} /> Fold drafts together
          </button>
        )}
      </h3>

      {merging && (
        <div className="mb-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.05] p-3">
          <div className="flex items-center gap-2">
            <p className="text-label text-white/85">Pick two or more to fold into one narrative{selected.size ? `, ${selected.size} chosen` : ''}.</p>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => { setMerging(false); setSelected(new Set()) }} className="rounded px-2 py-1 text-label text-white/60 hover:text-white/85">Cancel</button>
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
                  {checked ? <CheckSquare size={12} className="mt-0.5 flex-shrink-0 text-violet-300" /> : <Square size={12} className="mt-0.5 flex-shrink-0 text-white/40" />}
                  <span className={`min-w-0 break-words text-label ${checked ? 'text-white' : 'text-white/75'}`}>{i.idea}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                  {meta.title} <span className="text-white/55 tabular-nums">{rows.length}</span>
                </span>
                <span className="text-micro text-white/35">{meta.description}</span>
              </summary>
              <ul className="space-y-2.5 px-3 pb-3">
                {shown.map(i => <li key={i.id}><ContentIdeaCardActionable idea={i} /></li>)}
              </ul>
              {overflow > 0 && (
                <p className="px-3 pb-3 text-micro text-white/45">
                  {overflow} more waiting. Clear the pile from the Queue on your phone.
                </p>
              )}
            </details>
          )
        })}
      </div>

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
