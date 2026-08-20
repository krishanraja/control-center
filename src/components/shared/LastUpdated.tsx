import React from 'react'
import { Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Working } from './Working'

/**
 * How old is what I am looking at, and is it being checked right now.
 *
 * Half of a refresh; RefreshRail is the other half. A dozen panels in this app
 * silently repoll on a 60-second timer, which is the correct behaviour and,
 * without this, completely invisible: the numbers change under you with nothing
 * to say why, and a stale figure is indistinguishable from a fresh one.
 *
 * Deliberately quiet. This is ambient, not an alert, and it must never compete
 * with the content whose age it is reporting.
 */
export function LastUpdated({ date, refreshing = false }: { date: Date | null; refreshing?: boolean }) {
  if (refreshing) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-white/30 font-mono" role="status" aria-live="polite">
        <Working size={10} />
        Checking
      </span>
    )
  }
  if (!date) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-white/25 font-mono">
      <Clock size={10} />
      Updated {formatDistanceToNow(date, { addSuffix: true })}
    </span>
  )
}
