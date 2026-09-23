import React from 'react'
import { ExternalLink } from '@/lib/icons'

export interface QuickLink {
  label: string
  href: string
  icon?: React.ReactNode
}

/**
 * A compact row of outbound action links for swipe cards. Each link stops
 * propagation so tapping it never also triggers the card's tap-to-open. Renders
 * nothing when there are no links. Styling matches the inline link pattern used
 * by GuestCard / VisibilityTargetCard so cards read consistently.
 */
export function QuickLinkRow({ links }: { links: QuickLink[] }) {
  const present = links.filter(l => l.href)
  if (present.length === 0) return null
  return (
    // One line, scrolled sideways — never wrapped.
    //
    // On a triage card, which is a STAGE and has nowhere to scroll, four links
    // wrapped to a second row at 360px and that row landed behind the bottom
    // nav with no way to reach it. Measured 2026-09-23: "Google" and "YouTube"
    // sat under the nav on the Visibility deck. A sideways row keeps every
    // link on the card and reachable; the scrollbar is hidden, the way the
    // vitals band on Home already does it.
    <div className="flex items-center gap-1.5 mt-3 flex-nowrap overflow-x-auto scrollbar-hide flex-shrink-0">
      {present.map(l => (
        <a
          key={l.label}
          href={l.href}
          target={l.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          // 30px tall, and on a scouted guest's card these four links ARE the
          // card's purpose — "hear them talk before pitching". The chip keeps
          // its size; `.tap-44` gives it a thumb-sized hit area.
          className="tap-44 flex flex-shrink-0 items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-white/10 text-ink-muted hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors"
        >
          {l.icon ?? <ExternalLink size={11} />}
          {l.label}
        </a>
      ))}
    </div>
  )
}
