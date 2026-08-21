import React from 'react'
import type { ReasonChip } from './SwipeDeck'

interface Props {
  chips: ReasonChip[]
  /** Commit the reject with a chosen code (undefined → host default). */
  onChoose: (code?: string) => void
  /** Clean undo — the card returns and no server call fires. */
  onCancel: () => void
  /** Headline above the chips. */
  prompt?: string
}

/**
 * ReasonChipBar — the "why drop it?" teaching bar that pops after a LEFT swipe.
 * Shared by SwipeDeck and the Content TriageDeck so the −1 reason vocabulary and
 * its keyboard/number affordance stay identical everywhere. The number prefixes
 * line up with the `1–N` keyboard shortcuts the decks wire up.
 */
export function ReasonChipBar({ chips, onChoose, onCancel, prompt = 'Why drop it?' }: Props) {
  return (
    <div className="pt-4 flex-shrink-0">
      <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-micro text-white/70 font-medium">{prompt}</span>
          <button type="button" onClick={onCancel}
            className="ml-auto text-micro text-white/55 hover:text-white/90 px-2 py-1 rounded-md hover:bg-white/[0.06]">
            Undo
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <button
              key={c.code}
              type="button"
              onClick={() => onChoose(c.code)}
              className="text-label px-2.5 py-1.5 rounded-lg border border-white/[0.12] text-white/80 hover:border-white/[0.25] hover:bg-white/[0.05] transition-colors"
            >
              <span className="hidden md:inline text-white/35 mr-1 tabular-nums">{i + 1}</span>{c.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChoose(undefined)}
            className="text-label px-2.5 py-1.5 rounded-lg text-white/50 hover:text-white/80"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
