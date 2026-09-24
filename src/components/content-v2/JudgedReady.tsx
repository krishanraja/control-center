import { useMemo, useState } from 'react'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { useJudgeVerdictsForRuns } from '../../hooks/useJudgeVerdicts'
import {
  compareReady, judgeAsk, ladderVerdict, readyStanding,
  type LadderVerdict, type ReadyStanding,
} from '../../lib/ladder'
import { Eyebrow } from '../shared/Eyebrow'
import { SlideOver } from '../shared/SlideOver'

// The pieces the panel judged ready, for one lane, best first.
//
// ── WHY THIS IS IN THE LANE ROOM ─────────────────────────────────────────
//
// The lane room is where Krish picks what to write, and until 2026-09-24 it
// showed nothing the panel had worked out. The decide queue serves the
// repairable band and the Not lifted list serves the weak one, so a ready
// piece could not reach DecideCard from any screen: the pieces the machine
// was most sure of were the only ones he could not settle.
//
// ── WHY THE ORDER COMES FROM THE MARKS, NOT THE STANDING ────────────────
//
// All 25 ready pieces stood at exactly 7 that day. Sorting by the standing
// sorted nothing, so the order comes from compareReady in src/lib/ladder.ts:
// how many checks rated it 8 or more, then its lowest model check. Both are
// read from judge_verdicts in one query for the whole lane.
//
// ── WHY A TAP OPENS DecideCard ───────────────────────────────────────────
//
// For the reason SundayList does: it is the one surface that captures a reason
// in one tap and carries panel_run_id, and panel_run_id is the field that
// turns judge_calibration from an empty view into a report card. A second
// decision surface here would be a fork of it.

/** How many rows a lane shows before "Show all". Three fits a desk stage
 *  beside the in-progress board, and ranking is what makes three enough. */
const SHOWN = 3

interface ReadyItem {
  row: ContentIdeaRow
  verdict: LadderVerdict
  standing: ReadyStanding | null
}

function praiseLine(s: ReadyStanding): string {
  if (!s.praised) return 'No check rated it 8'
  return `${s.praised} check${s.praised === 1 ? '' : 's'} rated it 8 or more`
}

function Row({ item, onOpen }: { item: ReadyItem; onOpen: () => void }) {
  const { row, verdict, standing } = item
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid={`ready-row-${row.id}`}
        className="tap-44 w-full rounded-xl border border-white/8 bg-white/[0.02] p-3 text-left transition-colors hover:border-white/15"
      >
        {/* The angle the panel actually judged, as on the Not lifted list: a
            verdict on the argument shown against the seed would be a small lie
            in the place he reads to decide. */}
        <p className="text-body text-ink">{verdict.expansion.angle || row.idea}</p>
        {verdict.expansion.angle ? <p className="mt-1 text-micro text-ink-faint">Seed: {row.idea}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-faint">
          <span className="tabular-nums">Panel {verdict.score ?? '—'}/10</span>
          {standing ? <span className="tabular-nums" data-testid="ready-praise">{praiseLine(standing)}</span> : null}
          <span data-testid="ready-weakest">Weakest check: {judgeAsk(verdict.weakest)}</span>
        </div>
      </button>
    </li>
  )
}

export function JudgedReady({ ideas, fit, onOpen }: {
  /** Already scoped to this lane by the room, with anything he has just
   *  decided taken out. */
  ideas: ContentIdeaRow[]
  fit: boolean
  onOpen: (id: string) => void
}) {
  const [allOpen, setAllOpen] = useState(false)

  const ready = useMemo(
    () => ideas
      .filter(i => !i.buried_at && !i.library_at)
      .map(row => ({ row, verdict: ladderVerdict(row) }))
      .filter((x): x is { row: ContentIdeaRow; verdict: LadderVerdict } => x.verdict?.band === 'ready'),
    [ideas],
  )
  const runIds = useMemo(() => ready.map(r => r.verdict.panelRunId).filter((id): id is string => Boolean(id)), [ready])
  const marks = useJudgeVerdictsForRuns(runIds, ready.length > 0)

  const ranked = useMemo(
    () => ready
      .map((r): ReadyItem => ({
        ...r,
        standing: r.verdict.panelRunId ? readyStanding(marks.byRun.get(r.verdict.panelRunId) || []) : null,
      }))
      .sort(compareReady),
    [ready, marks.byRun],
  )

  if (!ranked.length) return null

  const shown = ranked.slice(0, SHOWN)
  const rest = ranked.length - shown.length
  const open = (id: string) => { setAllOpen(false); onOpen(id) }

  const list = (items: ReadyItem[]) => (
    <ul className="space-y-2">
      {items.map(it => <Row key={it.row.id} item={it} onOpen={() => open(it.row.id)} />)}
    </ul>
  )

  return (
    <section data-testid="ready-to-write" className={fit ? 'shrink-0' : undefined}>
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Eyebrow>Ready to write</Eyebrow>
        <span className="text-micro text-ink-faint tabular-nums">
          {ranked.length} judged ready, best first
        </span>
      </h3>
      {/* Said, not hidden. Without the marks the order falls back to the
          newest verdict, and a list that looks ranked but is not is the
          failure this section exists to fix. */}
      {marks.error ? (
        <p className="mb-2 text-micro text-amber-300" data-testid="ready-marks-error">
          Could not read the checks, so these are newest first: {marks.error}
        </p>
      ) : null}
      {list(shown)}
      {rest > 0 && (fit ? (
        <>
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            data-testid="ready-show-all"
            className="tap-44 mt-2 text-label font-semibold text-ink-muted hover:text-ink"
          >
            Show all {ranked.length}
          </button>
          <SlideOver open={allOpen} onClose={() => setAllOpen(false)} ariaLabel="Ready to write" label="Ready to write">
            {list(ranked)}
          </SlideOver>
        </>
      ) : (
        <details className="group mt-2" data-testid="ready-show-all">
          <summary className="tap-44 cursor-pointer list-none text-label font-semibold text-ink-muted hover:text-ink">
            <span className="group-open:hidden">Show {rest} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className="mt-2">{list(ranked.slice(SHOWN))}</div>
        </details>
      ))}
    </section>
  )
}
