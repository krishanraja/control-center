import React from 'react'
import { laneLabel, type PublishCandidate } from '../../lib/publishCandidates'
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

  const readiness = candidate.state === 'approved'
    ? (candidate.url ? 'Approved. The draft is one tap away.' : 'Approved and drafted.')
    : 'Draft in review. The fifteen minutes is finishing it.'

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
