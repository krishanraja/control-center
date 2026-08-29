import React, { useEffect, useRef } from 'react'
import { Mic, Square } from '@/lib/icons'
import { useHaptics } from '../../hooks/useHaptics'
import { useDictation } from '../../hooks/useDictation'

/**
 * Thumb-first primitives for the pilot layer.
 *
 * Three rules, learned from using v1 on a phone:
 *   1. Every interactive element gives haptic feedback on touch-down, not on
 *      the resolved click. The delay is what made v1 feel dead.
 *   2. Nothing is smaller than 44px in its tappable dimension.
 *   3. The keyboard is never the only way in. Any text ask leads with a mic.
 */

/** Minimum comfortable thumb target. */
export const TAP = 'min-h-[48px]'

interface TapProps {
  children: React.ReactNode
  onTap: () => void
  disabled?: boolean
  className?: string
  variant?: 'primary' | 'secondary' | 'quiet' | 'chip'
  selected?: boolean
  ariaLabel?: string
  /** Which haptic to fire on touch-down. */
  feel?: 'press' | 'select' | 'success' | 'impactRigid' | 'impactMedium'
}

const VARIANT: Record<string, string> = {
  primary: 'bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] font-medium',
  secondary: 'border border-white/10 text-ink-muted hover:bg-white/[0.05] hover:text-ink',
  quiet: 'text-ink-faint hover:text-ink-muted',
  chip: 'border text-ui',
}

/**
 * The one button used across the pilot layer. Fires haptics on pointerdown so
 * the device answers the thumb immediately, and scales down under the finger.
 */
export function Tap({
  children, onTap, disabled, className = '', variant = 'primary',
  selected, ariaLabel, feel = 'press',
}: TapProps) {
  const h = useHaptics()
  const base = variant === 'chip'
    ? (selected
        ? 'bg-white/[0.12] border-white/30 text-ink'
        : 'bg-white/[0.03] border-white/10 text-ink-muted')
    : VARIANT[variant]

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={() => { if (!disabled) h[feel]() }}
      onClick={() => { if (!disabled) onTap() }}
      className={`${TAP} px-4 rounded-xl text-ui transition-all duration-100 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 touch-manipulation select-none ${base} ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * A text field that leads with the mic. Dictation uses the on-device
 * SpeechRecognition API via the repo's existing useDictation hook, so there is
 * no round trip and no endpoint. When the browser has no recogniser the mic
 * hides itself and the field degrades to plain typing.
 */
export function VoiceField({
  value, onChange, placeholder, rows = 2, autoFocus, onEnter,
}: {
  value: string
  onChange: (s: string) => void
  placeholder?: string
  rows?: number
  autoFocus?: boolean
  onEnter?: () => void
}) {
  const h = useHaptics()
  const ref = useRef<HTMLTextAreaElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const { listening, supported, toggle, stop } = useDictation((said) => {
    const next = valueRef.current.trim() ? `${valueRef.current.trim()} ${said}` : said
    onChange(next)
    h.success()
  })

  useEffect(() => () => stop(), [stop])

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && onEnter) { e.preventDefault(); onEnter() }
        }}
        placeholder={listening ? 'Listening…' : placeholder}
        className={`w-full px-4 py-3.5 ${supported ? 'pr-[60px]' : ''} rounded-xl bg-white/[0.03] border text-lede leading-relaxed text-ink placeholder:text-ink-faint outline-none resize-none transition-colors ${
          listening ? 'border-white/30' : 'border-white/10 focus:border-white/25'
        }`}
      />
      {supported && (
        <button
          type="button"
          aria-label={listening ? 'Stop dictation' : 'Dictate'}
          onPointerDown={() => h.impactRigid()}
          onClick={toggle}
          className={`absolute right-2.5 top-2.5 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 touch-manipulation ${
            listening
              ? 'bg-white/[0.16] text-ink'
              : 'bg-white/[0.06] text-ink-muted hover:bg-white/[0.10] hover:text-ink'
          }`}
        >
          {listening ? <Square size={15} /> : <Mic size={17} />}
        </button>
      )}
    </div>
  )
}

// The pilot dock used to live here: a floating pill holding "compile a worry"
// and "shutdown", pinned over every tab. Removed 2026-08-20. Persistent chrome
// on every screen is exactly the kind of ambient self-monitoring the pilot
// layer exists to avoid, and both actions now have a real home on the Focus &
// Purpose tab (src/components/focusPurpose/FocusPurposeTab.tsx). The after-5pm
// shutdown prompt still fires from EveningShutdown, once a day.
