import React, { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'

// Phase 1: when yesterday's daily_focus is not complete, surface what's
// still open. Tone: sober. No guilt language. No streak-break warning.

export function CarryOverPrompt({ onContinue }: { onContinue?: (targetText: string) => void } = {}) {
  const { today, carry_over } = useDailyFocus()
  const [dismissed, setDismissed] = useState(false)

  if (!isFocusEnabled()) return null
  if (today) return null              // today is locked, hide
  if (!carry_over) return null
  if (dismissed) return null

  const items = [
    { n: 1, text: carry_over.target_1_text, done: !!carry_over.target_1_completed_at },
    { n: 2, text: carry_over.target_2_text, done: !!carry_over.target_2_completed_at },
    { n: 3, text: carry_over.target_3_text, done: !!carry_over.target_3_completed_at },
  ].filter(t => t.text && !t.done)

  if (items.length === 0) return null

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
      <header className="mb-2">
        <h3 className="text-label font-semibold uppercase tracking-[0.14em] text-white/75">Yesterday you didn't ship</h3>
      </header>
      <div className="space-y-1.5">
        {items.map(t => (
          <div key={t.n} className="flex items-start gap-3">
            <div className="w-5 text-micro text-white/40 font-semibold pt-1">{t.n}.</div>
            <div className="flex-1 text-body text-white/85 leading-snug">{t.text}</div>
            <button
              type="button"
              onClick={() => onContinue?.(t.text || '')}
              className="inline-flex items-center gap-1 text-micro text-violet-300 hover:text-violet-200 px-2 py-1"
            >
              Continue <ArrowRight size={11} />
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-micro text-white/40 hover:text-white/70 px-2 py-1"
            >
              Drop
            </button>
          </div>
        ))}
      </div>
      <p className="text-micro text-white/45 mt-3">
        Continue what's still relevant, drop what isn't.
      </p>
    </section>
  )
}
