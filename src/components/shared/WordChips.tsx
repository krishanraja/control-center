import React, { useState } from 'react'
import { X } from '@/lib/icons'
import { Chip } from './ChipOverflow'

/**
 * A list of words you can add to and take away from, as chips.
 *
 * The house rule is chips, never a native select, for choosing from a small
 * set (`goals/GoalPickers`, `shared/ChipOverflow`). Every one of those picks
 * from a CLOSED set. Buyer titles are an open set: Krish types "Head of
 * Partnerships" and it has to stick. Nothing in the repo could do that, so a
 * free-text list was the one genuinely missing shape.
 *
 * It is not a second chip. The chip itself is `Chip` from ChipOverflow, the
 * same component the closed-set rows use, so there is one chip look in the app
 * and this file only adds the adding and the removing.
 *
 * `options` turns it into a closed set that still reads as one row of chips:
 * every option is shown, tapping toggles it, and nothing can be typed. That is
 * the seniority and country rows.
 */
export function WordChips({
  label, hint, value, onChange, options, placeholder, disabled, testId,
}: {
  label: string
  /** One plain line under the label saying what the list is for. */
  hint?: string
  value: string[]
  onChange: (next: string[]) => void
  /** Closed set: show these and let nothing else be typed. */
  options?: ReadonlyArray<{ id: string; label: string }>
  placeholder?: string
  disabled?: boolean
  testId?: string
}) {
  const [draft, setDraft] = useState('')

  const has = (w: string) => value.some(v => v.toLowerCase() === w.toLowerCase())
  const toggle = (w: string) => onChange(has(w) ? value.filter(v => v.toLowerCase() !== w.toLowerCase()) : [...value, w])
  const add = () => {
    const t = draft.trim()
    if (!t) return
    if (!has(t)) onChange([...value, t])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex flex-col gap-0.5">
        <p className="text-micro text-ink-faint">{label}</p>
        {hint && <p className="text-micro text-ink-faint">{hint}</p>}
      </div>

      {options ? (
        <div className="flex flex-wrap gap-x-1.5 gap-y-3">
          {options.map(o => (
            <Chip key={o.id} on={has(o.id)} disabled={disabled} onClick={() => toggle(o.id)} testId={testId ? `${testId}-${o.id}` : undefined}>
              {o.label}
            </Chip>
          ))}
        </div>
      ) : (
        <>
          {value.length > 0 && (
            <ul className="flex flex-wrap gap-x-1.5 gap-y-3">
              {value.map(w => (
                <li key={w}>
                  <Chip on disabled={disabled} onClick={() => toggle(w)} testId={testId ? `${testId}-chip` : undefined}>
                    <span className="inline-flex items-center gap-1 tap-44">
                      {w}
                      <X size={10} aria-hidden />
                      <span className="sr-only">Remove {w}</span>
                    </span>
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              disabled={disabled}
              placeholder={placeholder || 'Type one and press Enter'}
              aria-label={label}
              data-testid={testId ? `${testId}-input` : undefined}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
                if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
              }}
              onBlur={add}
              className="min-h-[44px] w-full min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 text-ui text-ink placeholder:text-ink-faint focus-visible:border-violet-400/40 focus-visible:outline-none"
            />
          </div>
        </>
      )}
    </div>
  )
}
