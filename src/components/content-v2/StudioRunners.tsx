import { useState } from 'react'
import { Eyebrow } from '../shared/Eyebrow'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import {
  driveLabel,
  roleLabel,
  runnerAgeLabel,
  studioRunnerRows,
  switchRefusalLine,
  switchTargets,
  type StudioRunner,
  type StudioRunners as StudioRunnersValue,
} from '../../lib/studioRunners'
import { listStudioRunnerRoles, switchStudioActiveRunner, VideoStudioApiError } from '../../lib/videoStudio'

/**
 * The Studio's Windows runners: which one is active, which is the cold
 * standby, when each last heartbeated and whether its Drive is ready.
 *
 * Ruling (Krish, 2026-09-28): a second Windows machine is a cold standby with
 * its task disabled. Only the active runner is leased work, so a failover ends
 * with the switch at the bottom of this block, after the primary's task is
 * stopped and disabled and the standby's is started (content-engine,
 * docs/OPERATIONS.md, "Primary and cold standby"). The engine refuses a switch
 * that is unsafe and says why; this block only asks.
 *
 * Pull-only: it shows what the engine's health route said when the page was
 * opened, and nothing is pushed anywhere.
 */
export function StudioRunners({ runners, onSwitched }: {
  runners: StudioRunnersValue
  onSwitched?: () => void
}) {
  const rows = studioRunnerRows(runners)
  const targets = switchTargets(runners)
  return (
    <section className="rounded-2xl border border-white/[0.06] overflow-hidden" data-testid="studio-runners" aria-label="Studio runners">
      <div className="px-4 py-3 border-b border-white/[0.05] flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Studio runners</Eyebrow>
        <span className="text-micro text-ink-muted">
          {runners.fenced
            ? 'Only the active runner is given work.'
            : 'Runner roles are not set up yet, so any running runner can be given work.'}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-label text-ink-muted">No Studio runner has reported yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {rows.map(row => <RunnerRow key={`${row.role}-${row.runner_id_prefix}`} row={row} fenced={runners.fenced} />)}
        </ul>
      )}
      {runners.attention.length > 0 ? (
        <div className="flex flex-col gap-1.5 px-4 py-3 border-t border-white/[0.05]" data-testid="studio-runner-attention">
          {runners.attention.map(item => (
            <p key={item.code} className="text-label text-amber-100/85">{item.line}</p>
          ))}
        </div>
      ) : null}
      {runners.fenced && runners.active && targets.length > 0 ? (
        <SwitchActiveRunner activePrefix={runners.active.runner_id_prefix} targets={targets} onSwitched={onSwitched} />
      ) : null}
    </section>
  )
}

function RunnerRow({ row, fenced }: { row: StudioRunner; fenced: boolean }) {
  const dot = row.fresh
    ? row.drive_state === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'
    : row.role === 'active' ? 'bg-amber-400' : 'bg-white/30'
  return (
    <li className="flex items-start gap-3 px-4 py-2.5" data-testid={`studio-runner-${row.role}`}>
      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink">
          <span className="font-medium">{roleLabel(row.role, fenced)}</span>{' '}
          <span className="font-mono text-ink-muted">{row.runner_id_prefix}</span>
        </p>
        <p className="text-micro text-ink-muted">
          Last heartbeat {runnerAgeLabel(row.heartbeat_age_seconds)}
          <span aria-hidden> · </span>
          {driveLabel(row.drive_state)}
          {row.runner_status ? <><span aria-hidden> · </span>{row.working ? 'working' : row.runner_status}</> : null}
        </p>
      </div>
    </li>
  )
}

function SwitchActiveRunner({ activePrefix, targets, onSwitched }: {
  activePrefix: string
  targets: StudioRunner[]
  onSwitched?: () => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState(targets[0]?.runner_id_prefix ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setRefusal(null)
    try {
      // The health route gives prefixes; the switch needs the exact hashes,
      // which only the operator route returns.
      const roster = await listStudioRunnerRoles()
      const to = roster.others.find(item => item.runner_id_prefix === target)
      if (!roster.active || roster.active.runner_id_prefix !== activePrefix || !to) {
        setRefusal(switchRefusalLine('active_runner_changed'))
        return
      }
      await switchStudioActiveRunner({
        to_runner_id_hash: to.runner_id_hash,
        expected_active_runner_id_hash: roster.active.runner_id_hash,
        reason: reason.trim(),
      })
      toast(`Runner ${target} is now the active runner.`, 'success')
      setOpen(false)
      setReason('')
      onSwitched?.()
    } catch (error) {
      setRefusal(switchRefusalLine(error instanceof VideoStudioApiError ? error.code : 'unknown'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="px-4 py-3 border-t border-white/[0.05]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="studio-runner-switch-open"
          className="min-h-[44px] rounded-full border border-white/15 px-4 text-micro font-semibold text-ink-muted hover:bg-white/[0.06] transition-colors"
        >
          Switch the active runner
        </button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-2 px-4 py-3 border-t border-white/[0.05]"
      data-testid="studio-runner-switch"
      onSubmit={(event) => { event.preventDefault(); void submit() }}
    >
      <p className="text-label text-ink-muted">
        Only after the active runner&apos;s task is stopped and disabled and this runner&apos;s task is started. The engine refuses the switch while work is still leased to runner {activePrefix}.
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-micro text-ink-faint">Make active</legend>
        {targets.map(item => (
          <label key={item.runner_id_prefix} className="flex min-h-[44px] items-center gap-2 text-body text-ink">
            <input
              type="radio"
              name="studio-runner-target"
              value={item.runner_id_prefix}
              checked={target === item.runner_id_prefix}
              onChange={() => setTarget(item.runner_id_prefix)}
            />
            <span className="font-mono">{item.runner_id_prefix}</span>
            <span className="text-micro text-ink-muted">{roleLabel(item.role, true)}, heard {runnerAgeLabel(item.heartbeat_age_seconds)}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-micro text-ink-faint">
        Why (kept with the change)
        <input
          type="text"
          value={reason}
          onChange={event => setReason(event.target.value)}
          maxLength={500}
          data-testid="studio-runner-switch-reason"
          className="min-h-[44px] rounded-lg border border-white/10 bg-white/[0.03] px-3 text-body text-ink"
        />
      </label>
      {refusal ? <p className="text-label text-rose-200" data-testid="studio-runner-switch-refusal">{refusal}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || reason.trim().length < 8 || !target}
          data-testid="studio-runner-switch-confirm"
          className="min-h-[44px] rounded-full bg-emerald-300 px-4 text-micro font-bold text-emerald-950 disabled:opacity-40"
        >
          {busy ? <Working size={12} /> : `Make ${target} active`}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setRefusal(null) }}
          className="min-h-[44px] rounded-full border border-white/15 px-4 text-micro font-semibold text-ink-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
