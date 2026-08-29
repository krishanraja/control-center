import React, { useEffect, useState } from 'react'
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
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/45 active:bg-white/[0.08]"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        </div>

        <VoiceField value={text} onChange={setText} rows={3} placeholder={placeholder} autoFocus />

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
