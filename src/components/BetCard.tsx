import React, { useState } from 'react'
import { TrendingUp, TrendingDown, Clock, AlertOctagon, Check, X, Pause } from 'lucide-react'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import {
  elapsedPct, isOverdue,
  BET_KIND_LABEL, BET_KIND_ACCENT,
  type BetRow, type BetStatus,
} from '../hooks/useBets'

interface Props {
  bet: BetRow
  forceDecide?: boolean        // when overdue, the parent uses this to prevent dismissal
  onDecide?: () => void        // called after a successful Won / Lost
}

/**
 * Bet card with tone scale: green <60% elapsed · amber 60-100% · red overdue.
 * When overdue, the action set shrinks to the forced Won/Lost/Extend modal.
 */
export function BetCard({ bet, forceDecide, onDecide }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | 'win' | 'lose' | 'extend' | 'pause'>(null)
  const [modal, setModal] = useState<null | 'win' | 'lose' | 'extend'>(forceDecide ? null : null)
  const [learning, setLearning] = useState('')
  const [actualMrr, setActualMrr] = useState<string>('')
  const [extendDays, setExtendDays] = useState<string>('7')

  const pct = elapsedPct(bet)
  const overdue = isOverdue(bet)

  const toneClass =
    bet.status !== 'live' ? 'border-white/[0.05] bg-white/[0.015]' :
    overdue                ? 'border-red-500/40 bg-red-500/[0.08]' :
    pct > 60               ? 'border-amber-500/30 bg-amber-500/[0.04]' :
                             'border-emerald-500/20 bg-emerald-500/[0.03]'

  const barClass =
    overdue   ? 'bg-red-400' :
    pct > 60  ? 'bg-amber-400' :
                'bg-emerald-400'

  const submit = async (status: BetStatus, extraDays?: number) => {
    if ((status === 'won' || status === 'lost') && !learning.trim()) {
      toast('Add a one-sentence learning before deciding.', 'error')
      h.error()
      return
    }
    h.heavy()
    setBusy(status === 'won' ? 'win' : status === 'lost' ? 'lose' : 'extend')
    try {
      const body: Record<string, unknown> =
        status === 'paused' && extraDays
          ? { time_box_days: bet.time_box_days + extraDays }
          : { status, learning, actual_mrr_impact_usd: Number(actualMrr) || null, decided_at: new Date().toISOString() }
      const r = await fetch(`/api/bets/${bet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast(
        status === 'won'  ? 'Marked won.' :
        status === 'lost' ? 'Marked lost — learning logged.' :
        'Extended.',
        'success',
      )
      setModal(null)
      onDecide?.()
    } catch {
      h.error()
      toast('Could not save — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className={`rounded-xl border ${toneClass} p-3 transition-colors`}>
      <header className="flex items-start gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full mt-1.5 ${BET_KIND_ACCENT[bet.kind]} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-snug">
            {bet.hypothesis}
          </p>
          <p className="text-[11px] text-white/55 leading-snug mt-1 line-clamp-2">
            <span className="text-white/35">Wins if: </span>{bet.success_criterion}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/45 flex-wrap">
            <span>{BET_KIND_LABEL[bet.kind]}</span>
            {bet.agent_owner && <span>· {bet.agent_owner}</span>}
            {typeof bet.est_mrr_impact_usd === 'number' && bet.est_mrr_impact_usd > 0 && (
              <span>· est. ${Math.round(bet.est_mrr_impact_usd).toLocaleString()}/mo</span>
            )}
          </div>
        </div>
        {bet.status !== 'live' && (
          <span className={`text-[10px] uppercase tracking-[0.12em] flex-shrink-0 ${
            bet.status === 'won'  ? 'text-emerald-300' :
            bet.status === 'lost' ? 'text-red-300' :
                                    'text-white/35'
          }`}>
            {bet.status}
          </span>
        )}
      </header>

      {bet.status === 'live' && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className={overdue ? 'text-red-300 font-semibold' : 'text-white/45'}>
              <Clock size={9} className="inline mr-1" />
              {overdue
                ? `Overdue · ${Math.floor(pct - 100)}% past time-box`
                : `${Math.floor(pct)}% of ${bet.time_box_days}d`}
            </span>
            {overdue && (
              <AlertOctagon size={11} className="text-red-300 animate-pulse" />
            )}
          </div>
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full ${barClass} rounded-full transition-all duration-700`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
      )}

      {bet.status === 'live' && (
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setModal('win')}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
          >
            <Check size={11} />
            Won
          </button>
          <button
            type="button"
            onClick={() => setModal('lose')}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-red-500/30 text-red-200 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
          >
            <X size={11} />
            Lost
          </button>
          {!overdue ? (
            <button
              type="button"
              onClick={() => submit('paused')}
              disabled={busy !== null}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40"
            >
              <Pause size={11} />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setModal('extend')}
              disabled={busy !== null}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-amber-500/30 text-amber-200 hover:bg-amber-500/15 disabled:opacity-40"
            >
              Extend (requires reason)
            </button>
          )}
        </div>
      )}

      {bet.learning && (
        <p className="text-[11px] text-white/55 mt-2 leading-snug italic">
          <span className="text-white/35">Learning: </span>{bet.learning}
        </p>
      )}

      {/* Forced decision modal */}
      {modal && (
        <div className="mt-3 rounded-lg border border-white/[0.12] bg-[#141416] p-3 space-y-2">
          <p className="text-[11px] font-semibold text-white">
            {modal === 'win'   && 'What worked? (one sentence, required)'}
            {modal === 'lose'  && 'What did you learn? (one sentence, required)'}
            {modal === 'extend' && 'Why extend? Set new days from today.'}
          </p>
          <textarea
            value={learning}
            onChange={e => setLearning(e.target.value)}
            rows={2}
            placeholder={modal === 'win' ? 'e.g. cold email + free trial CTA converted at 12%' : modal === 'lose' ? 'e.g. ICP wasn’t buying ABM, switched to PLG' : 'e.g. customer call slipped two weeks'}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[11px] text-white p-2 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
          />
          {modal !== 'extend' && (
            <input
              type="number"
              value={actualMrr}
              onChange={e => setActualMrr(e.target.value)}
              placeholder="Actual MRR impact ($/mo) — optional"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[11px] text-white p-2 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
            />
          )}
          {modal === 'extend' && (
            <input
              type="number"
              value={extendDays}
              onChange={e => setExtendDays(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[11px] text-white p-2 focus:outline-none focus:border-white/[0.18]"
            />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => modal === 'extend' ? submit('paused', Number(extendDays) || 7) : submit(modal === 'win' ? 'won' : 'lost')}
              disabled={busy !== null}
              className="px-3 py-1 rounded-md text-[11px] font-semibold bg-violet-500/20 border border-violet-500/30 text-violet-100 hover:bg-violet-500/30 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setModal(null)}
              disabled={busy !== null}
              className="px-3 py-1 rounded-md text-[11px] font-medium text-white/55 hover:text-white/80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
