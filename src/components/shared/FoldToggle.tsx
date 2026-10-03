import React from 'react'
import { ChevronDown, ChevronUp } from '@/lib/icons'
import { useHaptics } from '../../hooks/useHaptics'

// The one control for a fold on a stage that never scrolls (useFitFolds,
// src/lib/homeFolds.ts). A folded section keeps its name and a count, and
// this opens it; once open by hand it offers to close again. Quiet on purpose:
// it sits on an eyebrow line and must not compete with the section it opens.

export function FoldToggle({ open, onToggle, what, testId }: {
  open: boolean
  onToggle: () => void
  /** What it opens, for the accessible name: "the OS goals". */
  what: string
  testId: string
}) {
  const h = useHaptics()
  return (
    <button
      type="button"
      onClick={() => { h.select(); onToggle() }}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${what}`}
      data-testid={testId}
      className="tap-44 ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-micro font-semibold text-ink-muted transition-colors hover:text-ink"
    >
      {open ? 'Hide' : 'Show'}
      {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
    </button>
  )
}
