import React, { useMemo, useState } from 'react'
import { Plus, AlertOctagon, Target } from 'lucide-react'
import { MobileShell as MobileShellPrim, TabHeader, FeedCard, EmptyState } from './primitives'
import { useHaptics } from '../../hooks/useHaptics'
import { useBets, BET_KIND_LABEL, BET_TIME_BOX_OPTIONS, type BetKind, type BetRow } from '../../hooks/useBets'
import { BetCard } from '../BetCard'
import { useToast } from '../shared/Toast'
import { NextActionStrip } from '../shared/NextActionStrip'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

export function MobileBets() {
  const h = useHaptics()
  const { toast } = useToast()
  const { live, decided, overdueLive, hitRates, loading } = useBets()
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'
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

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the live-bets
  // list regroups into the 3 daily-target lanes via relevance_index (table
  // 'bets'). Flat array mirrors the normal visible order (overdue first), and
  // one uniform row renderer preserves each card's decide behavior.
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const liveBets = useMemo<BetRow[]>(
    () => [...overdueLive, ...live.filter(b => !overdueLive.includes(b))],
    [overdueLive, live],
  )
  const renderBetRow = (b: BetRow) => <BetCard bet={b} forceDecide={overdueLive.includes(b)} />

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
            <div className="flex items-center gap-2">
              {isFocusModeEnabled() && calibrated && (
                <FocusModeToggle mode={mode} onChange={setMode} />
              )}
              <button
                onClick={() => { h.tap(); setComposing(c => !c) }}
                className="rounded-full bg-violet-500/20 border border-violet-500/30 px-4 py-2 text-[13px] font-medium text-violet-100 inline-flex items-center min-h-[44px]"
              >
                <Plus size={14} className="inline mr-1" />
                Place bet
              </button>
            </div>
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
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-4 space-y-4">
          <p className="text-[14px] font-semibold text-white">New bet</p>

          {/* 16px fonts keep iOS from auto-zooming the viewport on focus. */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Hypothesis
            </label>
            <textarea
              value={draft.hypothesis}
              onChange={e => setDraft(d => ({ ...d, hypothesis: e.target.value }))}
              rows={2}
              placeholder="What will happen if you do this? (one sentence)"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[16px] text-white p-3 placeholder:text-white/30 focus:outline-none focus:border-violet-400/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Wins if
            </label>
            <textarea
              value={draft.success_criterion}
              onChange={e => setDraft(d => ({ ...d, success_criterion: e.target.value }))}
              rows={2}
              placeholder="Measurable outcome — e.g. '5+ paid signups from this campaign'"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[16px] text-white p-3 placeholder:text-white/30 focus:outline-none focus:border-violet-400/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Category
            </label>
            <select
              value={draft.kind}
              onChange={e => setDraft(d => ({ ...d, kind: e.target.value as BetKind }))}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[16px] text-white px-3 min-h-[48px] focus:outline-none focus:border-violet-400/40"
            >
              {(Object.keys(BET_KIND_LABEL) as BetKind[]).map(k => (
                <option key={k} value={k}>{BET_KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>

          {/* One-tap chips replace a fiddly number stepper for the time-box. */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Decide in
            </label>
            <div className="flex gap-2">
              {BET_TIME_BOX_OPTIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { h.select(); setDraft(dr => ({ ...dr, time_box_days: d })) }}
                  className={`flex-1 min-h-[44px] rounded-lg border text-[14px] font-semibold tabular-nums transition-colors ${
                    draft.time_box_days === d
                      ? 'bg-violet-500/30 border-violet-400/50 text-white'
                      : 'bg-white/[0.04] border-white/[0.08] text-white/60'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Est. MRR impact <span className="font-normal normal-case tracking-normal text-white/30">· optional</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-white/40">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.est_mrr_impact_usd}
                onChange={e => setDraft(d => ({ ...d, est_mrr_impact_usd: e.target.value.replace(/[^0-9]/g, '') }))}
                placeholder="0"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-[16px] text-white pl-7 pr-3 min-h-[48px] placeholder:text-white/30 focus:outline-none focus:border-violet-400/40"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex-1 px-4 rounded-lg text-[15px] font-semibold bg-violet-500 text-white hover:bg-violet-400 disabled:opacity-40 inline-flex items-center justify-center min-h-[48px] active:scale-[0.99] transition-transform"
            >
              {busy ? 'Saving…' : 'Place bet'}
            </button>
            <button
              type="button"
              onClick={() => { h.tap(); setComposing(false) }}
              className="px-4 rounded-lg text-[14px] font-medium text-white/55 inline-flex items-center min-h-[48px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showFocus ? (
        <FeedCard title="Live, by focus">
          <div className="px-5 py-3">
            <FocusLanes
              rows={liveBets}
              table="bets"
              keyOf={b => String(b.id)}
              renderItem={renderBetRow}
              fallback={null}
              mutedLabel="Off focus"
            />
          </div>
        </FeedCard>
      ) : (
        <>
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
        </>
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
