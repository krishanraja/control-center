import React, { useState } from 'react'
import { ChevronDown, X } from '@/lib/icons'
import { BottomSheet } from '../mobile/BottomSheet'
import { Eyebrow } from '../shared/Eyebrow'
import { Working } from '../shared/Working'
import { OptionChips } from '../goals/GoalPickers'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import { useHaptics } from '../../hooks/useHaptics'
import { BTN_GHOST, BTN_PRIMARY } from './atoms'

/**
 * The shell every Growth composer sits in: the touchpoint ("a place your
 * buyers already are") and the creative card.
 *
 * On a phone it is a bottom sheet with one full-width action riding above
 * the keyboard, the way FocusedEditor does it. The first version rendered the
 * desktop grid inline on the phone: two columns of labelled inputs, a native
 * <select>, a date picker, and Add and Cancel side by side at the bottom of
 * a card you had to scroll the whole tab to reach. Krish: "it produces this
 * desktop experience on my mobile phone and it's also cryptic".
 *
 * On the desk it stays an inline card under the section head, because a
 * pointer and a wide row are the right mechanics there. Same fields, same
 * wire path, different shape.
 *
 * Both shapes share the rules below:
 *   - chips, never <select> (AGENTS.md); a score is ten chips, a week is two;
 *   - one required field at the top, in the operator's words, large;
 *   - everything optional folded under "More", so the first screen is one
 *     question, not nine;
 *   - the primary label says what happens ("Add to the map"), never "Submit".
 */

export function ComposerShell({
  variant, open, onClose, label, primaryLabel, onPrimary, busy, canSubmit = true, children,
}: {
  variant: 'desktop' | 'mobile'
  open: boolean
  onClose: () => void
  label: string
  primaryLabel: string
  onPrimary: () => void
  busy: boolean
  canSubmit?: boolean
  children: React.ReactNode
}) {
  const h = useHaptics()
  const inset = useKeyboardInset()

  if (!open) return null

  if (variant === 'mobile') {
    return (
      <BottomSheet open={open} onClose={onClose} ariaLabel={label}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
            <Eyebrow>{label}</Eyebrow>
            <button
              type="button"
              onClick={() => { h.tap(); onClose() }}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/45 active:bg-white/[0.08]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
            {children}
          </div>
          <div
            className="shrink-0 border-t border-white/[0.06] bg-base px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
            style={{ paddingBottom: inset > 0 ? `calc(${inset}px / var(--z, 1) + 12px)` : undefined }}
          >
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() => { h.tap(); onPrimary() }}
              className="btn-contrast w-full rounded-xl py-3.5 text-ui font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {busy ? <Working size={13} /> : null}
              {primaryLabel}
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4 flex flex-col gap-4" role="form" aria-label={label}>
      {children}
      <div className="flex gap-2">
        <button type="button" onClick={onPrimary} disabled={busy || !canSubmit} className={`${BTN_PRIMARY} inline-flex items-center gap-2`}>
          {busy ? <Working size={12} /> : null}
          {primaryLabel}
        </button>
        <button type="button" onClick={onClose} className={BTN_GHOST}>Cancel</button>
      </div>
    </div>
  )
}

/** A question with its answer control under it. Plain words, no jargon key. */
export function Ask({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div>
        <span className="block text-body text-ink-muted">{label}</span>
        {hint && <span className="block text-micro text-white/35 mt-0.5 leading-snug">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** The optional half of a composer, folded until asked for. */
export function More({ label = 'More', children }: { label?: string; children: React.ReactNode }) {
  const h = useHaptics()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={() => { h.tap(); setOpen(o => !o) }}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-body text-ink-faint hover:text-ink-muted self-start min-h-[44px]"
      >
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Less' : label}
      </button>
      {open && children}
    </div>
  )
}

/** One line of text, sized for a thumb. */
export const LINE_CLS =
  'w-full px-4 py-3 min-h-[48px] rounded-xl bg-white/[0.03] border border-white/10 text-lede text-ink placeholder:text-ink-faint outline-none focus:border-white/25'

export const PARA_CLS = `${LINE_CLS} leading-relaxed resize-y`

/** Ten chips for a 1 to 10 score, plus one for "not scored". Never a select. */
export function ScoreChips({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <OptionChips
      options={[{ value: '', label: 'Not scored' }, ...[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => ({ value: String(n), label: String(n) }))]}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
