import React from 'react'
import { FeedbackButton, type FeedbackSurface } from '../shared/FeedbackButton'
import { usePressable } from '../shared/usePressable'

/**
 * Mobile-native primitives — thumb-scale, fills the viewport.
 *
 * Sized for an average 390-420px-wide modern phone. Typography lives in the
 * 11-28px range so titles, body, and stat values share a coherent scale.
 * All tap targets stay ≥ 48dp.
 */

// BottomNav is ~108-120px tall including safe area (taller buttons for thumb
// reach). Exported so the second shell (MobileShell.tsx, with pull-to-refresh)
// reserves identical space.
export const BOTTOM_NAV_PAD = 'pb-[calc(env(safe-area-inset-bottom,0px)+120px)]'

/**
 * h-[100dvh] column. Content area is a flex column with gap-5 so fill={true}
 * children actually grow (margin-based space-y-* defeats flex-1). Cards run
 * flush to the viewport edge — section labels and prose carry their own
 * horizontal padding when they need a gutter.
 */
export function MobileShell({
  header,
  children,
}: {
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-[calc(100dvh/var(--z,1))]">
      {header && <div className="px-5 pt-7 pb-5 flex-shrink-0">{header}</div>}
      <div
        className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 scrollbar-hide ${BOTTOM_NAV_PAD}`}
      >
        {children}
      </div>
    </div>
  )
}

import { Logomark } from './Logomark'
import { MobileTabSkeleton } from '../shared/Skeleton'

/**
 * First-paint loading screen for a mobile tab — the single-focus skeleton inside
 * the real shell + title, so the page settles into live data instead of flashing
 * a "Loading…" line. Drop-in for any tab: render it when the tab is loading and
 * has no data yet, e.g. `if (loading && rows.length === 0) return <MobileLoadingScreen title="…" />`.
 */
export function MobileLoadingScreen({
  title,
  subtitle = 'One moment…',
  rows = 4,
}: { title: string; subtitle?: string; rows?: number }) {
  return (
    <MobileShell header={<TabHeader title={title} subtitle={subtitle} />}>
      <MobileTabSkeleton rows={rows} />
    </MobileShell>
  )
}

/** Large nav title — iOS Large Title + Display Small scale. */
export function TabHeader({
  title,
  subtitle,
  leading,
  trailing,
}: {
  title?: string
  subtitle?: string
  leading?: React.ReactNode
  trailing?: React.ReactNode
}) {
  const resolvedLeading = leading === undefined ? <Logomark size={40} /> : leading
  return (
    <div className="flex items-end justify-between gap-3">
      {resolvedLeading && <div className="flex-shrink-0 self-start mt-1">{resolvedLeading}</div>}
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="font-bold text-white leading-[1.1] tracking-tight truncate text-[28px]">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-[14px] text-white/55 mt-1.5 truncate">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-3">{trailing}</div>}
    </div>
  )
}

/** The one thing that needs you — prominent, tappable, impossible to miss. */
export function HeroCard({
  eyebrow,
  title,
  detail,
  meta,
  dotColor,
  accent = 'violet',
  cta,
  onClick,
}: {
  eyebrow?: string
  title: string
  detail?: string
  meta?: string
  dotColor?: string
  accent?: 'violet' | 'amber' | 'emerald' | 'red' | 'neutral'
  cta?: string
  onClick?: () => void
}) {
  const accentMap: Record<string, string> = {
    violet:  'from-violet-500/30 via-violet-500/12 to-transparent border-violet-400/40',
    amber:   'from-amber-500/30 via-amber-500/12 to-transparent border-amber-400/40',
    emerald: 'from-emerald-500/30 via-emerald-500/12 to-transparent border-emerald-400/40',
    red:     'from-red-500/30 via-red-500/12 to-transparent border-red-400/40',
    neutral: 'from-white/[0.10] via-white/[0.05] to-transparent border-white/[0.12]',
  }
  const ctaColorMap: Record<string, string> = {
    violet:  'bg-violet-500 text-white',
    amber:   'bg-amber-400 text-black',
    emerald: 'bg-emerald-400 text-black',
    red:     'bg-red-500 text-white',
    neutral: 'btn-contrast',
  }
  const Wrapper: any = onClick ? 'button' : 'div'
  const { bind } = usePressable({ onPress: onClick, haptic: 'tap', disabled: !onClick })
  return (
    <Wrapper
      {...(onClick ? { onClick: bind.onClick, onPointerDown: bind.onPointerDown } : {})}
      className={`relative w-full text-left rounded-3xl border p-6 bg-gradient-to-br ${accentMap[accent]} shadow-e2 overflow-hidden flex-shrink-0 ${onClick ? 'active:scale-[0.99] transition-transform duration-200 ease-spring' : ''}`}
    >
      {eyebrow && (
        <div className="flex items-center gap-2.5 mb-4">
          {dotColor && <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />}
          <span className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-white/65">
            {eyebrow}
          </span>
        </div>
      )}
      <p className="text-[23px] font-display font-bold text-white leading-[1.15] tracking-tight">
        {title}
      </p>
      {detail && (
        <p className="text-[14px] text-white/65 mt-3 leading-[1.45] line-clamp-3">
          {detail}
        </p>
      )}
      <div className="flex items-center justify-between mt-5">
        {meta ? (
          <span className="text-[12px] text-white/50">{meta}</span>
        ) : <span />}
        {cta && (
          <span className={`text-[14px] font-semibold rounded-full px-5 py-2.5 ${ctaColorMap[accent]}`}>
            {cta}
          </span>
        )}
      </div>
    </Wrapper>
  )
}

/** 3-up stat row — display numerals, 100dp min. */
export function StatPill({
  label,
  value,
  color = 'text-white',
  sub,
}: {
  label: string
  value: string | number
  color?: string
  sub?: string
}) {
  return (
    <div
      className="surface flex-1 min-w-0 rounded-2xl px-3 py-5 text-center flex-shrink-0"
      style={{ minHeight: 100 }}
    >
      <p className={`text-[36px] font-bold leading-none font-mono tabular-nums tracking-tight ${color}`}>
        {value}
      </p>
      <p className="text-[11px] font-display font-semibold uppercase tracking-[0.1em] text-white/55 mt-2.5 truncate">
        {label}
      </p>
      {sub && <p className="text-[11px] text-white/35 mt-1 truncate">{sub}</p>}
    </div>
  )
}

/** Secondary card. fill=true grows to claim leftover viewport. */
export function FeedCard({
  title,
  action,
  children,
  fill = false,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  fill?: boolean
}) {
  return (
    <div
      className={`surface rounded-2xl overflow-hidden ${fill ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0'}`}
    >
      {(title || action) && (
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
          {title && (
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-white/60">
              {title}
            </p>
          )}
          {action}
        </div>
      )}
      <div
        className={`divide-y divide-white/[0.06] ${fill ? 'flex-1 min-h-0 overflow-y-auto scrollbar-hide' : ''}`}
      >
        {children}
      </div>
    </div>
  )
}

/** 76dp row, 16px title. */
export function FeedRow({
  dotColor,
  title,
  detail,
  trailing,
  onClick,
  feedback,
}: {
  dotColor?: string
  title: string
  detail?: string
  trailing?: React.ReactNode
  onClick?: () => void
  feedback?: { sourceTable: FeedbackSurface; sourceId: string; agentId?: string | null }
}) {
  // The tappable area and the feedback control must be SIBLINGS, never nested.
  // A <button> (FeedbackButton's thumbs) inside a row <button> is invalid HTML;
  // browsers auto-correct the DOM on mobile and the inner thumbs stop receiving
  // taps — which reads to the user as "I can't take any actions on a lead".
  const Tappable: any = onClick ? 'button' : 'div'
  // Touch-down haptic for the row tap; we keep the existing background-shift
  // affordance (a full-width row scaling would read wrong) rather than the
  // scale press-effect, so we use the hook's bind but not its pressClass.
  const { bind } = usePressable({ onPress: onClick, haptic: 'tap', disabled: !onClick })
  return (
    <div
      className="w-full px-5 py-4 flex items-start gap-3"
      style={{ minHeight: 76 }}
    >
      <Tappable
        {...(onClick ? { onClick: bind.onClick, onPointerDown: bind.onPointerDown } : {})}
        className={`flex-1 min-w-0 text-left flex items-start gap-3 ${onClick ? 'active:bg-white/[0.05] transition-colors' : ''}`}
      >
        {dotColor && (
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold text-white leading-snug line-clamp-2">
            {title}
          </p>
          {detail && (
            <p className="text-[14px] text-white/55 mt-1 leading-[1.45] line-clamp-2">
              {detail}
            </p>
          )}
        </div>
        {trailing && <div className="flex-shrink-0 ml-3 self-center">{trailing}</div>}
      </Tappable>
      {feedback && (
        <div className="flex-shrink-0 ml-2 self-center">
          <FeedbackButton sourceTable={feedback.sourceTable} sourceId={feedback.sourceId} agentId={feedback.agentId} compact />
        </div>
      )}
    </div>
  )
}

/**
 * Quiet empty state — for "nothing here yet / not set up" cases that are NOT a
 * celebration (e.g. "No customers yet. Apply the migration."). For a genuine
 * "you cleared it" moment, use <AllClear> instead, which earns a drawn check and
 * a success haptic. Keeping these distinct means we never buzz "well done" at a
 * blank setup screen.
 */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-5 py-16 text-center text-[14px] text-white/40 animate-rise">{label}</div>
  )
}
