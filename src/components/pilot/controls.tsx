import React, { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
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
  chip: 'border text-[14px]',
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
      className={`${TAP} px-4 rounded-xl text-[15px] transition-all duration-100 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 touch-manipulation select-none ${base} ${className}`}
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
        className={`w-full px-4 py-3.5 ${supported ? 'pr-[60px]' : ''} rounded-xl bg-white/[0.03] border text-[16px] leading-relaxed text-ink placeholder:text-ink-faint outline-none resize-none transition-colors ${
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

/**
 * Fixed-position affordance that sits ABOVE the mobile bottom nav rather than
 * behind it. BottomNav is fixed bottom-0 z-50 at ~72px plus safe area; v1 put
 * these at bottom-4 z-40, which buried them completely on a phone.
 */
export function useAboveNavOffset(): string {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024,
  )
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 1024)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return narrow
    ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+88px)]'
    : 'bottom-5'
}

/**
 * The pilot dock: one piece of chrome holding the operator's two affordances,
 * pinned above the mobile bottom nav.
 *
 * Two loose floating buttons read as content that had escaped its container,
 * and they overlapped the cards behind them. Grouping them into a single
 * bordered, blurred pill makes them read as chrome, which is what they are.
 */
export function PilotDock({ children }: { children: React.ReactNode }) {
  const offset = useAboveNavOffset()
  return (
    // The dock and the capture FAB were both z-40 at ~90px off the bottom, the
    // dock centred and the FAB pinned right-4. On a 412px screen the centred
    // dock ran straight under the FAB, so the two overlapped and the right-hand
    // dock button was unreachable. The dock now ends before the FAB's column
    // (right-4 + 56px wide, so 84px of reserved gutter) and centres itself in
    // what is left. Desktop is unchanged: no FAB there, so it stays centred.
    <div
      className={`fixed ${offset} z-40 pointer-events-none flex justify-center
                  left-3 right-[84px] lg:left-1/2 lg:right-auto lg:-translate-x-1/2`}
    >
      {/* Fully opaque. A translucent dock let the cards behind it read straight
          through the labels, which looked like a rendering bug rather than
          chrome. The shadow lifts it off the content instead. */}
      <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-2xl bg-base border border-white/[0.14] shadow-xl shadow-black/25 ring-1 ring-black/[0.04]">
        {children}
      </div>
    </div>
  )
}

/** A single action inside the dock. */
export function DockButton({
  label, onTap, dimmed, title,
}: { label: string; onTap: () => void; dimmed?: boolean; title?: string }) {
  const h = useHaptics()
  return (
    <button
      type="button"
      title={title}
      onPointerDown={() => h.tap()}
      onClick={onTap}
      className={`min-h-[44px] px-4 rounded-xl text-[12.5px] whitespace-nowrap transition-all active:scale-95 touch-manipulation ${
        dimmed
          ? 'text-ink-faint/60 hover:text-ink-faint hover:bg-white/[0.05]'
          : 'text-ink-muted hover:text-ink hover:bg-white/[0.07]'
      }`}
    >
      {label}
    </button>
  )
}
