import React from 'react'
import { AlertTriangle, CheckCircle2 } from '@/lib/icons'
import { useWorkflowHealth, daysSinceSuccess, type WorkflowHealthRow } from '../../hooks/useWorkflowHealth'

/**
 * What n8n says about the fleet, on the screen that claims to show the fleet.
 *
 * The Flows tab reads `workflow_runs`, which every workflow writes for itself
 * at the end of a run. A workflow that dies mid-run writes nothing at all, so
 * the tab's own data source cannot see the failure mode it most needs to show:
 * a dead workflow and a workflow that simply had a quiet week look identical.
 *
 * `workflow_health` is the outside view, reconciled from the n8n executions
 * API every six hours. It has been written since it was built and read by
 * nothing.
 *
 * The failure_class is on the chip because it is the difference between five
 * minutes and an afternoon: `credential` means something expired and one
 * re-auth fixes every workflow sharing it, `logic` means the workflow is
 * wrong. Grouping by class is why "three workflows are failing" becomes "two
 * of them are the same dead credential".
 */

const CLASS_HINT: Record<string, string> = {
  credential: 'expired or deleted credential — re-auth fixes every workflow sharing it',
  quota: 'a provider limit, not a bug in the workflow',
  logic: 'the workflow itself is wrong',
}

function StatusChip({ status }: { status: string | null }) {
  const tone =
    status === 'failing' || status === 'dead'
      ? 'border-rose-500/30 text-rose-200 bg-rose-500/10'
      : 'border-amber-500/30 text-amber-200 bg-amber-500/10'
  return (
    <span className={`rounded border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-[0.14em] ${tone}`}>
      {status}
    </span>
  )
}

function Row({ r }: { r: WorkflowHealthRow }) {
  const days = daysSinceSuccess(r)
  const runs = r.runs_28d || 0
  const errs = r.errors_28d || 0
  return (
    <li className="border-t border-white/[0.05] py-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={r.status} />
        <span className="min-w-0 flex-1 truncate text-body font-medium text-white/90">
          {r.workflow_name || r.workflow_id}
        </span>
        <span className="text-label tabular-nums text-white/45">
          {errs}/{runs} failed in 28d
        </span>
      </div>
      <p className="mt-1 text-label leading-snug text-white/50">
        {/* "Never" is the honest answer for a workflow that has failed every
            run since it was created, and it is a different problem from one
            that worked until Tuesday. */}
        {r.last_success_at
          ? `Last success ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}.`
          : 'Never succeeded.'}
        {r.failure_class && (
          <>
            {' '}
            <span className="text-white/70">{r.failure_class}</span>
            {CLASS_HINT[r.failure_class] ? ` — ${CLASS_HINT[r.failure_class]}` : ''}
          </>
        )}
        {r.last_error_node && <> {' '}Failing at <span className="text-white/70">{r.last_error_node}</span>.</>}
      </p>
      {r.last_error_message && (
        <p className="mt-0.5 truncate font-mono text-micro text-white/35" title={r.last_error_message}>
          {r.last_error_message}
        </p>
      )}
    </li>
  )
}

export function FleetHealthStrip() {
  const { broken, healthy, idle, rows, loading, error } = useWorkflowHealth()

  if (loading || error || rows.length === 0) return null

  if (broken.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
        <CheckCircle2 size={13} className="shrink-0 text-emerald-300/80" />
        <p className="text-label text-white/65">
          n8n reports {healthy} of {rows.length} workflows healthy, {idle} idle, none failing.
        </p>
      </div>
    )
  }

  // Grouped so the shared cause is visible. Three failures with one cause is a
  // different morning from three failures with three.
  const classes = [...new Set(broken.map(b => b.failure_class).filter(Boolean))] as string[]

  return (
    <section
      aria-label="Fleet health from n8n"
      className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <AlertTriangle size={13} className="shrink-0 text-rose-300" />
        <h3 className="text-label font-semibold text-white/90">
          {broken.length} of {rows.length} workflows are failing
        </h3>
        <span className="text-micro uppercase tracking-[0.14em] text-white/35">
          n8n runtime, not self-reported
        </span>
      </header>
      {classes.length > 0 && (
        <p className="mt-1 text-label text-white/55">
          {classes.length === 1
            ? `All ${classes[0]}.`
            : `Causes: ${classes.join(', ')}.`}
        </p>
      )}
      <ul className="mt-2">
        {broken.slice(0, 8).map(r => <Row key={r.workflow_id} r={r} />)}
      </ul>
      {broken.length > 8 && (
        <p className="mt-2 text-label text-white/40">and {broken.length - 8} more.</p>
      )}
    </section>
  )
}
