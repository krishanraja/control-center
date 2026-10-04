import React from 'react'
import { Target } from '@/lib/icons'
import type { CanonGoal } from '../../hooks/useGoalCanon'

/**
 * The two choices a weekly objective needs, as things you can read and tap.
 *
 * Both used to be native <select>s. The parent goal — the single most
 * important relationship on the screen — rendered as a dropdown truncated to
 * "Serves: 200+ leaders s…", unreadable at the exact moment of choosing, and
 * the venture hid two or three options behind another one. There are never
 * more than three OS goals and a handful of ventures: small sets are chips,
 * not dropdowns, on every device.
 */

export function ServesPicker({
  os, value, onChange, disabled,
}: {
  os: CanonGoal[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  if (os.length === 0) {
    return <p className="text-label text-ink-faint">Set an OS goal first.</p>
  }
  return (
    <div className="space-y-1.5">
      <p className="text-micro text-ink-faint">Which OS goal does this serve?</p>
      <div className="flex flex-col gap-1.5">
        {os.map(g => {
          const on = value === g.id
          return (
            <button
              key={g.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange(g.id)}
              className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                on
                  ? 'border-violet-400/50 bg-violet-500/15 text-ink'
                  : 'border-white/[0.08] bg-white/[0.02] text-ink-muted hover:bg-white/[0.05]'
              }`}
            >
              <Target size={12} className={on ? 'text-violet-200' : 'text-ink-faint'} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-body leading-snug">{g.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function VentureChips({
  ventures, value, onChange, disabled,
}: {
  ventures: string[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  if (ventures.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="text-micro text-ink-faint">Venture, if it belongs to one</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip label="None" on={value === ''} disabled={disabled} onClick={() => onChange('')} />
        {ventures.map(v => (
          <Chip key={v} label={v} on={value === v} disabled={disabled} onClick={() => onChange(v)} />
        ))}
      </div>
    </div>
  )
}

/**
 * A labelled row of choice chips: the house replacement for a small-set
 * <select> anywhere in the app. Options stay readable and one tap away.
 *
 * Two optional extensions (2026-10-04, Growth's one-move card), both off by
 * default so every existing call site renders exactly as before:
 *   - `size="touch"` is the chip at the house touch height (44px) and the ui
 *     size, for a choice that IS the primary action of a surface rather than a
 *     field inside a form.
 *   - `stack` lays the options out as full-width rows, one per line, so an
 *     option can carry a `hint` saying what choosing it does. A three-way
 *     answer on a 260px phone column reads as three sentences, not three
 *     squeezed pills.
 *   - `even` (2026-10-04, Content's "how sure are we" scale) lays a short,
 *     ordered set out as one row of equal-width chips, so a scale reads as a
 *     scale (50 to 90 left to right) instead of wrapping 3 + 2 on a phone.
 *     Only for five short options or fewer.
 * Every chip carries `.tap-44`, so even the compact 32px chip is hit-tested at
 * 44px without moving its ink, and a wrapped row keeps a 44px pitch.
 */
export function OptionChips({
  label, options, value, onChange, disabled, size = 'default', stack = false, even = false,
}: {
  label?: string
  options: Array<{ value: string; label: string; hint?: string }>
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  size?: 'default' | 'touch'
  stack?: boolean
  even?: boolean
}) {
  return (
    <div className="space-y-1.5">
      {label && <p className="text-micro text-ink-faint">{label}</p>}
      {/* A wrapped second row sits 12px below the first: 32px chips plus that
          gap is the 44px pitch, so two rows' hit areas never overlap. */}
      <div className={stack ? 'flex flex-col gap-2' : even ? 'grid grid-flow-col auto-cols-fr gap-1.5' : 'flex flex-wrap gap-x-1.5 gap-y-3'}>
        {options.map(o => (
          <Chip
            key={o.value}
            label={o.label}
            hint={stack ? o.hint : undefined}
            on={value === o.value}
            disabled={disabled}
            size={size}
            stack={stack}
            even={even}
            onClick={() => onChange(o.value)}
          />
        ))}
      </div>
    </div>
  )
}

function Chip({ label, hint, on, onClick, disabled, size = 'default', stack = false, even = false }: {
  label: string; hint?: string; on: boolean; onClick: () => void; disabled?: boolean
  size?: 'default' | 'touch'; stack?: boolean; even?: boolean
}) {
  const sizing = size === 'touch'
    ? `min-h-[44px] ${even ? 'px-1' : 'px-4'} py-2.5 text-ui font-semibold`
    : `min-h-[32px] ${even ? 'px-1' : 'px-3'} py-1 text-label`
  const shape = stack ? 'w-full rounded-xl text-left' : even ? 'w-full rounded-full text-center' : 'rounded-full'
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={`tap-44 border transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${sizing} ${shape} ${
        on
          ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
          : size === 'touch'
            ? 'border-white/[0.14] bg-white/[0.04] text-ink hover:border-violet-400/40 hover:bg-white/[0.07]'
            : 'border-white/10 bg-white/[0.03] text-ink-faint hover:bg-white/[0.06]'
      }`}
    >
      <span className="block">{label}</span>
      {hint && <span className="mt-0.5 block text-label font-normal text-ink-muted">{hint}</span>}
    </button>
  )
}
