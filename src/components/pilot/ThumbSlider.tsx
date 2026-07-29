import React, { useCallback, useRef, useState } from 'react'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * A one-thumb slider with detents.
 *
 * Five buttons in a row is a form. Dragging a thumb across a track, feeling a
 * tick at every notch, and watching the words change under your finger is a
 * reading. The value is the same; the act of giving it is not, and the act is
 * the point of the check-in.
 *
 * Haptics fire on notch CROSSING during the drag, not on release, so the track
 * has texture under the thumb. Built on pointer events so it works for touch,
 * mouse and pen with one code path, and keyboard arrows keep it accessible.
 */

export interface Notch {
  value: number
  label: string
}

interface Props {
  label: string
  notches: Notch[]
  value: number | null
  onChange: (v: number) => void
  /** Rendered under the track when a value is set. */
  hint?: string
}

export function ThumbSlider({ label, notches, value, onChange, hint }: Props) {
  const h = useHaptics()
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const lastRef = useRef<number | null>(value)

  const min = notches[0].value
  const max = notches[notches.length - 1].value

  const valueFromX = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return min
    const r = el.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return Math.round(min + pct * (max - min))
  }, [min, max])

  const apply = useCallback((next: number) => {
    if (next === lastRef.current) return
    lastRef.current = next
    // A tick per notch crossed. The ends get a firmer edge so the extremes of
    // the scale feel like walls rather than more of the same.
    if (next === min || next === max) h.impactRigid()
    else h.impactLight()
    onChange(next)
  }, [h, onChange, min, max])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDragging(true)
    apply(valueFromX(e.clientX))
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    apply(valueFromX(e.clientX))
  }
  const end = () => setDragging(false)

  const current = notches.find(n => n.value === value)
  const pct = value === null ? 0 : ((value - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-muted">{label}</span>
        <span className={`text-[15px] transition-colors ${value === null ? 'text-ink-faint' : 'text-ink'}`}>
          {current ? current.label : 'Drag to set'}
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={current?.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); apply(Math.max(min, (value ?? min) - 1)) }
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); apply(Math.min(max, (value ?? min) + 1)) }
        }}
        className="relative h-[64px] flex items-center cursor-pointer touch-none outline-none group"
        style={{ touchAction: 'none' }}
      >
        {/* Track */}
        <div className="absolute left-0 right-0 h-[10px] rounded-full bg-white/[0.06] border border-white/[0.08]" />
        {/* Fill */}
        <div
          className="absolute left-0 h-[10px] rounded-full bg-white/[0.22] transition-[width] duration-75"
          style={{ width: value === null ? '0%' : `calc(${pct}% )` }}
        />
        {/* Detent pips */}
        <div className="absolute left-0 right-0 flex justify-between px-[3px] pointer-events-none">
          {notches.map(n => (
            <span
              key={n.value}
              className={`w-[3px] h-[3px] rounded-full transition-colors ${
                value !== null && n.value <= value ? 'bg-base/50' : 'bg-white/25'
              }`}
            />
          ))}
        </div>
        {/* Thumb */}
        {value !== null && (
          <div
            className={`absolute w-[34px] h-[34px] rounded-full bg-base border-2 border-white/35 shadow-lg shadow-black/20 pointer-events-none transition-transform duration-75 ${
              dragging ? 'scale-110' : 'scale-100'
            }`}
            style={{ left: `calc(${pct}% - 17px)` }}
          />
        )}
        {value === null && (
          <div className="absolute inset-x-0 flex justify-center pointer-events-none">
            <span className="text-[11px] text-ink-faint/70 group-focus:text-ink-faint">slide</span>
          </div>
        )}
      </div>

      {hint && <p className="text-[12px] text-ink-faint leading-relaxed -mt-1">{hint}</p>}
    </div>
  )
}

/** What each notch means, so the number is never just a number. */
export const ENERGY_NOTCHES: Notch[] = [
  { value: 1, label: 'Empty' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Steady' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Sharp' },
]

export const ANXIETY_NOTCHES: Notch[] = [
  { value: 1, label: 'Quiet' },
  { value: 2, label: 'Settled' },
  { value: 3, label: 'Noticeable' },
  { value: 4, label: 'Loud' },
  { value: 5, label: 'Roaring' },
]
