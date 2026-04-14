import React from 'react'

/**
 * Mobile-native primitives sized like a flagship consumer app.
 *
 * Scale references: iOS Large Title ≈ 34pt, Material Display Small ≈ 36sp,
 * Gmail/Calendar row titles ≈ 17sp, Stripe mobile dashboard numerals ≈ 40sp.
 * Minimum tap target 48dp; we use 72dp on rows and 120dp on pills.
 */

// Reserve space for BottomNav (~96-104px incl. safe area).
const BOTTOM_NAV_SPACE = 'pb-[calc(env(safe-area-inset-bottom,0px)+104px)]'

/** Fixed-height column. Content fills the viewport — no dead space. */
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
      <div className={`flex-1 min-h-0 overflow-y-auto px-5 space-y-5 scrollbar-hide ${BOTTOM_NAV_SPACE}`}>
        {children}
      </div>
    </div>
  )
}

/** iOS-style large navigation title. */
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
        <h1 className="text-[36px] font-bold text-white leading-[1.05] tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[17px] text-white/55 mt-2 truncate">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-3">{trailing}</div>}
    </div>
  )
}

/** Dominant hero card — the single thing that needs you. */
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
    violet:  'from-violet-500/30 via-violet-500/12 to-transparent border-violet-400/35',
    amber:   'from-amber-500/30 via-amber-500/12 to-transparent border-amber-400/35',
    emerald: 'from-emerald-500/30 via-emerald-500/12 to-transparent border-emerald-400/35',
    red:     'from-red-500/30 via-red-500/12 to-transparent border-red-400/35',
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
      className={`relative w-full text-left rounded-[28px] border p-7 bg-gradient-to-br ${accentMap[accent]} overflow-hidden ${onClick ? 'active:scale-[0.99] transition-transform' : ''}`}
      style={{ minHeight: 240 }}
    >
      {eyebrow && (
        <div className="flex items-center gap-2.5 mb-4">
          {dotColor && <span className={`w-3 h-3 rounded-full ${dotColor}`} />}
          <span className="text-[13px] font-bold uppercase tracking-[0.16em] text-white/65">
            {eyebrow}
          </span>
        </div>
      )}
      <p className="text-[26px] font-semibold text-white leading-[1.2]">
        {title}
      </p>
      {detail && (
        <p className="text-[16px] text-white/65 mt-4 leading-relaxed line-clamp-3">
          {detail}
        </p>
      )}
      <div className="flex items-center justify-between mt-6">
        {meta ? (
          <span className="text-[14px] text-white/50">{meta}</span>
        ) : <span />}
        {cta && (
          <span className={`text-[16px] font-semibold rounded-full px-6 py-3 ${ctaColorMap[accent]}`}>
            {cta}
          </span>
        )}
      </div>
    </Wrapper>
  )
}

/** 3-up stat row — big, scannable numerals. */
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
      className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.08] rounded-2xl px-3 py-5 text-center"
      style={{ minHeight: 116 }}
    >
      <p className={`text-[38px] font-bold leading-none font-mono tracking-tight ${color}`}>
        {value}
      </p>
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55 mt-3 truncate">
        {label}
      </p>
      {sub && <p className="text-[11px] text-white/35 mt-1 truncate">{sub}</p>}
    </div>
  )
}

/** Secondary card — grows to fill leftover viewport so there's no dead space. */
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
      className={`bg-white/[0.05] border border-white/[0.08] rounded-[28px] overflow-hidden ${fill ? 'flex-1 min-h-0 flex flex-col' : ''}`}
    >
      {(title || action) && (
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
          {title && (
            <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-white/60">
              {title}
            </p>
          )}
          {action}
        </div>
      )}
      <div className={`divide-y divide-white/[0.06] ${fill ? 'flex-1 min-h-0 overflow-y-auto scrollbar-hide' : ''}`}>
        {children}
      </div>
    </div>
  )
}

/** 72dp min row with generous typography. */
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
      className={`w-full text-left px-6 py-5 flex items-start gap-4 ${onClick ? 'active:bg-white/[0.05] transition-colors' : ''}`}
      style={{ minHeight: 76 }}
    >
      {dotColor && (
        <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[18px] font-semibold text-white leading-snug line-clamp-2">
          {title}
        </p>
        {detail && (
          <p className="text-[15px] text-white/55 mt-1.5 leading-relaxed line-clamp-2">
            {detail}
          </p>
        )}
      </div>
      {trailing && <div className="flex-shrink-0 ml-3 self-center">{trailing}</div>}
    </Wrapper>
  )
}

/** Empty state */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-5 py-16 text-center text-[16px] text-white/40">{label}</div>
  )
}
