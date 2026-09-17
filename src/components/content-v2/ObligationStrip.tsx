import { useState } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'
import { DecisionCard } from './DecisionCard'
import { Pending } from '../shared/Pending'
import { useToast } from '../shared/Toast'
import { shiftIsOnBeat } from '../../lib/contentV2'
import {
  VIDEO_GATE_LABEL,
  VIDEO_SERIES_LABEL,
  rememberVideoStudioReturnFocus,
  videoStudioListItemIsWellFormed,
  type VideoStudioReviewListItem,
} from '../../lib/videoStudio'

// What is actually waiting on you, above the rooms rather than inside one.
//
// This is the surviving half of the retired "This Week" room. The room framing
// was wrong twice over: it promised a weekly horizon the data did not keep
// (274 of 323 ideas had no expiry, so the room was really "everything since
// May"), and it put obligations behind a click. An obligation you have to
// navigate to is one you can forget about by staying on another tab.
//
// So obligations are ambient now. When there are none, this renders a single
// honest line rather than an empty card, because "nothing is waiting" is real
// information and worth saying.
//
// ── Two sections, and the lens filter (2026-09-09) ───────────────────────
//
// `section` splits this in two so the desk can put them either side of the
// work. 'urgent' is what is broken or already assembled: a dead cron, an engine
// missing a key, a brief waiting to be read. 'proposals' is the machine's open
// questions, which render UNDER the room, because five theses awaiting a ruling
// were never more important than six pieces sitting in review.
//
// The lens filter is the other half. The 2026-08-27 rewrite retired the
// governance / security / proof vocabulary and added `shifts.lens`, but nothing
// ever filtered on it, so the detector kept writing the old categories and this
// strip kept asking Krish to rule on them. Three of the five proposals on
// 2026-09-09 were governance, security and orchestration, matching none of his
// eleven tracked questions. Off-beat proposals no longer render as cards. They
// collapse into one line that says how many were discarded and why, so the
// discard is visible and auditable without being an obligation.

export function ObligationStrip({ v2, videoReviews = [], section = 'all', dense = false }: {
  v2: ReturnType<typeof useContentV2>
  /** Video Engine reviews waiting on a decision. Empty when the engine is off. */
  videoReviews?: VideoStudioReviewListItem[]
  /** Which half to render. 'urgent' goes above the work, 'proposals' below it.
   *  'all' keeps the original single-block behaviour for any other caller. */
  section?: 'all' | 'urgent' | 'proposals'
  /** True in the Content rail, which is 320px. Passed to the cards, which
   *  otherwise lay themselves out for the 768px body and overflow. */
  dense?: boolean
}) {
  const { brief, decisions, loading, runs, refresh } = v2
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()

  // Say so when a ruling fails. useContentV2's fetch wrapper throws on any
  // non-OK response and this was a bare try/finally, so a 409 ("already
  // dismissed") or a 500 cleared the spinner and changed nothing: a dead
  // button and a working one looked identical.
  const act = async (d: ContentDecisionRow, fn: () => Promise<void>) => {
    setBusy(d.id)
    try {
      await fn()
    } catch (e) {
      toast(`Could not save that: ${(e as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }


  // A shift ruling is only worth asking for when the arc landed in one of the
  // six lenses. `ref` on a shift decision is the shift id, so the lens comes
  // from the register rather than from the decision payload, which predates it.
  const lensOf = new Map(v2.shifts.map(sh => [sh.id, sh]))
  const isShiftDecision = (d: ContentDecisionRow) => d.kind === 'shift_proposal' || d.kind === 'shift_fading'
  const offBeat = decisions.filter(d => {
    if (!isShiftDecision(d)) return false
    const sh = lensOf.get(d.ref)
    // Unknown to the register is not a discard: say nothing rather than
    // silently binning a card whose arc simply has not loaded.
    return sh ? !shiftIsOnBeat(sh) : false
  })
  const offBeatIds = new Set(offBeat.map(d => d.id))
  const shown = decisions.filter(d => !offBeatIds.has(d.id))

  const wantUrgent = section === 'all' || section === 'urgent'
  const wantProposals = section === 'all' || section === 'proposals'

  // Never render the "nothing waiting" line while the answer is still loading:
  // a false statement that gets corrected later is worse than a spinner.
  if (loading) {
    // Only one of the two halves may claim the loading state, or the desk shows
    // the same spinner twice, once above the work and once below it.
    if (!wantUrgent) return null
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <Pending label="Checking what needs you" />
      </div>
    )
  }

  const hasBrief = Boolean(brief)
  // No engine terms here. Since the crons moved to the alert mark this strip's
  // "urgent" half is the weekly brief and nothing else, so an engine that is
  // down no longer keeps Content from saying it is clear.
  const urgentEmpty = !hasBrief
  const proposalsEmpty = shown.length === 0 && videoReviews.length === 0 && offBeat.length === 0

  // "Nothing is waiting" is worth saying once, on the whole tab, and only when
  // it is true of both halves. Said by each half separately it becomes two
  // contradictory lines above and below the work.
  if (urgentEmpty && proposalsEmpty) {
    if (!wantUrgent) return null
    return (
      <p className="text-label text-ink-faint px-1">
        Nothing is waiting on you right now.
      </p>
    )
  }
  if (wantUrgent && !wantProposals && urgentEmpty) return null
  if (wantProposals && !wantUrgent && proposalsEmpty) return null

  return (
    <div className="flex flex-col gap-3">
      {wantUrgent && hasBrief && (
        <button
          type="button"
          onClick={() => { if (brief) window.location.hash = `#/content?brief=${brief.week}` }}
          className="text-left rounded-xl border border-sky-400/25 bg-sky-400/[0.05] px-4 py-3 hover:bg-sky-400/[0.08] transition-colors"
        >
          <div className="flex flex-wrap items-center gap-2 text-micro font-semibold">
            <span className="rounded-full bg-sky-400/15 text-sky-300 px-2.5 py-1">Weekly brief</span>
            <span className="rounded-full bg-white/[0.06] text-ink-faint px-2.5 py-1">{brief!.week}</span>
            {brief!.sections?.stance ? (
              <span className="rounded-full bg-amber-400/10 text-amber-300 px-2.5 py-1">
                {brief!.sections.stance}
              </span>
            ) : null}
          </div>
          <p className="text-body text-ink-muted mt-1.5">
            {brief!.title || 'This week, assembled'}
          </p>
        </button>
      )}

      {/* The engine's own health and its failing crons used to render here, as
          up to seventeen cards. Ruling (Krish, 2026-09-17): they move to the
          alert mark entirely — a broken cron is not Content's news, it is the
          same "something is on fire" the top bar already carries. See
          `EngineAttention`, which the alert drawer renders. */}


      {/* A video review is a decision like any other, so it sits in the same
          strip on the desk. It used to be reachable only from the phone deck. */}
      {wantProposals && videoReviews.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="video-review-rows">
          {videoReviews.map(review => {
            const ok = videoStudioListItemIsWellFormed(review)
            return (
              <button
                key={review.id}
                type="button"
                onClick={() => {
                  rememberVideoStudioReturnFocus(document.activeElement)
                  window.location.hash = `#/content?video=${review.id}`
                }}
                className="text-left rounded-xl border border-violet-400/25 bg-violet-400/[0.05] px-4 py-3 hover:bg-violet-400/[0.08] transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 text-micro font-semibold">
                  <span className="rounded-full bg-violet-400/15 text-violet-200 px-2.5 py-1">
                    {ok ? `Video · ${VIDEO_GATE_LABEL[review.gate]}` : 'Video review needs repair'}
                  </span>
                  {ok ? <span className="rounded-full bg-white/[0.06] text-ink-faint px-2.5 py-1">{VIDEO_SERIES_LABEL[review.series]}</span> : null}
                </div>
                <p className="text-body text-ink-muted mt-1.5">{ok ? review.safe_title : 'Open it to see what must be repaired before any decision.'}</p>
              </button>
            )
          })}
        </div>
      )}

      {wantProposals && shown.length > 0 && (
        <div className="flex flex-col gap-2">
          {shown.map(d => (
            <DecisionCard
              key={d.id}
              decision={d}
              dense={dense}
              v2={v2}
              busy={busy === d.id}
              onAct={fn => act(d, fn)}
              // d.week, not brief.week. `brief` is the one latest brief the
              // hook fetched, so clicking through an older card opened this
              // week's brief instead - and approving there resolved this
              // week's card while the one clicked stayed pending forever.
              onOpenBrief={() => { window.location.hash = `#/content?brief=${d.week}` }}
            />
          ))}
        </div>
      )}

      {/* The discards, as one auditable line rather than as cards with buttons.
          They are shown at all because a detector that quietly drops half its
          own output is the thing nobody can debug later. */}
      {wantProposals && offBeat.length > 0 && (
        <details className="group rounded-xl border border-white/[0.06] bg-white/[0.01]" data-testid="shift-discards">
          <summary className="flex cursor-pointer list-none items-baseline gap-2 px-3 py-2.5 text-label text-ink-faint">
            <span className="tabular-nums">{offBeat.length}</span>
            <span>
              {offBeat.length === 1 ? 'proposal fits' : 'proposals fit'} none of your six lenses, so
              {offBeat.length === 1 ? ' it is' : ' they are'} not asking for a ruling
            </span>
            <span className="ml-auto text-micro text-ink-faint group-open:hidden">Show</span>
            <span className="ml-auto hidden text-micro text-ink-faint group-open:inline">Hide</span>
          </summary>
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {offBeat.map(d => {
              const sh = lensOf.get(d.ref)
              return (
                <li key={d.id} className="text-label text-ink-faint">
                  <span className="text-ink-muted">{String((d.payload as Record<string, unknown>)?.title || sh?.title || 'Untitled')}</span>
                  {sh?.category ? <span className="text-micro text-ink-faint"> · filed {sh.category} under the retired vocabulary</span> : null}
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}
