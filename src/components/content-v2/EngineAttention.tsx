import { useState } from 'react'
import { contentEngineAttention } from '../../lib/contentEngineSchedule'
import { useEngineHealth } from '../../hooks/useEngineHealth'
import { useToast } from '../shared/Toast'
import { requestJson, failureMessage } from '../../lib/apiFetch'
import type { ContentEngineRunRow } from '../../lib/contentEngineSchedule'

/**
 * What the Content Engine cannot do, and the button that retries it.
 *
 * Ruling (Krish, 2026-09-17): "Move to the alert mark entirely." This used to
 * live in the Content tab's obligation strip, where five cards — three of them
 * false alarms, see `contentEngineAttention` — became a wall down a 320px rail.
 * A broken cron is not Content's news; it is the same "something is on fire"
 * the top-bar mark already carries for fleet silence, so it says it in the same
 * place and Content says nothing about it at all.
 *
 * Extracted rather than reimplemented so the retry keeps its hard-won manners
 * (see `replay` below) instead of a second, dumber copy growing in the drawer.
 */
export function EngineAttention({ runs, onRan }: {
  runs: ContentEngineRunRow[]
  /** Re-read the ledger after a replay, so a fixed job stops being reported. */
  onRan: () => Promise<void> | void
}) {
  const [replaying, setReplaying] = useState<string | null>(null)
  const { toast } = useToast()
  const engine = contentEngineAttention(runs)
  // Since the crons moved to the content-engine project this dashboard's
  // schedule table is a copy. Say so when the two disagree, rather than
  // nagging about a job nobody runs or staying quiet about one that stopped.
  const engineHealth = useEngineHealth()

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
      await onRan()
    }
  }

  const drift = engineHealth.scheduleDrift
  const notReady = engineHealth.health && !engineHealth.health.ready
  // One line, not seventeen cards. `unrecorded` was returned by the classifier
  // and rendered by nothing, so a cron that genuinely stopped firing was
  // invisible; it is a count because a fresh ledger is a new deployment and not
  // seventeen emergencies.
  const silent = engine.unrecorded

  if (!engine.attention.length && !drift && !notReady && !silent) return null

  return (
    <div className="flex flex-col gap-1.5" data-testid="engine-attention">
      {drift ? (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-2.5 text-label text-amber-100/85">
          {drift}
        </p>
      ) : null}
      {notReady ? (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-2.5 text-label text-amber-100/85">
          {engineHealth.health!.missingRequired.length > 0
            ? `The engine is missing ${engineHealth.health!.missingRequired.join(', ')}, so that part of it cannot run.`
            : 'The engine is not ready, and it did not say which piece is missing. That part of it cannot run.'}
        </p>
      ) : null}
      {engine.attention.map(a => (
        <div
          key={a.job}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-label ${a.kind === 'failed' ? 'border-rose-400/25 bg-rose-500/[0.05] text-rose-100/85' : 'border-amber-400/25 bg-amber-400/[0.05] text-amber-100/85'}`}
        >
          <p className="min-w-0 flex-1">{a.line}</p>
          {/* The strip could say a job was stale and offer nothing to do
              about it, so a weekly job that failed on Friday waited a week.
              The engine refuses the two that delete or cost money and says
              why, so this offers the action and lets the engine rule. */}
          <button
            type="button"
            disabled={replaying !== null}
            onClick={() => replay(a.job, a.label)}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-micro font-semibold text-ink-muted hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {replaying === a.job ? 'Running…' : 'Run again'}
          </button>
        </div>
      ))}
      {silent > 0 && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-2.5 text-label text-amber-100/85">
          {silent === 1
            ? 'One job has never reported a run.'
            : `${silent} jobs have never reported a run.`}{' '}
          Their schedules may not be firing.
        </p>
      )}
    </div>
  )
}
