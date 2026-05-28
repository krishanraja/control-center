import { useMemo, useState } from 'react'
import { Plus, Target, AlertOctagon } from 'lucide-react'
import { useBets, BET_KIND_LABEL, BET_TIME_BOX_OPTIONS, type BetKind } from '../../hooks/useBets'
import { BetCard } from '../BetCard'
import { useToast } from '../shared/Toast'
import { NextActionStrip } from '../shared/NextActionStrip'

export function DesktopBets() {
  const { live, decided, overdueLive, hitRates, loading } = useBets()
  const { toast } = useToast()
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({
    hypothesis: '',
    success_criterion: '',
    kind: 'content' as BetKind,
    time_box_days: 14,
    agent_owner: 'krish',
    est_mrr_impact_usd: '',
  })

  const overall = hitRates.find(r => r.kind === 'all')

  // Next action picks the oldest overdue bet, else the highest-impact live
  // bet to keep momentum on the decided/won/lost loop.
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
    ? `${overdueLive.length} bet${overdueLive.length === 1 ? '' : 's'} past their time-box — decide won, lost, or extend`
    : live.length > 0
      ? `${live.length} live · hit-rate ${overall && overall.total > 0 ? `${overall.pct.toFixed(0)}% over 90d` : 'no decided bets yet'}`
      : 'No live bets — place one to start the loop.'

  const focusBetCard = () => {
    if (!nextBet) return
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
      toast('Hypothesis and success criterion required.', 'error'); return
    }
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
      toast('Bet placed.', 'success')
      setDraft({ hypothesis: '', success_criterion: '', kind: 'content', time_box_days: 14, agent_owner: 'krish', est_mrr_impact_usd: '' })
      setComposing(false)
    } catch {
      toast('Could not save — try again.', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-4 max-w-[1280px] mx-auto w-full">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Bets</h1>
          <p className="text-[13px] text-white/50 mt-0.5">
            {loading
              ? 'Loading…'
              : overall && overall.total > 0
                ? `${overall.won}/${overall.total} hit-rate over 90d · ${live.length} live`
                : `${live.length} live · ${decided.length} decided`}
          </p>
        </div>
        <button
          onClick={() => setComposing(c => !c)}
          className="rounded-md bg-violet-500/20 border border-violet-500/30 px-3 py-1.5 text-[12px] font-medium text-violet-100 hover:bg-violet-500/30"
        >
          <Plus size={12} className="inline mr-1" /> Place bet
        </button>
      </header>

      <NextActionStrip
        headline={overdueLive.length > 0 ? overdueLive.length : live.length}
        headlineLabel={overdueLive.length > 0 ? 'overdue' : 'live'}
        insight={insight}
        ctaLabel={overdueLive.length > 0 ? 'Decide bet' : 'Place bet'}
        onCta={() => (overdueLive.length > 0 && nextBet) ? focusBetCard() : setComposing(true)}
        icon={overdueLive.length > 0 ? AlertOctagon : Target}
        accent={overdueLive.length > 0 ? 'text-rose-300' : 'text-violet-300'}
        disabled={false}
      />

      {composing && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-3">
          <textarea
            value={draft.hypothesis}
            onChange={e => setDraft(d => ({ ...d, hypothesis: e.target.value }))}
            rows={2}
            placeholder="Hypothesis — what will happen if you do this?"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[13px] text-white p-2 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
          />
          <textarea
            value={draft.success_criterion}
            onChange={e => setDraft(d => ({ ...d, success_criterion: e.target.value }))}
            rows={2}
            placeholder="Wins if — measurable in N days"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[13px] text-white p-2 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Category</span>
              <select
                value={draft.kind}
                onChange={e => setDraft(d => ({ ...d, kind: e.target.value as BetKind }))}
                className="bg-white/[0.04] border border-white/[0.08] rounded text-[12px] text-white p-2"
              >
                {(Object.keys(BET_KIND_LABEL) as BetKind[]).map(k => (
                  <option key={k} value={k}>{BET_KIND_LABEL[k]}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Decide in</span>
              <div className="flex gap-1.5">
                {BET_TIME_BOX_OPTIONS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDraft(dr => ({ ...dr, time_box_days: d }))}
                    className={`flex-1 rounded text-[12px] font-semibold tabular-nums py-1.5 border transition-colors ${
                      draft.time_box_days === d
                        ? 'bg-violet-500/30 border-violet-400/50 text-white'
                        : 'bg-white/[0.04] border-white/[0.08] text-white/55 hover:text-white/80'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Owner</span>
              <input
                type="text" value={draft.agent_owner}
                onChange={e => setDraft(d => ({ ...d, agent_owner: e.target.value }))}
                placeholder="Owner"
                className="bg-white/[0.04] border border-white/[0.08] rounded text-[12px] text-white p-2 placeholder:text-white/30"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Est. MRR $</span>
              <input
                type="text" inputMode="numeric" value={draft.est_mrr_impact_usd}
                onChange={e => setDraft(d => ({ ...d, est_mrr_impact_usd: e.target.value.replace(/[^0-9]/g, '') }))}
                placeholder="0"
                className="bg-white/[0.04] border border-white/[0.08] rounded text-[12px] text-white p-2 placeholder:text-white/30"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={submit} disabled={busy}
              className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-violet-500/30 border border-violet-500/40 text-violet-100 hover:bg-violet-500/40 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Place bet'}
            </button>
            <button type="button" onClick={() => setComposing(false)} className="px-3 py-1.5 rounded-md text-[12px] text-white/55 hover:text-white/80">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <header className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-white">
              {overdueLive.length > 0 ? (
                <span className="text-red-300 flex items-center gap-1">
                  <AlertOctagon size={12} /> Overdue · {overdueLive.length}
                </span>
              ) : (
                <>Live · {live.length}</>
              )}
            </h2>
          </header>
          <div className="p-3 space-y-2">
            {overdueLive.map(b => <BetCard key={b.id} bet={b} forceDecide />)}
            {live.filter(b => !overdueLive.includes(b)).map(b => <BetCard key={b.id} bet={b} />)}
            {live.length === 0 && !loading && (
              <p className="text-[11px] text-white/35 px-2 py-3 text-center">No live bets.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <header className="px-4 py-3 border-b border-white/[0.05]">
            <h2 className="text-[12px] font-semibold text-white flex items-center gap-1">
              <Target size={12} /> Hit-rate · 90d
            </h2>
          </header>
          <div className="p-3 space-y-2">
            {hitRates.map(r => (
              <div key={r.kind} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">
                    {r.kind === 'all' ? 'Overall' : BET_KIND_LABEL[r.kind as BetKind]}
                  </p>
                  <p className={`text-[18px] font-bold tabular-nums ${r.pct >= 50 ? 'text-emerald-300' : r.pct >= 30 ? 'text-amber-300' : 'text-red-300'}`}>
                    {r.pct.toFixed(0)}%
                  </p>
                </div>
                <p className="text-[10px] text-white/45 tabular-nums">
                  {r.won}/{r.total} · ${Math.round(r.mrr_won_usd).toLocaleString()} MRR won
                </p>
              </div>
            ))}
            {hitRates.length === 0 && (
              <p className="text-[11px] text-white/35 px-2 py-3 text-center">No decided bets yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <header className="px-4 py-3 border-b border-white/[0.05]">
            <h2 className="text-[12px] font-semibold text-white">Decided · {decided.length}</h2>
          </header>
          <div className="p-3 space-y-2">
            {decided.slice(0, 8).map(b => <BetCard key={b.id} bet={b} />)}
            {decided.length === 0 && (
              <p className="text-[11px] text-white/35 px-2 py-3 text-center">No decided bets yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
