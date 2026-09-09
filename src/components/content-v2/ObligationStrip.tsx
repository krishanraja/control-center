import { useState } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'
import { DecisionCard } from './DecisionCard'
import { Pending } from '../shared/Pending'
import { useToast } from '../shared/Toast'
import { failureMessage, requestJson } from '../../lib/apiFetch'
import { contentEngineAttention } from '../../lib/contentEngineSchedule'
import { shiftIsOnBeat } from '../../lib/contentV2'
import { useEngineHealth } from '../../hooks/useEngineHealth'
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

export function ObligationStrip({ v2, videoReviews = [], section = 'all' }: {
  v2: ReturnType<typeof useContentV2>
  /** Video Engine reviews waiting on a decision. Empty when the engine is off. */
  videoReviews?: VideoStudioReviewListItem[]
  /** Which half to render. 'urgent' goes above the work, 'proposals' below it.
   *  'all' keeps the original single-block behaviour for any other caller. */
  section?: 'all' | 'urgent' | 'proposals'
}) {
  const { brief, decisions, loading, runs, refresh } = v2
  const [busy, setBusy] = useState<string | null>(null)
  const [replaying, setReplaying] = useState<string | null>(null)
  const { toast } = useToast()
  // A cron that stopped, or failed last time, is an obligation too: the fix
  // is on Krish's side (a key, a mount, a machine), and nothing else says so.
  const engine = contentEngineAttention(runs)
  // Since the crons moved to the content-engine project this dashboard's
  // schedule table is a copy. Say so when the two disagree, rather than
  // nagging about a job nobody runs or staying quiet about one that stopped.
  const engineHealth = useEngineHealth()

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

  // Run one engine cron now, rather than waiting for its next schedule.
  //
  // requestOk is not used here because every interesting answer arrives with
  // `ok: false` and would be flattened into one sentence. Two of them are not
  // failures at all: the engine refuses `purge` and `aeo_ingest` on purpose and
  // returns the reason, and a job that outlives the sixty second call answers
  // 202 because it is still running. Reporting either as an error would send
  // Krish looking for a fault that is not there.
  const replay = async (job: string, label: string) => {
    setReplaying(job)
    try {
      const { status, json } = await requestJson<{
        ok?: boolean; error?: string; note?: string; reason?: string; elapsed_ms?: number
      }>('/api/content-engine/runs/replay', { method: 'POST', body: { job } })

      if (status === 202) {
        toast(`${label} is running and will take longer than this page waits. Its result appears in the ledger when it finishes.`, 'info')
      } else if (json?.ok) {
        toast(`${label} ran.`, 'success')
      } else if (json?.note) {
        toast(json.note, 'info')
      } else {
        toast(`${label} could not run: ${json?.reason || json?.error || `the engine answered ${status}`}`, 'error')
      }
    } catch (e) {
      toast(failureMessage(e, `Could not reach the engine to run ${label}.`), 'error')
    } finally {
      setReplaying(null)
      // Refresh either way. A refused replay changes nothing and a successful
      // one wrote a ledger row; re-reading is how the strip stops nagging.
      await refresh()
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
  const urgentEmpty = !hasBrief && engine.attention.length === 0
    && !engineHealth.scheduleDrift && engineHealth.health?.ready !== false
  const proposalsEmpty = shown.length === 0 && videoReviews.length === 0 && offBeat.length === 0

  // "Nothing is waiting" is worth saying once, on the whole tab, and only when
  // it is true of both halves. Said by each half separately it becomes two
  // contradictory lines above and below the work.
  if (urgentEmpty && proposalsEmpty) {
    if (!wantUrgent) return null
    return (
      <p className="text-label text-white/40 px-1">
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
            <span className="rounded-full bg-white/[0.06] text-white/55 px-2.5 py-1">{brief!.week}</span>
            {brief!.sections?.stance ? (
              <span className="rounded-full bg-amber-400/10 text-amber-300 px-2.5 py-1">
                {brief!.sections.stance}
              </span>
            ) : null}
          </div>
          <p className="text-body text-white/80 mt-1.5">
            {brief!.title || 'This week, assembled'}
          </p>
        </button>
      )}

      {wantUrgent && (engineHealth.scheduleDrift || engineHealth.health?.ready === false) && (
        <div className="flex flex-col gap-1.5" data-testid="engine-health">
          {engineHealth.scheduleDrift ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-2.5 text-label text-amber-100/85">
              {engineHealth.scheduleDrift}
            </p>
          ) : null}
          {engineHealth.health && !engineHealth.health.ready ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-2.5 text-label text-amber-100/85">
              The engine is missing {engineHealth.health.missingRequired.join(', ')}, so that part of it cannot run.
            </p>
          ) : null}
        </div>
      )}

      {wantUrgent && engine.attention.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="engine-attention">
          {engine.attention.map(a => (
            <div
              key={a.job}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-label ${a.kind === 'failed' ? 'border-rose-400/25 bg-rose-500/[0.05] text-rose-100/85' : 'border-amber-400/25 bg-amber-400/[0.05] text-amber-100/85'}`}
            >
              <p>{a.line}</p>
              {/* The strip could say a job was stale and offer nothing to do
                  about it, so a weekly job that failed on Friday waited a week.
                  The engine refuses the two that delete or cost money and says
                  why, so this offers the action and lets the engine rule. */}
              <button
                type="button"
                disabled={replaying !== null}
                onClick={() => replay(a.job, a.label)}
                className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-micro font-semibold text-white/80 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {replaying === a.job ? 'Running…' : 'Run again'}
              </button>
            </div>
          ))}
        </div>
      )}

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
                  {ok ? <span className="rounded-full bg-white/[0.06] text-white/55 px-2.5 py-1">{VIDEO_SERIES_LABEL[review.series]}</span> : null}
                </div>
                <p className="text-body text-white/80 mt-1.5">{ok ? review.safe_title : 'Open it to see what must be repaired before any decision.'}</p>
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
          <summary className="flex cursor-pointer list-none items-baseline gap-2 px-3 py-2.5 text-label text-white/45">
            <span className="tabular-nums">{offBeat.length}</span>
            <span>
              {offBeat.length === 1 ? 'proposal fits' : 'proposals fit'} none of your six lenses, so
              {offBeat.length === 1 ? ' it is' : ' they are'} not asking for a ruling
            </span>
            <span className="ml-auto text-micro text-white/35 group-open:hidden">Show</span>
            <span className="ml-auto hidden text-micro text-white/35 group-open:inline">Hide</span>
          </summary>
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {offBeat.map(d => {
              const sh = lensOf.get(d.ref)
              return (
                <li key={d.id} className="text-label text-white/50">
                  <span className="text-white/65">{String((d.payload as Record<string, unknown>)?.title || sh?.title || 'Untitled')}</span>
                  {sh?.category ? <span className="text-micro text-white/35"> · filed {sh.category} under the retired vocabulary</span> : null}
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}
