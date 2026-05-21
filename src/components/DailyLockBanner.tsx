import React from 'react'
import { Lock, CheckCircle2 } from 'lucide-react'
import { useStreaks } from '../hooks/useStreaks'

/**
 * Pillar 5 — Daily Lock banner. Renders only after 8PM local if no
 * lever_score ≥ threshold task has been completed today. The point is
 * social pressure: don't close the laptop until you've moved a dollar.
 *
 * Auto-hides once `daily_lock_done` flips true.
 */
export function DailyLockBanner() {
  const s = useStreaks()
  if (s.loading || s.daily_lock_done) return null

  const now = new Date()
  const hour = now.getHours()
  if (hour < 20) return null   // only nag after 8pm

  return (
    <div className="rounded-xl border-2 border-red-500/40 bg-gradient-to-r from-red-500/[0.08] to-red-500/[0.02] p-4 flex items-start gap-3">
      <Lock size={16} className="text-red-300 mt-0.5 flex-shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white">Daily Lock — close one high-lever task before bed</p>
        <p className="text-[11px] text-red-200/85 mt-1 leading-snug">
          No lever-7+ task completed today. The system is asking you to either
          ship one or explicitly lower the bar by editing settings. Activity ≠ progress.
        </p>
      </div>
      <CheckCircle2 size={14} className="text-white/30 flex-shrink-0 mt-0.5" />
    </div>
  )
}
