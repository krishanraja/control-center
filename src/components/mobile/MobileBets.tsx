import React, { useMemo, useState } from 'react'
import { Plus, AlertOctagon, Target } from 'lucide-react'
import { MobileShell as MobileShellPrim, TabHeader, FeedCard, EmptyState } from './primitives'
import { useHaptics } from '../../hooks/useHaptics'
import { useBets, BET_KIND_LABEL, type BetKind } from '../../hooks/useBets'
import { BetCard } from '../BetCard'
import { useToast } from '../shared/Toast'
import { NextActionStrip } from '../shared/NextActionStrip'

export function MobileBets() {
  const h = useHaptics()
  const { toast } = useToast()
  const { live, decided, overdueLive, hitRates, loading } = useBets()
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState({
    hypothesis: '',
    success_criterion: '',
    kind: 'content' as BetKind,
    time_box_days: 14,
    agent_owner: 'krish',
    est_mrr_impact_usd: '',
  })
  const [busy, setBusy] = useState(false)

  const overall = hitRates.find(r => r.kind === 'all')

  // Mirrors DesktopBets next action: overdue first (decision pressure), then
  // highest est-MRR live bet. CTA scrolls the bet card into view.
  const nextBet = useMemo(() => {
    if (overdueLive.length > 0) {
      return [...overdueLive].sort((a, b) => {
        const aStart = a.started_at ? new Date(a.started_at).getTime() : 0
        const bStart = b.started_at ? new Date(b.started_at).getTime() : 0
        return aStart - bStart
      })[0]
    }
    return [...live].sort((a, b) => (b.est_mrr_impact_usd || 0) - (a.est_mrr_impact_usd || 0))[0] || null
  }, [overdueLive, live])

  const insight = overdueLive.length > 0
    ? `${overdueLive.length} past their time-box — decide won, lost, or extend`
    : live.length > 0
      ? `${live.length} live · hit-rate ${overall && overall.total > 0 ? `${overall.pct.toFixed(0)}% over 90d` : 'no decided bets yet'}`
      : 'No live bets — place one to start the loop.'

  const focusBetCard = () => {
    if (!nextBet) { h.tap(); setComposing(true); return }
    h.select()
    const el = document.querySelector(`[data-bet-id="${nextBet.id}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid rgba(244, 63, 94, 0.7)'
      el.style.outlineOffset = '4px'
      el.style.borderRadius = '12px'
      setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = '' }, 3500)
    }
  }

  const submit = async () => {
    if (!draft.hypothesis.trim() || !draft.success_criterion.trim()) {
      toast('Hypothesis and success criterion required.', 'error')
      h.error()
      return
    }
    h.heavy()
    setBusy(true)
    try {
      const r = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          est_mrr_impact_usd: Number(draft.est_mrr_impact_usd) || null,
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast('Bet placed.', 'success')
      setDraft({ hypothesis: '', success_criterion: '', kind: 'content', time_box_days: 14, agent_owner: 'krish', est_mrr_impact_usd: '' })
      setComposing(false)
    } catch {
      h.error()
      toast('Could not save — try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Bets"
          subtitle={
            loading ? 'Loading…' :
            overall && overall.total > 0
              ? `${overall.won}/${overall.total} hit-rate · ${live.length} live`
              : `${live.length} live · ${decided.length} decided`
          }
          trailing={
            <button
              onClick={() => { h.tap(); setComposing(c => !c) }}
              className="rounded-full bg-violet-500/20 border border-violet-500/30 px-4 py-2 text-[13px] font-medium text-violet-100 inline-flex items-center min-h-[44px]"
            >
              <Plus size={14} className="inline mr-1" />
              Place bet
            </button>
          }
        />
      }
    >
      <NextActionStrip
        headline={overdueLive.length > 0 ? overdueLive.length : live.length}
        headlineLabel={overdueLive.length > 0 ? 'overdue' : 'live'}
        insight={insight}
        ctaLabel={overdueLive.length > 0 ? 'Decide bet' : nextBet ? 'Review' : 'Place bet'}
        onCta={focusBetCard}
        icon={overdueLive.length > 0 ? AlertOctagon : Target}
        accent={overdueLive.length > 0 ? 'text-rose-300' : 'text-violet-300'}
      />

      {composing && (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-4 space-y-3">
          <p className="text-[14px] font-semibold text-white">New bet</p>
          <textarea
            value={draft.hypothesis}
            onChange={e => setDraft(d => ({ ...d, hypothesis: e.target.value }))}
            rows={2}
            placeholder="Hypothesis (one sentence) — what will happen if you do this?"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[14px] text-white p-3 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
          />
          <textarea
            value={draft.success_criterion}
            onChange={e => setDraft(d => ({ ...d, success_criterion: e.target.value }))}
            rows={2}
            placeholder="Wins if — measurable in N days. (e.g. '5+ paid signups from this campaign')"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[14px] text-white p-3 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={draft.kind}
              onChange={e => setDraft(d => ({ ...d, kind: e.target.value as BetKind }))}
              className="bg-white/[0.04] border border-white/[0.08] rounded text-[13px] text-white p-2"
            >
              {(Object.keys(BET_KIND_LABEL) as BetKind[]).map(k => (
                <option key={k} value={k}>{BET_KIND_LABEL[k]}</option>
              ))}
            </select>
            <input
              type="number"
              value={draft.time_box_days}
              onChange={e => setDraft(d => ({ ...d, time_box_days: Number(e.target.value) || 14 }))}
              placeholder="Days"
              className="bg-white/[0.04] border border-white/[0.08] rounded text-[13px] text-white p-2"
            />
            <input
              type="number"
              value={draft.est_mrr_impact_usd}
              onChange={e => setDraft(d => ({ ...d, est_mrr_impact_usd: e.target.value }))}
              placeholder="Est. MRR $"
              className="bg-white/[0.04] border border-white/[0.08] rounded text-[13px] text-white p-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="px-4 py-2 rounded-md text-[13px] font-semibold bg-violet-500/30 border border-violet-500/40 text-violet-100 hover:bg-violet-500/40 disabled:opacity-40 inline-flex items-center min-h-[44px]"
            >
              {busy ? 'Saving…' : 'Place bet'}
            </button>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="px-3 py-2 rounded-md text-[13px] font-medium text-white/55 inline-flex items-center min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {overdueLive.length > 0 && (
        <FeedCard title={`Overdue · ${overdueLive.length}`}>
          <div className="px-7 py-2 text-[13px] text-red-200">
            These bets passed their time-box. Won, Lost, or Extend (with reason).
          </div>
          <div className="px-5 pb-3 space-y-2">
            {overdueLive.map(b => (
              <BetCard key={b.id} bet={b} forceDecide />
            ))}
          </div>
        </FeedCard>
      )}

      {live.length > overdueLive.length && (
        <FeedCard title={`Live · ${live.length - overdueLive.length}`}>
          <div className="px-5 py-3 space-y-2">
            {live.filter(b => !overdueLive.includes(b)).map(b => (
              <BetCard key={b.id} bet={b} />
            ))}
          </div>
        </FeedCard>
      )}

      {hitRates.length > 0 && (
        <FeedCard title="Hit-rate (90d)">
          <div className="px-7 py-4 grid grid-cols-2 gap-3">
            {hitRates.map(r => (
              <div key={r.kind} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45 mb-0.5">
                  {r.kind === 'all' ? 'Overall' : BET_KIND_LABEL[r.kind as BetKind]}
                </p>
                <p className={`text-[20px] font-bold tabular-nums ${r.pct >= 50 ? 'text-emerald-300' : r.pct >= 30 ? 'text-amber-300' : 'text-red-300'}`}>
                  {r.pct.toFixed(0)}%
                </p>
                <p className="text-[10px] text-white/45 tabular-nums mt-0.5">
                  {r.won}/{r.total} · ${Math.round(r.mrr_won_usd).toLocaleString()} MRR
                </p>
              </div>
            ))}
          </div>
        </FeedCard>
      )}

      {decided.length > 0 && (
        <FeedCard title={`Decided · ${decided.length}`}>
          <div className="px-5 py-3 space-y-2">
            {decided.slice(0, 8).map(b => (
              <BetCard key={b.id} bet={b} />
            ))}
          </div>
        </FeedCard>
      )}

      {!loading && live.length === 0 && decided.length === 0 && (
        <EmptyState label="No bets yet. Place your first — every initiative is a hypothesis with a time-box." />
      )}
    </MobileShellPrim>
  )
}
