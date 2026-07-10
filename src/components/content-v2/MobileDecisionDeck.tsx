import { useMemo, useState } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'

// The whole mobile job (mockup set 2, pin 11): the week's finite decision
// queue, one card at a time, every action in the bottom thumb zone. Finishable
// in a coffee line; when it hits zero it says so and means it (the queue is a
// real count, never a filtered view over a hidden pile).

const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  brief_review: { label: 'Weekly brief', cls: 'bg-sky-400/15 text-sky-300' },
  shift_proposal: { label: 'New shift proposed', cls: 'bg-emerald-400/15 text-emerald-300' },
  shift_fading: { label: 'Shift losing momentum', cls: 'bg-amber-400/15 text-amber-300' },
  graduation: { label: 'Graduation', cls: 'bg-sky-400/15 text-sky-300' },
  purge_preview: { label: 'Monday purge', cls: 'bg-amber-400/15 text-amber-300' },
}

function Big({ children, tone = 'ghost', onClick, disabled }: {
  children: string; tone?: 'primary' | 'green' | 'ghost'; onClick: () => void; disabled?: boolean
}) {
  const cls = tone === 'green' ? 'bg-emerald-400 text-emerald-950'
    : tone === 'primary' ? 'btn-contrast'
    : 'bg-white/[0.06] text-white/75 border border-white/10'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl py-3.5 text-[13.5px] font-bold disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  )
}

export function MobileDecisionDeck({ v2 }: { v2: ReturnType<typeof useContentV2> }) {
  const { decisions, brief, loading } = v2
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)

  // Brief first (the anchor decision), then shifts, then the rest.
  const queue = useMemo(() => {
    const order: Record<string, number> = { brief_review: 0, shift_proposal: 1, shift_fading: 2, graduation: 3, purge_preview: 4 }
    return [...decisions].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
  }, [decisions])
  const current = queue[0] || null
  const total = queue.length + done

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); setDone(d => d + 1) } finally { setBusy(false) }
  }

  if (loading) return <div className="text-white/40 text-sm py-16 text-center">Loading the week...</div>

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
        <div className="text-3xl">✓</div>
        <div className="text-white/90 font-bold text-[16px]">The week is decided</div>
        <p className="text-white/45 text-[13px] max-w-[26ch]">
          Nothing is waiting on you. New decisions queue for the weekend sitting.
        </p>
        {brief && ['approved', 'pushed', 'sent'].includes(brief.status) ? (
          <p className="text-emerald-300/80 text-[12px]">Brief {brief.status}. See you Friday.</p>
        ) : null}
      </div>
    )
  }

  const d = current as ContentDecisionRow
  const p = d.payload as Record<string, any>
  const chip = KIND_CHIP[d.kind] || { label: d.kind, cls: 'bg-white/[0.06] text-white/55' }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* progress */}
      <div className="flex-shrink-0 px-1 pb-3">
        <div className="flex gap-1 mb-2">
          {Array.from({ length: total || 1 }, (_, i) => (
            <span key={i} className={`h-[3px] flex-1 rounded-full ${i < done ? 'bg-emerald-400' : 'bg-white/10'}`} />
          ))}
        </div>
        <div className="text-[11px] text-white/40 tabular-nums">
          {done + 1} of {total} · about {Math.max(1, Math.round(queue.length * 0.7))} min left
        </div>
      </div>

      {/* the one card */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className={`rounded-2xl border p-5 ${d.kind === 'shift_proposal' ? 'border-emerald-400/25 bg-emerald-400/[0.04]' : d.kind === 'brief_review' ? 'border-sky-400/25 bg-sky-400/[0.05]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
          <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ${chip.cls}`}>{chip.label}</span>
          <h3 className="text-[16.5px] font-bold text-white mt-3 leading-snug">
            {d.kind === 'brief_review' ? (p.title || 'This week’s brief')
              : d.kind === 'purge_preview' ? `${p.expiring ?? 0} time-sensitive items expire Monday`
              : (p.title || '')}
          </h3>
          <p className="text-[12.5px] text-white/50 mt-2 leading-relaxed">
            {d.kind === 'brief_review' ? `${p.headlines ?? '?'} headlines, assembled Friday. Review section by section, magic-edit anything soft, then push.`
              : d.kind === 'shift_proposal' ? `Cleared the recurrence gate: ${p.stories ?? '?'} stories, ${p.day_span ?? '?'} days, ${p.sources ?? '?'} sources.${p.nearest?.title ? ` Nearest existing: ${p.nearest.title}.` : ''}`
              : d.kind === 'shift_fading' ? `No qualifying evidence since ${p.last_evidence_on || 'a while'}.`
              : d.kind === 'graduation' ? 'Cited across weeks and still true. Keep it forever with its receipts?'
              : 'Nothing needs you. Anything that fed a shift or the Library is already safe.'}
          </p>
          {d.kind === 'shift_proposal' && p.summary ? (
            <p className="text-[12px] text-emerald-200/70 mt-2 leading-relaxed">{p.summary}</p>
          ) : null}
        </div>

        {/* thumb zone */}
        <div className="mt-auto pt-4 pb-2 flex flex-col gap-2">
          {d.kind === 'brief_review' ? (
            <>
              <Big tone="primary" disabled={busy} onClick={() => { window.location.hash = `#/content?brief=${d.week}` }}>
                Open the brief
              </Big>
              <Big disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'dismiss', 'skipped on mobile'))}>
                Skip for the desktop sitting
              </Big>
            </>
          ) : d.kind === 'shift_proposal' ? (
            <>
              <Big tone="green" disabled={busy} onClick={() => act(() => v2.ruleShift(d.ref, 'accept'))}>Accept shift</Big>
              <div className="flex gap-2">
                <Big disabled={busy} onClick={() => act(() => v2.ruleShift(d.ref, 'dismiss'))}>Dismiss</Big>
              </div>
            </>
          ) : d.kind === 'shift_fading' ? (
            <>
              <Big tone="primary" disabled={busy} onClick={() => act(() => v2.ruleShift(d.ref, 'retire'))}>Retire with verdict</Big>
              <Big disabled={busy} onClick={() => act(() => v2.ruleShift(d.ref, 'keep_watching'))}>Keep watching</Big>
            </>
          ) : d.kind === 'graduation' ? (
            <>
              <Big tone="green" disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'done'))}>Graduate to Library</Big>
              <Big disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'dismiss'))}>Let it purge</Big>
            </>
          ) : (
            <Big tone="primary" disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'done'))}>Acknowledged</Big>
          )}
        </div>
      </div>
    </div>
  )
}
