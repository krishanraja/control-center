/**
 * Growth: Full Time's one number, pilot listeners against Krish's target.
 * Rulings (Krish, 2026-10-06): "yes and 100", and Full Time's pilot listeners
 * are "TOTALLY unrelated" to Mindmake's pilot customers, so this card reads
 * only listener rows and never says "pilots" on its own.
 *
 * The Growth standard: the count and the target at a glance, emptiness said
 * once with why, and one next thing to do. What it says is decided by
 * listenerGoalView (src/lib/pilotListeners.ts), tested without a browser.
 */
import { Eyebrow } from '../shared/Eyebrow'
import { relativeTime } from '../../lib/ageHelpers'
import { listenerGoalView, type ListenerSyncState } from '../../lib/pilotListeners'
import type { KrishAction } from '../../lib/webProperties'
import { Ring } from './viz'

export function ListenerGoal({ count, target, sync, siteAction }: {
  count: number
  target: number
  sync: ListenerSyncState
  siteAction: KrishAction | null
}) {
  const v = listenerGoalView(sync, count, target, siteAction ? { title: siteAction.title, job: siteAction.job } : null)
  const copied = sync.lastOkAt ? relativeTime(sync.lastOkAt) : null
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] p-4" data-testid="growth-listener-goal">
      <div className="flex flex-wrap items-baseline gap-3">
        <Eyebrow className="flex-1">Full Time pilot listeners</Eyebrow>
        {copied && <span className="text-label text-ink-muted" data-testid="growth-listener-copied">Copied {copied}</span>}
      </div>
      <div className="flex items-center gap-4">
        {v.count != null && (
          <Ring value={v.count} max={v.target} size={56} stroke={5} label={`${v.count} of ${v.target} pilot listeners`} />
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-1.5" data-testid="growth-listener-count">
            {v.count != null ? (
              <>
                <span className="font-display text-display font-semibold tabular-nums text-ink">{v.count}</span>
                <span className="text-ui text-ink-muted">of {v.target} pilot listeners</span>
              </>
            ) : (
              <span className="text-ui font-semibold text-ink">{v.headline}</span>
            )}
          </p>
          <p className="text-body text-ink-muted" data-testid="growth-listener-line">{v.line}</p>
        </div>
      </div>
      <p className="text-body text-ink" data-testid="growth-listener-next">
        <span className="text-ink-muted">Next: </span>{v.next}
      </p>
    </div>
  )
}
