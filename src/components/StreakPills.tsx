import React from 'react'
import { Flame, MessageSquare, PenSquare, Phone, Target } from 'lucide-react'
import { useStreaks } from '../hooks/useStreaks'
import { isFocusEnabled } from '../hooks/useDailyFocus'

interface Props {
  variant?: 'mobile' | 'desktop'
}

export function StreakPills({ variant = 'mobile' }: Props) {
  const s = useStreaks()
  if (s.loading) return null

  const basePills = [
    { label: 'Customer talks', value: s.customer_contacts, icon: Phone },
    { label: 'Content shipped', value: s.content_shipped,  icon: PenSquare },
    { label: 'Sales touches',  value: s.sales_touches,    icon: MessageSquare },
  ]
  const pills = isFocusEnabled()
    ? [...basePills, { label: '3-for-3', value: s.three_for_three, icon: Target }]
    : basePills

  const isMobile = variant === 'mobile'
  const cols = pills.length === 4
    ? (isMobile ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-3')
    : (isMobile ? 'grid-cols-3 gap-2' : 'grid-cols-3 gap-3')

  return (
    <div className={`grid ${cols} flex-shrink-0`}>
      {pills.map(p => {
        const lit = p.value > 0
        const accent =
          p.value >= 7 ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.05]' :
          p.value >= 3 ? 'text-amber-300 border-amber-500/25 bg-amber-500/[0.04]'   :
          p.value >= 1 ? 'text-violet-300 border-violet-500/20 bg-violet-500/[0.03]' :
                         'text-white/35 border-white/10 bg-white/[0.02]'
        const Icon = p.icon
        return (
          <div key={p.label} className={`rounded-xl border ${accent} px-3 py-2.5`}>
            <div className="flex items-center gap-1.5">
              <Icon size={11} />
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold truncate">
                {p.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`${isMobile ? 'text-[22px]' : 'text-[18px]'} font-bold tabular-nums leading-none`}>
                {p.value}
              </span>
              <span className="text-[10px] text-white/45">day{p.value === 1 ? '' : 's'}</span>
              {lit && <Flame size={11} className="ml-auto" />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
