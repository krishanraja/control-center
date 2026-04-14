import React from 'react'

/**
 * Mobile-native primitives. Fixed viewport shell + hero + stat pills + scroll-
 * within-card feed. Each mobile tab composes these for a consistent, one-screen
 * layout with a pinned bottom tab bar.
 */

// Reserve space for BottomNav (~64px) + iOS safe area inset.
const BOTTOM_NAV_SPACE = 'pb-[calc(env(safe-area-inset-bottom,0px)+72px)]'

/** Fixed-height column: never page-scrolls; content area scrolls if needed. */
export function MobileShell({
  header,
  children,
}: {
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col h-[100dvh] ${BOTTOM_NAV_SPACE}`}>
      {header && <div className="px-4 pt-4 pb-2 flex-shrink-0">{header}</div>}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3 scrollbar-hide">
        {children}
      </div>
    </div>
  )
}

/** Tab title + subtitle. */
export function TabHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string
  subtitle?: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[12px] text-white/40 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-3">{trailing}</div>}
    </div>
  )
}

/** Prominent "one thing that needs you" hero. */
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
    violet:  'from-violet-500/20 via-violet-500/10 to-transparent border-violet-400/25',
    amber:   'from-amber-500/20 via-amber-500/10 to-transparent border-amber-400/25',
    emerald: 'from-emerald-500/20 via-emerald-500/10 to-transparent border-emerald-400/25',
    red:     'from-red-500/20 via-red-500/10 to-transparent border-red-400/25',
    neutral: 'from-white/[0.06] via-white/[0.03] to-transparent border-white/[0.08]',
  }
  const Wrapper: any = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`relative w-full text-left rounded-2xl border p-4 bg-gradient-to-br ${accentMap[accent]} overflow-hidden ${onClick ? 'active:scale-[0.99] transition-transform' : ''}`}
    >
      {eyebrow && (
        <div className="flex items-center gap-2 mb-2">
          {dotColor && <span className={`w-2 h-2 rounded-full ${dotColor}`} />}
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
            {eyebrow}
          </span>
        </div>
      )}
      <p className="text-[17px] font-semibold text-white leading-snug">{title}</p>
      {detail && (
        <p className="text-[12px] text-white/55 mt-1.5 leading-relaxed line-clamp-3">
          {detail}
        </p>
      )}
      <div className="flex items-center justify-between mt-3">
        {meta ? (
          <span className="text-[11px] text-white/40">{meta}</span>
        ) : <span />}
        {cta && (
          <span className="text-[11px] font-semibold text-white/80 bg-white/[0.08] border border-white/[0.08] rounded-full px-3 py-1">
            {cta} →
          </span>
        )}
      </div>
    </Wrapper>
  )
}

/** Compact stat for a 3-up horizontal row. */
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
    <div className="flex-1 min-w-0 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-center">
      <p className={`text-[20px] font-bold leading-none font-mono ${color}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-widest text-white/35 mt-1.5 truncate">
        {label}
      </p>
      {sub && <p className="text-[9px] text-white/25 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

/** Card container for secondary detail; scrolls inside if tall. */
export function FeedCard({
  title,
  action,
  children,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
      {(title || action) && (
        <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/[0.04]">
          {title && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
              {title}
            </p>
          )}
          {action}
        </div>
      )}
      <div className="divide-y divide-white/[0.04]">{children}</div>
    </div>
  )
}

/** Single row inside a FeedCard. */
export function FeedRow({
  dotColor,
  title,
  detail,
  trailing,
  onClick,
}: {
  dotColor?: string
  title: string
  detail?: string
  trailing?: React.ReactNode
  onClick?: () => void
}) {
  const Wrapper: any = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 ${onClick ? 'active:bg-white/[0.04] transition-colors' : ''}`}
    >
      {dotColor && (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/85 leading-snug truncate">
          {title}
        </p>
        {detail && (
          <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed line-clamp-2">
            {detail}
          </p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-2">{trailing}</div>}
    </Wrapper>
  )
}

/** Skeleton/empty state */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-center text-[12px] text-white/30">{label}</div>
  )
}
