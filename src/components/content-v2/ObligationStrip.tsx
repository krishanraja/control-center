import { useState } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'
import { DecisionCard } from './DecisionCard'
import { Pending } from '../shared/Pending'
import { useToast } from '../shared/Toast'
import { failureMessage, requestJson } from '../../lib/apiFetch'
import { contentEngineAttention } from '../../lib/contentEngineSchedule'
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

export function ObligationStrip({ v2, videoReviews = [] }: {
  v2: ReturnType<typeof useContentV2>
  /** Video Engine reviews waiting on a decision. Empty when the engine is off. */
  videoReviews?: VideoStudioReviewListItem[]
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

  // Never render the "nothing waiting" line while the answer is still loading:
  // a false statement that gets corrected later is worse than a spinner.
  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <Pending label="Checking what needs you" />
      </div>
    )
  }

  const hasBrief = Boolean(brief)
  if (decisions.length === 0 && !hasBrief && videoReviews.length === 0 && engine.attention.length === 0) {
    return (
      <p className="text-label text-white/40 px-1">
        Nothing is waiting on you right now.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {hasBrief && (
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

      {(engineHealth.scheduleDrift || engineHealth.health?.ready === false) && (
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

      {engine.attention.length > 0 && (
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
      {videoReviews.length > 0 && (
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

      {decisions.length > 0 && (
        <div className="flex flex-col gap-2">
          {decisions.map(d => (
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
    </div>
  )
}
