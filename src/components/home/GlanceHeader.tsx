import React from 'react'
import { TrendingUp, TrendingDown, Target, Inbox } from 'lucide-react'
import { useRevenueAttribution } from '../../hooks/useRevenueAttribution'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { useHaptics } from '../../hooks/useHaptics'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * The five-second answer. One row, three segments — Money / Today / Waiting —
 * so opening Home answers "is the money up, what are my 3, what's waiting on me"
 * before any scroll. Money taps to Subscriptions; Today + Waiting scroll to
 * their section on this page (DailyDriver / DecisionsInbox).
 */
export function GlanceHeader({
  variant = 'mobile',
  onNavigate,
}: {
  variant?: 'mobile' | 'desktop'
  onNavigate?: NavigateFn
}) {
  const h = useHaptics()
  const { liveMrr, mrrDelta7d, loading } = useRevenueAttribution()
  const { today } = useDailyFocus()
  const { decisions } = useRealtimeDecisionsWaiting()

  const focusOn = isFocusEnabled()
  const doneCount = today
    ? [today.target_1_completed_at, today.target_2_completed_at, today.target_3_completed_at].filter(Boolean).length
    : 0
  const waiting = decisions.length
  const deltaPositive = mrrDelta7d >= 0

  const scrollTo = (id: string) => {
    h.select()
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const mobile = variant === 'mobile'
  const valueSize = mobile ? 'text-[20px]' : 'text-[18px]'
  const labelSize = mobile ? 'text-[10px]' : 'text-[9px]'

  return (
    <div
      className={`grid grid-cols-3 gap-2 ${mobile ? 'px-1' : ''}`}
      role="group"
      aria-label="At a glance"
    >
      <GlanceCell
        onClick={() => { h.select(); onNavigate?.('customers') }}
        icon={deltaPositive
          ? <TrendingUp size={12} className="text-emerald-400" />
          : <TrendingDown size={12} className="text-rose-400" />}
        label="MRR"
        value={loading ? '—' : `$${Math.round(liveMrr).toLocaleString()}`}
        sub={loading ? '' : `${deltaPositive ? '+' : ''}${Math.round(mrrDelta7d).toLocaleString()}/wk`}
        subColor={deltaPositive ? 'text-emerald-400/80' : 'text-rose-400/80'}
        valueSize={valueSize}
        labelSize={labelSize}
      />
      <GlanceCell
        onClick={() => scrollTo('daily-driver')}
        icon={<Target size={12} className="text-violet-400" />}
        label="Today"
        value={focusOn ? `${doneCount}/3` : '—'}
        sub={focusOn ? (doneCount === 3 ? 'all shipped' : 'plays') : 'focus off'}
        subColor="text-white/45"
        valueSize={valueSize}
        labelSize={labelSize}
      />
      <GlanceCell
        onClick={() => scrollTo('decisions-inbox')}
        icon={<Inbox size={12} className={waiting > 0 ? 'text-amber-400' : 'text-white/40'} />}
        label="Waiting"
        value={`${waiting}`}
        sub={waiting === 0 ? 'inbox zero' : 'on you'}
        subColor={waiting > 0 ? 'text-amber-400/80' : 'text-white/45'}
        valueSize={valueSize}
        labelSize={labelSize}
      />
    </div>
  )
}

function GlanceCell({
  onClick, icon, label, value, sub, subColor, valueSize, labelSize,
}: {
  onClick?: () => void
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  subColor: string
  valueSize: string
  labelSize: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-left active:bg-white/[0.07] transition-colors min-h-[60px]"
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={`${labelSize} font-bold uppercase tracking-[0.12em] text-white/55`}>{label}</span>
      </div>
      <span className={`${valueSize} font-bold font-mono tabular-nums text-white leading-none`}>{value}</span>
      {sub && <span className={`text-[10px] ${subColor} truncate w-full`}>{sub}</span>}
    </button>
  )
}
