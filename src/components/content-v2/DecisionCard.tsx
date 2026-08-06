import type { ReactNode } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'

// One typed decision (mockup set 1, pin 2). Exactly six kinds exist; each
// renders its own finite action set. There is no open-ended triage here.

const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  brief_review: { label: 'Weekly brief', cls: 'bg-sky-400/15 text-sky-300' },
  shift_proposal: { label: 'New shift proposed', cls: 'bg-emerald-400/15 text-emerald-300' },
  shift_fading: { label: 'Shift losing momentum', cls: 'bg-amber-400/15 text-amber-300' },
  graduation: { label: 'Graduation', cls: 'bg-sky-400/15 text-sky-300' },
  purge_preview: { label: 'Sunday purge', cls: 'bg-amber-400/15 text-amber-300' },
  investigation: { label: 'Investigation', cls: 'bg-violet-400/15 text-violet-300' },
}

function Btn({ children, primary, onClick, disabled }: {
  children: ReactNode; primary?: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${
        primary ? 'btn-contrast' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
      }`}
    >
      {children}
    </button>
  )
}

export function DecisionCard({ decision: d, v2, busy, onAct, onOpenBrief }: {
  decision: ContentDecisionRow
  v2: ReturnType<typeof useContentV2>
  busy: boolean
  onAct: (fn: () => Promise<void>) => void
  onOpenBrief: () => void
}) {
  const p = d.payload as Record<string, any>
  const chip = KIND_CHIP[d.kind] || { label: d.kind, cls: 'bg-white/[0.06] text-white/55' }

  const title =
    d.kind === 'brief_review' ? `Review and approve: ${p.title || "this week's brief"}`
    : d.kind === 'shift_proposal' ? String(p.title || 'New shift')
    : d.kind === 'shift_fading' ? `${p.title || 'A shift'} has gone quiet`
    : d.kind === 'graduation' ? `Evergreen: ${p.title || 'a piece'}`
    : d.kind === 'investigation' ? `Investigation ready: ${p.anchor_headline || 'this week'}`
    : `${p.expiring ?? 0} time-sensitive items expire Monday`

  const subtitle =
    d.kind === 'shift_proposal'
      ? `Cleared the recurrence gate: ${p.stories ?? '?'} stories, ${p.day_span ?? '?'} days, ${p.sources ?? '?'} sources.${p.nearest?.title ? ` Nearest existing: ${p.nearest.title}.` : ''}`
    : d.kind === 'shift_fading' ? `No qualifying evidence since ${p.last_evidence_on || 'a while'}. Retire it with a verdict, or keep watching.`
    : d.kind === 'graduation' ? 'Move it to the Library with its receipts, or let it purge.'
    : d.kind === 'purge_preview' ? 'Nothing needs you. Tap only to rescue something before it goes.'
    : d.kind === 'investigation'
      ? `${p.citable_evidence ?? 0} citable rows across ${p.distinct_domains ?? 0} domains, ${p.distinct_origins ?? 0} distinct origins. Stopped at rung ${p.terminal_rung ?? '?'} (${p.terminal_reason || 'unknown'}).`
    : String(p.summary || '')

  const actions = () => {
    if (d.kind === 'brief_review') return <Btn primary onClick={onOpenBrief} disabled={busy}>Open the brief</Btn>
    if (d.kind === 'shift_proposal') return (
      <>
        <Btn primary disabled={busy} onClick={() => onAct(() => v2.ruleShift(d.ref, 'accept'))}>Accept</Btn>
        <Btn disabled={busy} onClick={() => onAct(() => v2.ruleShift(d.ref, 'dismiss'))}>Dismiss</Btn>
      </>
    )
    if (d.kind === 'shift_fading') return (
      <>
        <Btn primary disabled={busy} onClick={() => onAct(() => v2.ruleShift(d.ref, 'retire'))}>Retire</Btn>
        <Btn disabled={busy} onClick={() => onAct(() => v2.ruleShift(d.ref, 'keep_watching'))}>Keep watching</Btn>
      </>
    )
    if (d.kind === 'investigation') return (
      <>
        <Btn primary disabled={busy} onClick={() => onAct(async () => { window.location.hash = `#content?idea=${p.idea_id || ''}` })}>Open the evidence</Btn>
        <Btn disabled={busy} onClick={() => onAct(() => v2.resolveDecision(d.id, 'dismiss'))}>Not this week</Btn>
      </>
    )
    if (d.kind === 'graduation') return (
      <>
        <Btn primary disabled={busy} onClick={() => onAct(() => v2.resolveDecision(d.id, 'done'))}>Graduate</Btn>
        <Btn disabled={busy} onClick={() => onAct(() => v2.resolveDecision(d.id, 'dismiss'))}>Let it purge</Btn>
      </>
    )
    return <Btn disabled={busy} onClick={() => onAct(() => v2.resolveDecision(d.id, 'done'))}>Acknowledged</Btn>
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.cls}`}>{chip.label}</span>
        <div className="text-[13.5px] font-semibold text-white/90 mt-1.5 leading-snug">{title}</div>
        <div className="text-[12px] text-white/45 mt-0.5 leading-relaxed">{subtitle}</div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">{actions()}</div>
    </div>
  )
}
