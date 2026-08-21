import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Check, ShieldCheck, X } from '@/lib/icons'
import type { AcquisitionLane } from '../../hooks/useAcquisition'
import { laneAction, type LaneCriteria, type LaneDetail } from '../../hooks/useLaneDetail'
import { useToast } from '../shared/Toast'
import { AUTONOMY_CHIP, AUTONOMY_LABEL } from './laneMeta'

const LEVELS = ['L1', 'L2', 'L3'] as const

/**
 * Autonomy Ladder cockpit — where this lane sits on L1 (every send approved)
 * → L2 (1-in-10 sampled) → L3 (exception only). Demotion is always one tap;
 * promotion runs the mechanical gates server-side and, when refused, renders
 * the exact unmet-criteria checklist the 422 carries. The profit gate
 * (contribution margin > 0) can never be overridden — not even with force.
 */
export function AutonomyLadderCard({
  lane,
  detail,
  onChanged,
}: {
  lane: AcquisitionLane
  detail?: LaneDetail | null
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [criteria, setCriteria] = useState<LaneCriteria[] | null>(null)

  const current = detail?.stats?.autonomy_level || lane.autonomy_level || 'L1'
  const history = [...(detail?.stats?.autonomy_history || lane.autonomy_history || [])].reverse()
  const lastEvent = history[0] as Record<string, unknown> | undefined
  const rr30 = detail?.stats?.rejection_rate_30d

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    if (busy) return
    setBusy(true)
    try {
      const { status, body } = await laneAction(lane.slug, payload)
      if (status === 422 && Array.isArray(body?.criteria)) {
        setCriteria(body.criteria)
        toast(body?.error || 'Criteria not met yet.', 'info')
        return
      }
      if (status >= 400) throw new Error(body?.error || `HTTP ${status}`)
      setCriteria(null)
      toast(okMsg, 'success')
      onChanged?.()
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const unmetOverridable =
    criteria != null &&
    criteria.some(c => !c.met) &&
    criteria.filter(c => !c.met).every(c => c.overridable)

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <ShieldCheck size={13} className="text-emerald-400" />
        <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-white/45">
          Autonomy ladder
        </h2>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-micro font-semibold ${AUTONOMY_CHIP[current]}`}>
          {current}
        </span>
      </header>

      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {LEVELS.map((lvl, i) => {
            const isCurrent = lvl === current
            const reached = LEVELS.indexOf(current) >= i
            return (
              <div key={lvl} className="flex items-center gap-1.5 flex-1 min-w-0">
                <div
                  className={`flex-1 h-1.5 rounded-full ${
                    isCurrent ? 'bg-emerald-400' : reached ? 'bg-emerald-400/40' : 'bg-white/[0.07]'
                  }`}
                />
                <span className={`text-micro font-semibold ${isCurrent ? 'text-emerald-300' : 'text-white/30'}`}>
                  {lvl}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-micro text-white/40">{AUTONOMY_LABEL[current]}</p>
        <div className="mt-0.5 flex items-baseline gap-3 text-micro text-white/25 tabular-nums">
          {detail?.stats && (
            <>
              <span>{detail.stats.approved_30d} approved / {detail.stats.rejected_30d} rejected · 30d</span>
              <span>{rr30 != null ? `${(Number(rr30) * 100).toFixed(1)}% rejection` : 'no decisions yet'}</span>
            </>
          )}
          {lastEvent?.at != null && (
            <span>
              changed {formatDistanceToNow(new Date(String(lastEvent.at)), { addSuffix: true })}
              {lastEvent.actor ? ` by ${String(lastEvent.actor)}` : ''}
            </span>
          )}
        </div>

        {detail && (
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || current === 'L3'}
              onClick={() => act({ action: 'promote' }, `Promoted to ${current === 'L1' ? 'L2' : 'L3'}.`)}
              className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1 text-micro font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
            >
              Promote
            </button>
            <button
              type="button"
              disabled={busy || current === 'L1'}
              onClick={() => act({ action: 'demote', reason: 'krish manual demotion' }, `Demoted to ${current === 'L3' ? 'L2' : 'L1'} — every send sampled again.`)}
              className="rounded-lg border border-amber-400/25 px-2.5 py-1 text-micro font-medium text-amber-300/80 hover:text-amber-300 transition-colors disabled:opacity-40"
            >
              Demote
            </button>
            {unmetOverridable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: 'promote', force: true, reason: 'krish force promotion' }, 'Force-promoted (override logged).')}
                className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-micro font-medium text-white/60 hover:text-white transition-colors disabled:opacity-40"
              >
                Force promote
              </button>
            )}
          </div>
        )}

        {criteria && (
          <ul className="mt-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-1">
            {criteria.map(c => (
              <li key={c.key} className="flex items-center gap-2 text-micro">
                {c.met
                  ? <Check size={11} className="text-emerald-300 flex-shrink-0" />
                  : <X size={11} className={`flex-shrink-0 ${c.overridable ? 'text-amber-300' : 'text-rose-300'}`} />}
                <span className={c.met ? 'text-white/55' : 'text-white/80'}>{c.label}</span>
                <span className="ml-auto text-white/30 tabular-nums">
                  {c.actual == null ? '—' : String(c.actual)}
                </span>
                {!c.met && !c.overridable && (
                  <span className="text-micro uppercase tracking-wide text-rose-300/80">hard gate</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {history.length > 0 && (
        <div className="border-t border-white/[0.06] divide-y divide-white/[0.03]">
          {history.slice(0, 4).map((h: any, i) => (
            <div key={i} className="px-4 py-2 text-micro flex items-center gap-2">
              <span className="text-white/60 font-medium">
                {h.from && h.to ? `${h.from} → ${h.to}` : h.to || '—'}
              </span>
              {h.override && <span className="text-micro uppercase tracking-wide text-amber-300/80">override</span>}
              {h.reason && <span className="text-white/35 truncate">{String(h.reason)}</span>}
              {h.at && (
                <span className="ml-auto text-white/25 flex-shrink-0">
                  {formatDistanceToNow(new Date(String(h.at)), { addSuffix: true })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
