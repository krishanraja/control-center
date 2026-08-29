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
    <div className="flex items-center gap-1.5 mt-3 flex-wrap flex-shrink-0">
      {present.map(l => (
        <a
          key={l.label}
          href={l.href}
          target={l.href.startsWith('mailto:') ? undefined : '_blank'}
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors"
        >
          {l.icon ?? <ExternalLink size={11} />}
          {l.label}
        </a>
      ))}
    </div>
  )
}
