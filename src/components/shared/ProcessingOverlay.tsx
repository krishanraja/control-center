import React from 'react'
import { X } from '@/lib/icons'
import { MindmakeIdentity } from './MindmakeIdentity'
import { useDeviceClass, useReducedMotion } from './motion'
import { SHOW_ELAPSED_AFTER_MS } from '../../hooks/useAsyncAction'

/**
 * The "thinking" moment. While an agent works, this owns the surface so (a) it's
 * unmistakable that the system is doing something *for you* and (b) no second
 * action can fire mid-flight (no double-drafts, double-ships).
 *
 * Calm & Anticipatory, and device-native — same props, two shapes:
 *  • Mobile (decide): full attention. The mark breathes, a particle orbits it,
 *    and an honest indeterminate rail says "still working". One thing, front
 *    and centre — because on a phone you came to make a single decision.
 *  • Desktop (orchestrate): a running-command console card over a lighter scrim.
 *    It reads as one operation executing in your workspace, not the whole world
 *    stopping — because at a desk you're mid-session and expect to flow on.
 *
 * Use it for DISCRETE async actions the user waits on. Do NOT use it for
 * background/queue jobs that return immediately (those belong on the card).
 *
 * Three things it now does that a blocking overlay has to do, and did not:
 *
 *   TIME. These waits run 30 to 60 seconds. An overlay that says the same word
 *   for a minute is indistinguishable from a hang. Past three seconds it shows
 *   elapsed; past 1.5x the expected duration it says "longer than usual" in
 *   words, because a number climbing with no reference point is just anxiety.
 *
 *   PROGRESS. Where the work has nameable stages, it names the one it is on.
 *   That is the only honest alternative to a percentage nothing can compute.
 *
 *   AN EXIT. Anything that can hold the screen for a minute must be leaveable.
 *   `onCancel` renders a dismiss; without it the overlay is still modal, which
 *   is correct for short, uninterruptible writes.
 *
 * The scrim is theme-native. It used to pin itself to obsidian in both themes
 * via `.on-dark`, which meant the room went dark mid-session at midday. It now
 * dims toward the app's own ground, matching the house dialog overlay.
 */
export interface ProcessingOverlayProps {
  label: string
  sub?: string
  /** From useAsyncAction. Elapsed appears past the shared threshold. */
  elapsedMs?: number
  /** The stage the work is on, when it has nameable stages. */
  stage?: string | null
  /** Roughly how long this normally takes. Past it, the copy says so. */
  expectedMs?: number
  /** Render an escape. Omit for short writes that must not be interrupted. */
  onCancel?: () => void
}

export function ProcessingOverlay(props: ProcessingOverlayProps) {
  const device = useDeviceClass()
  return device === 'mobile' ? <MobileThinking {...props} /> : <DesktopThinking {...props} />
}

function seconds(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/** The one line under the label: stage, or reassurance, plus the honest clock. */
function useWaitLine({ sub, stage, elapsedMs = 0, expectedMs }: ProcessingOverlayProps) {
  const overdue = Boolean(expectedMs && elapsedMs > expectedMs * 1.5)
  const primary = stage || (overdue ? 'Taking longer than usual. Still running.' : sub || 'One moment…')
  const clock = elapsedMs >= SHOW_ELAPSED_AFTER_MS ? seconds(elapsedMs) : null
  return { primary, clock, overdue }
}

/** The brand mark with a single particle orbiting it — the system, thinking. */
function ThinkingOrbit({ size }: { size: number }) {
  const reduced = useReducedMotion()
  const mark = Math.round(size * 0.6)
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} aria-hidden>
      {/* Faint orbit ring + a second, slower counter-ring for depth. */}
      <div className="absolute inset-0 rounded-full border border-white/[0.10]" />
      <div className="absolute inset-[14%] rounded-full border border-white/[0.07]" />
      {!reduced && (
        <>
          <div className="absolute inset-0 animate-orbit">
            <span className="absolute left-1/2 -top-px -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_12px_3px_rgb(var(--accent)/0.6)]" />
          </div>
          <div className="absolute inset-[14%] animate-orbit-slow">
            <span className="absolute left-1/2 -top-px -translate-x-1/2 w-1 h-1 rounded-full bg-accent-3 shadow-[0_0_8px_2px_rgb(var(--accent-3)/0.55)]" />
          </div>
        </>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="animate-mark-breathe motion-reduce:animate-none">
          <MindmakeIdentity size={mark} />
        </div>
      </div>
    </div>
  )
}

/** Honest indeterminate rail — a light traveling the track, no fake percentage. */
function IndeterminateRail({ width = 168 }: { width?: number }) {
  const reduced = useReducedMotion()
  return (
    <div className="rounded-full bg-white/[0.08] overflow-hidden" style={{ width, height: 3 }}>
      <div
        className={`h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent ${reduced ? 'opacity-60' : 'animate-indeterminate'}`}
      />
    </div>
  )
}

function CancelButton({ onCancel, className = '' }: { onCancel: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onCancel}
      className={`inline-flex items-center gap-1 text-label text-white/40 hover:text-white/75 transition-colors ${className}`}
    >
      <X size={11} aria-hidden /> Stop
    </button>
  )
}

function MobileThinking(props: ProcessingOverlayProps) {
  const { label, onCancel } = props
  const { primary, clock } = useWaitLine(props)
  return (
    <div
      className="fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-[120] flex flex-col items-center justify-center bg-base/85 backdrop-blur-md animate-fade-in"
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-6 px-8 text-center animate-scale-in">
        <ThinkingOrbit size={84} />
        <div className="flex flex-col items-center gap-2.5">
          <p className="text-lede font-semibold text-white/90 tracking-tight">{label}</p>
          <p className="text-label text-white/45 leading-relaxed max-w-[15rem]">{primary}</p>
          <div className="mt-1.5"><IndeterminateRail width={150} /></div>
          {clock && <p className="text-micro text-white/30 tabular-nums mt-0.5">{clock}</p>}
          {onCancel && <CancelButton onCancel={onCancel} className="mt-2" />}
        </div>
      </div>
    </div>
  )
}

function DesktopThinking(props: ProcessingOverlayProps) {
  const { label, onCancel } = props
  const { primary, clock } = useWaitLine(props)
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-base/70 backdrop-blur-md animate-fade-in"
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
    >
      <div className="glass-card flex items-center gap-5 rounded-3xl px-7 py-6 shadow-e3 animate-scale-in min-w-[340px] max-w-[440px]">
        <ThinkingOrbit size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <p className="text-micro uppercase tracking-[0.14em] text-white/40">Working</p>
            {clock && <p className="text-micro text-white/30 tabular-nums ml-auto">{clock}</p>}
          </div>
          <p className="text-ui font-semibold text-white/90 tracking-tight truncate">{label}</p>
          <p className="text-label text-white/45 leading-snug mt-0.5 truncate">{primary}</p>
          <div className="mt-3 flex items-center gap-3">
            <IndeterminateRail width={onCancel ? 170 : 220} />
            {onCancel && <CancelButton onCancel={onCancel} />}
          </div>
        </div>
      </div>
    </div>
  )
}
