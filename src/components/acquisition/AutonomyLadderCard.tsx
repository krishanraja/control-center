import { formatDistanceToNow } from 'date-fns'
import { ShieldCheck } from 'lucide-react'
import type { AcquisitionLane } from '../../hooks/useAcquisition'
import { AUTONOMY_CHIP, AUTONOMY_LABEL } from './laneMeta'

const LEVELS = ['L1', 'L2', 'L3'] as const

/**
 * Autonomy Ladder — where this lane sits on L1 (every send approved) →
 * L2 (1-in-10 sampled) → L3 (exception only), plus the recent promotion /
 * demotion history that Vera's weekly check and Krish's overrides write to
 * venture_registry.autonomy_history. Read-only in this phase; the
 * promote/demote controls arrive with the cockpit phase.
 */
export function AutonomyLadderCard({ lane }: { lane: AcquisitionLane }) {
  const current = lane.autonomy_level || 'L1'
  const history = [...(lane.autonomy_history || [])].reverse()
  const lastEvent = history[0]

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <ShieldCheck size={13} className="text-emerald-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Autonomy ladder
        </h2>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold ${AUTONOMY_CHIP[current]}`}>
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
                <span className={`text-[10px] font-semibold ${isCurrent ? 'text-emerald-300' : 'text-white/30'}`}>
                  {lvl}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-white/40">{AUTONOMY_LABEL[current]}</p>
        {lastEvent?.at && (
          <p className="mt-0.5 text-[10px] text-white/25">
            Last change {formatDistanceToNow(new Date(String(lastEvent.at)), { addSuffix: true })}
            {lastEvent.actor ? ` · by ${lastEvent.actor}` : ''}
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="border-t border-white/[0.06] divide-y divide-white/[0.03]">
          {history.slice(0, 4).map((h, i) => (
            <div key={i} className="px-4 py-2 text-[10.5px] flex items-center gap-2">
              <span className="text-white/60 font-medium">
                {h.from && h.to ? `${h.from} → ${h.to}` : h.to || '—'}
              </span>
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
