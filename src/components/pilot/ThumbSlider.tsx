import React, { useCallback, useRef, useState } from 'react'
import { useHaptics } from '../../hooks/useHaptics'
import { blendAnchors } from '../../lib/pilotColor'

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
 *
 * Smoothness is two-layered: the DATA snaps to detents (the reading is one of
 * five words), but the THUMB tracks the finger continuously during the drag
 * and glides to its notch on release. Color rides the continuous position:
 * pass an anchor strip (one color per notch) and the fill, thumb ring, and
 * value word blend through it in real time, with onLive reporting the raw
 * position so the surrounding screen can breathe with the same color.
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
  /** One color per notch. Blended continuously along the track. */
  anchors?: string[]
  /** The raw track position 0..1, streamed during the drag and settled on
   *  release, so ambient surfaces can answer the finger immediately. */
  onLive?: (t: number) => void
}

export function ThumbSlider({ label, notches, value, onChange, hint, anchors, onLive }: Props) {
  const h = useHaptics()
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  /** Raw 0..1 finger position while dragging; null when settled on a notch. */
  const [liveT, setLiveT] = useState<number | null>(null)
  const lastRef = useRef<number | null>(value)

  const min = notches[0].value
  const max = notches[notches.length - 1].value
  const norm = (v: number) => (v - min) / (max - min)

  const fracFromX = useCallback((clientX: number): number => {
    const el = trackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }, [])

  const apply = useCallback((next: number) => {
    if (next === lastRef.current) return
    lastRef.current = next
    // A tick per notch crossed. The ends get a firmer edge so the extremes of
    // the scale feel like walls rather than more of the same.
    if (next === min || next === max) h.impactRigid()
    else h.impactLight()
    onChange(next)
  }, [h, onChange, min, max])

  const track = (frac: number) => {
    setLiveT(frac)
    onLive?.(frac)
    apply(Math.round(min + frac * (max - min)))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setDragging(true)
    track(fracFromX(e.clientX))
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    track(fracFromX(e.clientX))
  }
  const end = () => {
    setDragging(false)
    setLiveT(null)
    // Settle the ambient on the notch the value snapped to.
    if (lastRef.current !== null) onLive?.(norm(lastRef.current))
  }

  const current = notches.find(n => n.value === value)

  // Where the visuals sit: the finger while dragging, the notch otherwise.
  const t = liveT ?? (value === null ? null : norm(value))
  const pct = t === null ? 0 : t * 100

  // Fallbacks ride the theme tokens (--fg flips white utilities to ink in
  // daylight), so an anchor-less slider still adapts to both themes.
  const tint = (alpha = 1) => (anchors && t !== null ? blendAnchors(anchors, t, alpha) : null)
  const fillColor = tint() || 'rgb(var(--fg) / 0.22)'
  const fillFrom = anchors ? blendAnchors(anchors, 0, 0.45) : 'rgb(var(--fg) / 0.10)'
  const glow = tint(dragging ? 0.4 : 0.22)

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body text-ink-muted">{label}</span>
        <span
          className={`text-ui transition-colors duration-150 ${value === null ? 'text-ink-faint' : 'text-ink'}`}
          style={tint() ? { color: tint()! } : undefined}
        >
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
          let next: number | null = null
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(min, (value ?? min) - 1)
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(max, (value ?? min) + 1)
          if (next !== null) { e.preventDefault(); apply(next); onLive?.(norm(next)) }
        }}
        className="relative h-[64px] flex items-center cursor-pointer touch-none outline-none group"
        style={{ touchAction: 'none' }}
      >
        {/* Track */}
        <div className="absolute left-0 right-0 h-[10px] rounded-full bg-white/[0.06] border border-white/[0.08]" />
        {/* Fill: a gradient from the strip's origin to the color under the thumb,
            with a soft glow of the same color so the light feels lit, not painted */}
        <div
          className={`absolute left-0 h-[10px] rounded-full ${dragging ? '' : 'transition-all duration-200 ease-out'}`}
          style={{
            width: value === null && t === null ? '0%' : `${pct}%`,
            background: `linear-gradient(90deg, ${fillFrom}, ${fillColor})`,
            boxShadow: glow ? `0 0 16px ${glow}` : undefined,
          }}
        />
        {/* Detent pips */}
        <div className="absolute left-0 right-0 flex justify-between px-[3px] pointer-events-none">
          {notches.map(n => (
            <span
              key={n.value}
              className="w-[3px] h-[3px] rounded-full transition-colors"
              style={{
                background: t !== null && norm(n.value) <= t + 0.001
                  ? 'rgb(var(--bg-base) / 0.55)'
                  : 'rgb(var(--fg) / 0.25)',
              }}
            />
          ))}
        </div>
        {/* Thumb: follows the finger raw while dragging, glides to the notch on
            release. Ring and centre dot carry the current color. */}
        {t !== null && (
          <div
            className={`absolute w-[34px] h-[34px] rounded-full bg-base border-2 shadow-lg shadow-black/20 pointer-events-none flex items-center justify-center ${
              dragging ? 'scale-110' : 'scale-100 transition-all duration-200 ease-out'
            }`}
            style={{
              left: `calc(${pct}% - ${(pct / 100) * 34}px)`,
              borderColor: tint() || 'rgb(var(--fg) / 0.35)',
              boxShadow: glow ? `0 4px 14px rgba(0,0,0,0.25), 0 0 18px ${glow}` : undefined,
            }}
          >
            <span
              className="w-[8px] h-[8px] rounded-full"
              style={{ background: tint() || 'rgb(var(--fg) / 0.5)' }}
            />
          </div>
        )}
        {t === null && (
          <div className="absolute inset-x-0 flex justify-center pointer-events-none">
            <span className="text-micro text-ink-faint/70 group-focus:text-ink-faint">slide</span>
          </div>
        )}
      </div>

      {hint && <p className="text-label text-ink-faint leading-relaxed -mt-1">{hint}</p>}
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
