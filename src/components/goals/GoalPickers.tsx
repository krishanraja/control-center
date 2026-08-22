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
    return <p className="text-label text-white/45">Set an OS goal first.</p>
  }
  return (
    <div className="space-y-1.5">
      <p className="text-micro text-white/40">Which OS goal does this serve?</p>
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
                  ? 'border-violet-400/50 bg-violet-500/15 text-white'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/65 hover:bg-white/[0.05]'
              }`}
            >
              <Target size={12} className={on ? 'text-violet-200' : 'text-white/35'} aria-hidden />
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
      <p className="text-micro text-white/40">Venture, if it belongs to one</p>
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
 */
export function OptionChips({
  label, options, value, onChange, disabled,
}: {
  label?: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      {label && <p className="text-micro text-white/40">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <Chip key={o.value} label={o.label} on={value === o.value} disabled={disabled} onClick={() => onChange(o.value)} />
        ))}
      </div>
    </div>
  )
}

function Chip({ label, on, onClick, disabled }: {
  label: string; on: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[32px] rounded-full border px-3 py-1 text-label transition-colors disabled:opacity-40 ${
        on
          ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
          : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
      }`}
    >
      {label}
    </button>
  )
}
