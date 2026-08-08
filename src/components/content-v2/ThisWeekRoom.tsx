import { useMemo, useState } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import type { ContentDecisionRow } from '../../lib/contentV2'
import { DecisionCard } from './DecisionCard'

// The default room (mockup set 1, mock 1). One brief object, a finite typed
// decision list, and the honest ledger sentence. No open-ended triage exists.

const STATUS_COPY: Record<string, string> = {
  ready: 'Assembled, untouched by you',
  in_review: 'You are mid-edit',
  approved: 'Approved, ready to push',
  pushed: 'Docs pushed, send it',
  sent: 'Sent this week',
}

export function ThisWeekRoom({ v2, ideas }: { v2: ReturnType<typeof useContentV2>; ideas: ContentIdeaRow[] }) {
  const { brief, decisions, loading } = v2
  const [busy, setBusy] = useState<string | null>(null)

  const ledger = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000
    const fresh = ideas.filter(i => new Date(i.created_at).getTime() >= weekAgo)
    const read = fresh.length
    const fedShifts = fresh.filter(i => (i as ContentIdeaRow & { shift_id?: string | null }).shift_id).length
    const inBrief = Array.isArray(brief?.sections?.headlines) ? brief!.sections.headlines!.length : 0
    return { read, fedShifts, inBrief }
  }, [ideas, brief])

  const openBrief = () => {
    if (brief) window.location.hash = `#/content?brief=${brief.week}`
  }

  const act = async (d: ContentDecisionRow, fn: () => Promise<void>) => {
    setBusy(d.id)
    try { await fn() } finally { setBusy(null) }
  }

  if (loading) return <div className="text-white/40 text-sm py-10 text-center">Loading the week...</div>

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {brief ? (
        <section className="rounded-xl border border-sky-400/25 bg-sky-400/[0.05] p-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-sky-400/15 text-sky-300 px-2.5 py-1">Weekly brief</span>
            {brief.assembled_at ? (
              <span className="rounded-full bg-emerald-400/10 text-emerald-300 px-2.5 py-1">
                Assembled {new Date(brief.assembled_at).toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            <span className="rounded-full bg-white/[0.06] text-white/55 px-2.5 py-1">
              {ledger.inBrief} clues · {brief.week}
            </span>
            {/* The stance is the whole point of the piece, so the card says which
                way the week came down before it is opened. Absent on briefs
                assembled before the investigative shape. */}
            {brief.sections?.stance ? (
              <span className="rounded-full bg-amber-400/10 text-amber-300 px-2.5 py-1">
                {brief.sections.stance === 'confirms' ? 'Confirms a thesis' : 'Contradicts the consensus'}
              </span>
            ) : null}
          </div>
          <h2 className="text-[19px] font-bold text-white mt-3 leading-snug">{brief.title || 'Untitled brief'}</h2>
          {brief.sections?.belief ? (
            <p className="text-[13px] text-white/60 mt-1.5 leading-relaxed">{brief.sections.belief}</p>
          ) : null}
          <p className="text-[12.5px] text-white/45 mt-1.5">
            {STATUS_COPY[brief.status] || brief.status}
          </p>
          <div className="flex gap-2 mt-4">
            <button onClick={openBrief} className="btn-contrast rounded-lg px-4 py-2 text-[13px] font-semibold">
              Review and edit
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-5 text-white/50 text-sm">
          No brief yet this week. It assembles itself Friday 18:00 UTC from everything the engine read.
        </section>
      )}

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40 mb-2.5">
          Decisions this week{decisions.length ? ` · ${decisions.length}` : ''}
        </h3>
        {decisions.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-5 text-white/50 text-sm">
            Nothing is waiting on you. That is the system working.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {decisions.map(d => (
              <DecisionCard key={d.id} decision={d} v2={v2} busy={busy === d.id} onAct={fn => act(d, fn)} onOpenBrief={openBrief} />
            ))}
          </div>
        )}
      </section>

      <p className="text-[12px] text-white/35 leading-relaxed">
        This week the engine read {ledger.read} items. {ledger.inBrief} made the brief, {ledger.fedShifts} fed shifts.
        Nothing is waiting for you in a pile; time-sensitive leftovers purge Monday after send.
      </p>
    </div>
  )
}
