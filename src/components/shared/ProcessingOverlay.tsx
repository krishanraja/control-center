import { useDeviceClass, useReducedMotion } from './motion'

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
 */
export function ProcessingOverlay({ label, sub }: { label: string; sub?: string }) {
  const device = useDeviceClass()
  return device === 'mobile'
    ? <MobileThinking label={label} sub={sub} />
    : <DesktopThinking label={label} sub={sub} />
}

/** The brand mark with a single particle orbiting it — the system, thinking. */
function ThinkingOrbit({ size }: { size: number }) {
  const reduced = useReducedMotion()
  const mark = Math.round(size * 0.6)
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} aria-hidden>
      {/* Faint orbit ring + a second, slower counter-ring for depth. */}
      <div className="absolute inset-0 rounded-full border border-white/[0.08]" />
      <div className="absolute inset-[14%] rounded-full border border-white/[0.05]" />
      {!reduced && (
        <>
          <div className="absolute inset-0 animate-orbit">
            <span className="absolute left-1/2 -top-px -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-violet-300 shadow-[0_0_12px_3px_rgba(167,139,250,0.7)]" />
          </div>
          <div className="absolute inset-[14%] animate-orbit-slow">
            <span className="absolute left-1/2 -top-px -translate-x-1/2 w-1 h-1 rounded-full bg-sky-300/80 shadow-[0_0_8px_2px_rgba(125,211,252,0.6)]" />
          </div>
        </>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/icon-192.png"
          alt=""
          className="rounded-2xl ring-1 ring-white/10 shadow-lg shadow-black/40 animate-mark-breathe"
          style={{ width: mark, height: mark }}
        />
      </div>
    </div>
  )
}

/** Honest indeterminate rail — a light traveling the track, no fake percentage. */
function IndeterminateRail({ width = 168 }: { width?: number }) {
  const reduced = useReducedMotion()
  return (
    <div className="rounded-full bg-white/[0.06] overflow-hidden" style={{ width, height: 3 }}>
      <div
        className={`h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-violet-300/80 to-transparent ${reduced ? 'opacity-60' : 'animate-indeterminate'}`}
      />
    </div>
  )
}

function MobileThinking({ label, sub }: { label: string; sub?: string }) {
  return (
    <div
      className="on-dark fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-[120] flex flex-col items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in"
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-6 px-8 text-center animate-scale-in">
        <ThinkingOrbit size={84} />
        <div className="flex flex-col items-center gap-2.5">
          <p className="text-[16px] font-semibold text-white/90 tracking-tight">{label}</p>
          <p className="text-[12.5px] text-white/45 leading-relaxed max-w-[15rem]">{sub || 'One moment…'}</p>
          <div className="mt-1.5"><IndeterminateRail width={150} /></div>
        </div>
      </div>
    </div>
  )
}

function DesktopThinking({ label, sub }: { label: string; sub?: string }) {
  return (
    <div
      className="on-dark fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-md animate-fade-in"
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
    >
      <div className="flex items-center gap-5 rounded-3xl border border-white/10 bg-command-surface/90 px-7 py-6 shadow-glass-lg animate-scale-in min-w-[340px] max-w-[440px]">
        <ThinkingOrbit size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1">Working</p>
          <p className="text-[15px] font-semibold text-white/90 tracking-tight truncate">{label}</p>
          <p className="text-[12.5px] text-white/45 leading-snug mt-0.5 truncate">{sub || 'Running…'}</p>
          <div className="mt-3"><IndeterminateRail width={220} /></div>
        </div>
      </div>
    </div>
  )
}
