import React, { useEffect, useState, type ReactNode } from 'react'
import { MoreHorizontal } from '@/lib/icons'
import { BottomSheet } from '../mobile/BottomSheet'
import { Eyebrow } from './Eyebrow'
import { VoiceField } from '../pilot/controls'
import { Working } from './Working'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * The focused editor: how a piece of text gets edited on a phone.
 *
 * On mobile you never edit inside a dense layout. The old pattern put an
 * input, Retire, Cancel and Save side by side in a row that could not fit a
 * phone (Save rendered off the right edge of the screen), under a keyboard
 * the app did not know existed. This sheet is the replacement, and the rules
 * it carries are the write-side doctrine:
 *
 *   - The text is shown large and whole, never through a keyhole.
 *   - Voice sits beside the keyboard as an equal (VoiceField).
 *   - ONE primary action, full width, riding above the keyboard
 *     (useKeyboardInset), so Save is always on screen.
 *   - Cancel is the sheet's own dismissal: swipe down, backdrop, Escape.
 *   - A destructive action never sits next to typing. It hides behind the
 *     "…" button and asks once before it runs.
 *
 * Desktop keeps its inline editing — a pointer plus a wide row is the right
 * mechanics there. Same action, different device, different shape.
 *
 * Three options for LONG text, the dictated kind (the strategist's note,
 * ADR-026), each off by default so a title editor stays as it was:
 *   - `grow`: the field grows with the words instead of showing three rows of
 *     them, up to about half the screen (VoiceField `grow`).
 *   - `onChange`: every change, as it happens, so the caller can keep a draft.
 *     Cancel is a swipe, the scrim or Escape, and none of them may cost him a
 *     paragraph he dictated.
 *   - `header`: a small control above the field (a chip row saying what the
 *     text is), chosen before the one action runs.
 */
export function FocusedEditor({
  open,
  onClose,
  label,
  value,
  placeholder,
  saveLabel = 'Save',
  onSave,
  danger,
  onChange,
  grow = false,
  header,
}: {
  open: boolean
  onClose: () => void
  /** Small eyebrow naming what is being edited, e.g. "OS goal". */
  label: string
  value: string
  placeholder?: string
  saveLabel?: string
  onSave: (text: string) => Promise<boolean> | boolean
  /** Optional destructive action, kept behind "…" with one confirm tap. */
  danger?: { label: string; confirmLabel: string; run: () => Promise<boolean> | boolean }
  /** Every change as it happens, for a caller that keeps a draft. */
  onChange?: (text: string) => void
  /** Grow with the text (long, dictated text) instead of three fixed rows. */
  grow?: boolean
  /** A small control above the field, e.g. a chip row naming what this is. */
  header?: ReactNode
}) {
  const h = useHaptics()
  const [text, setText] = useState(value)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [armed, setArmed] = useState(false)

  // Fresh text each time the sheet opens on something.
  useEffect(() => {
    if (open) { setText(value); setMenuOpen(false); setArmed(false) }
  }, [open, value])

  const change = (t: string) => {
    setText(t)
    onChange?.(t)
  }

  const save = async () => {
    if (busy || !text.trim()) return
    setBusy(true)
    try {
      const ok = await onSave(text.trim())
      if (ok) { h.success(); onClose() }
    } finally {
      setBusy(false)
    }
  }

  const runDanger = async () => {
    if (!danger || busy) return
    if (!armed) { h.impactRigid(); setArmed(true); return }
    setBusy(true)
    try {
      const ok = await danger.run()
      if (ok) { h.success(); onClose() }
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} fullHeight={false} ariaLabel={label}>
      <div className="flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        <div className="flex items-center justify-between pb-3">
          <Eyebrow>{label}</Eyebrow>
          {danger && (
            <button
              type="button"
              aria-label="More options"
              aria-expanded={menuOpen}
              onClick={() => { h.tap(); setMenuOpen(o => !o); setArmed(false) }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint active:bg-white/[0.08]"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        </div>

        {header && <div className="pb-3">{header}</div>}

        <VoiceField value={text} onChange={change} rows={3} placeholder={placeholder} autoFocus grow={grow} />

        {danger && menuOpen && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runDanger()}
            className={`mt-3 w-full rounded-xl border py-3 text-ui font-semibold transition-colors disabled:opacity-40 ${
              armed
                ? 'border-rose-400/50 bg-rose-500/20 text-rose-100'
                : 'border-rose-400/25 bg-rose-500/[0.06] text-rose-300/85'
            }`}
          >
            {armed ? danger.confirmLabel : danger.label}
          </button>
        )}

        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void save()}
          className="btn-contrast mt-4 w-full rounded-xl py-3.5 text-ui font-semibold disabled:opacity-40"
        >
          {busy ? <Working size={13} /> : saveLabel}
        </button>
      </div>
    </BottomSheet>
  )
}
