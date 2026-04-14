import React from 'react'

/**
 * Mobile-native primitives sized for human thumbs.
 *
 * Scale follows Material 3 / iOS HIG:
 *   - 48dp minimum tap target (we use 56dp on rows, 64dp on pills)
 *   - 16sp body minimum, 22-28sp titles, 32sp+ hero numerics
 *   - 20-24dp horizontal padding, 16-20dp between sections
 */

// Reserve space for BottomNav (~88px incl. safe area) so pinned tabs never
// overlap content and the last row in a FeedCard is never cut off.
const BOTTOM_NAV_SPACE = 'pb-[calc(env(safe-area-inset-bottom,0px)+96px)]'

/** Fixed-height column: page never scrolls, content scrolls inside. */
export function MobileShell({
  header,
  children,
}: {
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-[100dvh]">
      {header && (
        <div className="px-5 pt-6 pb-4 flex-shrink-0">{header}</div>
      )}
      <div className={`flex-1 min-h-0 overflow-y-auto px-5 space-y-4 scrollbar-hide ${BOTTOM_NAV_SPACE}`}>
        {children}
      </div>
    </div>
  )
}

/** Tab title + subtitle — large, iOS-style navigation title. */
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
        <h1 className="text-[30px] font-bold text-white leading-[1.1] tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[15px] text-white/50 mt-1 truncate">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-3">{trailing}</div>}
    </div>
  )
}

/** The one thing that needs you — large, tappable, visually dominant. */
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
    violet:  'from-violet-500/25 via-violet-500/10 to-transparent border-violet-400/30',
    amber:   'from-amber-500/25 via-amber-500/10 to-transparent border-amber-400/30',
    emerald: 'from-emerald-500/25 via-emerald-500/10 to-transparent border-emerald-400/30',
    red:     'from-red-500/25 via-red-500/10 to-transparent border-red-400/30',
    neutral: 'from-white/[0.08] via-white/[0.04] to-transparent border-white/[0.10]',
  }
  const ctaColorMap: Record<string, string> = {
    violet:  'bg-violet-500 text-white',
    amber:   'bg-amber-500 text-black',
    emerald: 'bg-emerald-500 text-black',
    red:     'bg-red-500 text-white',
    neutral: 'bg-white/[0.12] text-white',
  }
  const Wrapper: any = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`relative w-full text-left rounded-3xl border p-6 bg-gradient-to-br ${accentMap[accent]} overflow-hidden ${onClick ? 'active:scale-[0.99] transition-transform' : ''}`}
      style={{ minHeight: 180 }}
    >
      {eyebrow && (
        <div className="flex items-center gap-2 mb-3">
          {dotColor && <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />}
          <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/60">
            {eyebrow}
          </span>
        </div>
      )}
      <p className="text-[22px] font-semibold text-white leading-[1.25]">
        {title}
      </p>
      {detail && (
        <p className="text-[15px] text-white/60 mt-3 leading-relaxed line-clamp-3">
          {detail}
        </p>
      )}
      <div className="flex items-center justify-between mt-5">
        {meta ? (
          <span className="text-[13px] text-white/45">{meta}</span>
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

/** Compact stat for a 3-up horizontal row — large numerals, readable label. */
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
      className="flex-1 min-w-0 bg-white/[0.04] border border-white/[0.07] rounded-2xl px-3 py-4 text-center"
      style={{ minHeight: 88 }}
    >
      <p className={`text-[28px] font-bold leading-none font-mono tracking-tight ${color}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-[0.12em] text-white/45 mt-2 truncate">
        {label}
      </p>
      {sub && <p className="text-[10px] text-white/30 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

/** Card container for secondary detail. */
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
    <div className="bg-white/[0.04] border border-white/[0.07] rounded-3xl overflow-hidden">
      {(title || action) && (
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.05]">
          {title && (
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/50">
              {title}
            </p>
          )}
          {action}
        </div>
      )}
      <div className="divide-y divide-white/[0.05]">{children}</div>
    </div>
  )
}

/** Single row inside a FeedCard — 56dp minimum tap target. */
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
      className={`w-full text-left px-5 py-4 flex items-start gap-3.5 ${onClick ? 'active:bg-white/[0.05] transition-colors' : ''}`}
      style={{ minHeight: 64 }}
    >
      {dotColor && (
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-2 ${dotColor}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-medium text-white leading-snug line-clamp-2">
          {title}
        </p>
        {detail && (
          <p className="text-[14px] text-white/50 mt-1 leading-relaxed line-clamp-2">
            {detail}
          </p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-2 self-center">{trailing}</div>}
    </Wrapper>
  )
}

/** Skeleton/empty state */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-5 py-16 text-center text-[15px] text-white/35">{label}</div>
  )
}
