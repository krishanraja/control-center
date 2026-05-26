import React from 'react'
import { FeedbackButton, type FeedbackSurface } from '../shared/FeedbackButton'

/**
 * Mobile-native primitives — thumb-scale, fills the viewport.
 *
 * Sized for an average 390-420px-wide modern phone at arm's length. Scale is
 * deliberately ~2× a desktop dashboard so a glance gives you the state
 * without squinting. All tap targets ≥ 48dp (rows 84dp, pills 140dp).
 */

// BottomNav is ~96-104px tall including safe area.
const BOTTOM_NAV_PAD = 'pb-[calc(env(safe-area-inset-bottom,0px)+104px)]'

/**
 * h-[100dvh] column. Content area is a flex column with gap-5 so fill={true}
 * children actually grow (margin-based space-y-* defeats flex-1).
 */
export function MobileShell({
  header,
  children,
}: {
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-[100dvh]">
      {header && <div className="px-5 pt-7 pb-5 flex-shrink-0">{header}</div>}
      <div
        className={`flex-1 min-h-0 overflow-y-auto px-5 flex flex-col gap-5 scrollbar-hide ${BOTTOM_NAV_PAD}`}
      >
        {children}
      </div>
    </div>
  )
}

import { Logomark } from './Logomark'

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
          // 44px overflowed 390px viewports for longer titles ("Subscriptions",
          // "Organisation", "Intelligence") and even short titles ("Services")
          // wrapped when a trailing element ate horizontal space. Step the size
          // down by character count and truncate as a final safety net so
          // titles always sit on one line.
          <h1
            className={`font-bold text-white leading-[1.05] tracking-tight truncate ${
              title.length >= 13
                ? 'text-[28px]'
                : title.length >= 10
                  ? 'text-[32px]'
                  : 'text-[36px]'
            }`}
          >
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-[19px] text-white/55 mt-2 truncate">{subtitle}</p>
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
    neutral: 'bg-white text-black',
  }
  const Wrapper: any = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`relative w-full text-left rounded-[32px] border p-8 bg-gradient-to-br ${accentMap[accent]} overflow-hidden flex-shrink-0 ${onClick ? 'active:scale-[0.99] transition-transform' : ''}`}
      style={{ minHeight: 300 }}
    >
      {eyebrow && (
        <div className="flex items-center gap-3 mb-5">
          {dotColor && <span className={`w-3.5 h-3.5 rounded-full ${dotColor}`} />}
          <span className="text-[15px] font-bold uppercase tracking-[0.16em] text-white/70">
            {eyebrow}
          </span>
        </div>
      )}
      <p className="text-[32px] font-bold text-white leading-[1.15] tracking-tight">
        {title}
      </p>
      {detail && (
        <p className="text-[18px] text-white/65 mt-5 leading-[1.45] line-clamp-3">
          {detail}
        </p>
      )}
      <div className="flex items-center justify-between mt-7">
        {meta ? (
          <span className="text-[16px] text-white/50">{meta}</span>
        ) : <span />}
        {cta && (
          <span className={`text-[18px] font-semibold rounded-full px-7 py-4 ${ctaColorMap[accent]}`}>
            {cta}
          </span>
        )}
      </div>
    </Wrapper>
  )
}

/** 3-up stat row — big display numerals, 140dp min. */
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
      className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.08] rounded-3xl px-3 py-6 text-center flex-shrink-0"
      style={{ minHeight: 140 }}
    >
      <p className={`text-[52px] font-bold leading-none font-mono tracking-tight ${color}`}>
        {value}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55 mt-3.5 truncate">
        {label}
      </p>
      {sub && <p className="text-[12px] text-white/35 mt-1 truncate">{sub}</p>}
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
      className={`bg-white/[0.05] border border-white/[0.08] rounded-[32px] overflow-hidden ${fill ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0'}`}
    >
      {(title || action) && (
        <div className="px-7 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
          {title && (
            <p className="text-[14px] font-bold uppercase tracking-[0.16em] text-white/60">
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

/** 84dp row, 22px title. */
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
  const Wrapper: any = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left px-7 py-6 flex items-start gap-4 ${onClick ? 'active:bg-white/[0.05] transition-colors' : ''}`}
      style={{ minHeight: 88 }}
    >
      {dotColor && (
        <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 mt-2 ${dotColor}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[20px] font-semibold text-white leading-snug line-clamp-2">
          {title}
        </p>
        {detail && (
          <p className="text-[16px] text-white/55 mt-2 leading-[1.45] line-clamp-2">
            {detail}
          </p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-3 self-center">{trailing}</div>}
      {feedback && (
        <div className="flex-shrink-0 ml-2 self-center" onClick={(e) => e.stopPropagation()}>
          <FeedbackButton sourceTable={feedback.sourceTable} sourceId={feedback.sourceId} agentId={feedback.agentId} compact />
        </div>
      )}
    </Wrapper>
  )
}

/** Empty state */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-5 py-20 text-center text-[18px] text-white/40">{label}</div>
  )
}
