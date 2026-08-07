import { useState, type ReactNode } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'
import { reasonsFor } from '../../lib/triageReasons'
import { feedbackVote } from '../../lib/triageActions'
import { useLikelyReasons } from '../../hooks/useLikelyReasons'
import { RejectReasonBar } from '../shared/RejectReasonBar'

// One typed decision (mockup set 1, pin 2). Exactly six kinds exist; each
// renders its own finite action set. There is no open-ended triage here.
//
// Each kind also carries "Not for me", the desktop half of the mobile deck's
// reject: it bins the card and asks one question whose answer becomes the −1
// Vera clusters by reason code. Dismissing without a reason stays available and
// stays silent, which is the honest difference between not now and no.

const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  brief_review: { label: 'Weekly brief', cls: 'bg-sky-400/15 text-sky-300' },
  shift_proposal: { label: 'Shift detected automatically', cls: 'bg-emerald-400/15 text-emerald-300' },
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
  const [rejecting, setRejecting] = useState(false)
  // Lazy here, unlike the mobile deck: the desktop room renders every card at
  // once, so prefetching all of them would embed the whole queue to shortcut
  // one tap. It fills in a moment after the bar opens.
  const likely = useLikelyReasons(rejecting ? d.id : null)

  // Shift rulings resolve their own card on their own endpoint, so there the
  // ruling and the lesson are two calls; everything else rejects in one. The
  // vote is best-effort either way: the ruling is already committed.
  const submitReject = (reasonCode?: string, reasonText?: string) => {
    setRejecting(false)
    onAct(async () => {
      if (d.kind === 'shift_proposal' || d.kind === 'shift_fading') {
        await v2.ruleShift(d.ref, 'dismiss', { note: reasonText || null })
        void feedbackVote('content_decisions', d.id, -1, 'cleo', reasonCode || 'content_other', reasonText, {
          kind: d.kind, ref: d.ref, week: d.week, surface: 'content_v2_week',
        })
      } else {
        await v2.rejectDecision(d.id, reasonCode, reasonText)
      }
    })
  }

  const title =
    d.kind === 'brief_review' ? `Review and approve: ${p.title || "this week's brief"}`
    : d.kind === 'shift_proposal' ? String(p.title || 'New shift')
    : d.kind === 'shift_fading' ? `${p.title || 'A shift'} has gone quiet`
    : d.kind === 'graduation' ? `Evergreen: ${p.title || 'a piece'}`
    : d.kind === 'investigation' ? `Investigation ready: ${p.anchor_headline || 'this week'}`
    : `${p.expiring ?? 0} time-sensitive items expire Monday`

  const subtitle =
    d.kind === 'shift_proposal'
      // Krish asked what this button actually does and whether the system spots
      // shifts on its own. It does (api/shifts/detect.ts, Fridays) and this card
      // IS that output. The copy now says so, and says where Accept sends it,
      // because a bare "Accept" made an automatic system look manual.
      ? `The weekly sweep found this on its own: ${p.stories ?? '?'} stories across ${p.day_span ?? '?'} days from ${p.sources ?? '?'} distinct sources. Tracking it moves it to the Shifts room, where it is watched over time and its evidence accumulates.${p.nearest?.title ? ` Closest one you already track: ${p.nearest.title}.` : ''}`
    : d.kind === 'shift_fading' ? `No qualifying evidence since ${p.last_evidence_on || 'a while'}. Retire it with a verdict, or keep watching.`
    : d.kind === 'graduation' ? 'Move it to the Library with its receipts, or let it purge.'
    : d.kind === 'purge_preview' ? 'Nothing needs you. Tap only to rescue something before it goes.'
    : d.kind === 'investigation'
      ? `${p.citable_evidence ?? 0} citable rows across ${p.distinct_domains ?? 0} domains, ${p.distinct_origins ?? 0} distinct origins. Stopped at rung ${p.terminal_rung ?? '?'} (${p.terminal_reason || 'unknown'}).`
    : String(p.summary || '')

  // Low-emphasis, destructive, and never the primary: binning is always
  // available but never the easiest thing to hit by accident.
  const rejectBtn = (label = 'Not for me') => (
    <button
      onClick={() => setRejecting(true)}
      disabled={busy}
      className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-colors disabled:opacity-40 text-rose-300/85 border border-rose-400/25 bg-rose-500/[0.06] hover:bg-rose-500/[0.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-300/60"
    >
      {label}
    </button>
  )

  const actions = () => {
    if (d.kind === 'brief_review') return (
      <>
        <Btn primary onClick={onOpenBrief} disabled={busy}>Open the brief</Btn>
        {rejectBtn()}
      </>
    )
    if (d.kind === 'shift_proposal') return (
      <>
        <Btn primary disabled={busy} onClick={() => onAct(() => v2.ruleShift(d.ref, 'accept'))}>Track as a shift</Btn>
        {rejectBtn('Not a shift')}
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
        {rejectBtn()}
      </>
    )
    if (d.kind === 'graduation') return (
      <>
        <Btn primary disabled={busy} onClick={() => onAct(() => v2.resolveDecision(d.id, 'done'))}>Graduate</Btn>
        <Btn disabled={busy} onClick={() => onAct(() => v2.resolveDecision(d.id, 'dismiss'))}>Let it purge</Btn>
        {rejectBtn()}
      </>
    )
    // purge_preview is a notice, not an offer, so it has nothing to refuse.
    return <Btn disabled={busy} onClick={() => onAct(() => v2.resolveDecision(d.id, 'done'))}>Acknowledged</Btn>
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.cls}`}>{chip.label}</span>
          <div className="text-[13.5px] font-semibold text-white/90 mt-1.5 leading-snug">{title}</div>
          <div className="text-[12px] text-white/45 mt-0.5 leading-relaxed">{subtitle}</div>
        </div>
        <div className="flex flex-wrap gap-1.5 flex-shrink-0">{actions()}</div>
      </div>
      {/* The question lands inside the card being judged, not in a dialog over it. */}
      {rejecting ? (
        <RejectReasonBar
          className="mt-3"
          title="Why bin it?"
          reasons={reasonsFor('content_decisions')}
          onChoose={submitReject}
          onCancel={() => setRejecting(false)}
          cancelLabel="Keep it"
          likely={likely}
        />
      ) : null}
    </div>
  )
}
