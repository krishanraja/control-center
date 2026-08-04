import React from 'react'
import { laneLabel, type OutreachCandidate, type PublishCandidate } from '../../lib/publishCandidates'
import { useHaptics } from '../../hooks/useHaptics'
import { Tap } from './controls'

// One candidate, never a list. On a red day selection is the expensive
// operation, so the card presents a single ready artifact and three cheap
// exits: take it, see the next one, or name the action yourself. The
// substitution path (vague free text) adds a fourth, keeping the operator's
// own words one tap away so the suggestion never overrides authorship.

interface Props {
  candidate: PublishCandidate
  saving?: boolean
  submitLabel?: string
  /** Shown above the card when the route here needs explaining, e.g. the
   *  free-text substitution. Null gets the default framing. */
  preface?: string | null
  onAccept: () => void
  onNext: () => void
  onManual: () => void
  /** Substitution path only: commit the operator's original words instead. */
  onKeepMine?: () => void
}

export function PublishCandidateCard({
  candidate, saving, submitLabel = 'Lock it in', preface,
  onAccept, onNext, onManual, onKeepMine,
}: Props) {
  const h = useHaptics()
  const lane = laneLabel(candidate.lane)

  const readiness = candidate.state === 'review'
    ? 'Draft in review. The fifteen minutes is finishing it.'
    : candidate.tier === 'near'
      ? 'Approved a while back. The fifteen minutes is freshening it before it goes out.'
      : (candidate.url ? 'Approved and fresh. The draft is one tap away.' : 'Approved and fresh.')

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-muted leading-relaxed">
        {preface || 'The queue has one ready. No choosing required.'}
      </p>

      <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-4 flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          {lane || 'Content queue'}
        </span>
        <p className="font-display text-[19px] leading-snug text-ink">{candidate.idea}</p>
        <p className="text-[13px] text-ink-faint leading-relaxed">{readiness}</p>
      </div>

      <Tap onTap={onAccept} disabled={saving} feel="success" className="w-full justify-center flex items-center">
        {saving ? 'Saving' : submitLabel}
      </Tap>

      <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
        <Tap variant="quiet" className="!min-h-[44px] text-[13px]" onTap={() => { h.tap(); onNext() }}>
          Not this one
        </Tap>
        <Tap variant="quiet" className="!min-h-[44px] text-[13px]" onTap={() => { h.tap(); onManual() }}>
          Name it myself
        </Tap>
        {onKeepMine && (
          <Tap variant="quiet" className="!min-h-[44px] text-[13px]" onTap={() => { h.tap(); onKeepMine() }}>
            Keep my words
          </Tap>
        )}
      </div>
    </div>
  )
}

/**
 * The outreach lane's one candidate: a Gmail draft ready to send, or a person
 * the system can draft to right now. Same shape as the publish card: one
 * artifact, one primary action, quiet exits.
 */
export function OutreachCandidateCard({
  candidate, preface, saving, submitLabel = 'Lock it in',
  onAccept, onManual, onKeepMine,
}: {
  candidate: OutreachCandidate
  preface: string
  saving?: boolean
  submitLabel?: string
  onAccept: () => void
  onManual: () => void
  onKeepMine?: () => void
}) {
  const h = useHaptics()
  const kindLabel = candidate.kind === 'email_draft'
    ? 'Ready in Gmail drafts'
    : candidate.kind === 'lead' ? 'Enriched lead' : 'Guest, pitch drafted'
  const note = candidate.kind === 'email_draft'
    ? 'Already written. Sending it is the fifteen minutes.'
    : 'No draft yet. The system writes it now, in your voice; you send it.'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-muted leading-relaxed">{preface}</p>

      <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-4 flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">{kindLabel}</span>
        <p className="font-display text-[19px] leading-snug text-ink">
          {candidate.kind === 'email_draft' && candidate.detail
            ? `"${candidate.detail}" to ${candidate.name}`
            : candidate.name}
        </p>
        {candidate.kind !== 'email_draft' && candidate.detail && (
          <p className="text-[13px] text-ink-muted leading-relaxed">{candidate.detail}</p>
        )}
        <p className="text-[13px] text-ink-faint leading-relaxed">{note}</p>
      </div>

      <Tap onTap={onAccept} disabled={saving} feel="success" className="w-full justify-center flex items-center">
        {saving ? 'Saving' : submitLabel}
      </Tap>

      <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
        <Tap variant="quiet" className="!min-h-[44px] text-[13px]" onTap={() => { h.tap(); onManual() }}>
          Name it myself
        </Tap>
        {onKeepMine && (
          <Tap variant="quiet" className="!min-h-[44px] text-[13px]" onTap={() => { h.tap(); onKeepMine() }}>
            Keep my words
          </Tap>
        )}
      </div>
    </div>
  )
}

/**
 * The no-match outcome: the judgment said nothing outstanding serves the ask,
 * and the honest next move is to build it. The reason line is the judge's own
 * sentence, so the operator sees WHY the deck came up empty, not a shrug.
 */
export function BuildOfferCard({
  reason, saving, onBuild, onManual, onKeepMine,
}: {
  reason: string
  saving?: boolean
  onBuild: () => void
  onManual: () => void
  onKeepMine?: () => void
}) {
  const h = useHaptics()
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-4 flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">The queue came up empty</span>
        <p className="text-[14px] leading-relaxed text-ink">{reason}</p>
        <p className="text-[13px] text-ink-faint leading-relaxed">
          The system can draft it now, in your voice, grounded in the corpus. About a minute. It lands as a draft you finish, nothing publishes itself.
        </p>
      </div>

      <Tap onTap={onBuild} disabled={saving} feel="success" className="w-full justify-center flex items-center">
        Build it now
      </Tap>

      <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
        <Tap variant="quiet" className="!min-h-[44px] text-[13px]" onTap={() => { h.tap(); onManual() }}>
          Name it myself
        </Tap>
        {onKeepMine && (
          <Tap variant="quiet" className="!min-h-[44px] text-[13px]" onTap={() => { h.tap(); onKeepMine() }}>
            Keep my words
          </Tap>
        )}
      </div>
    </div>
  )
}
