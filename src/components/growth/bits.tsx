/**
 * Growth: small shared parts. Words for every kind of move, the product tag,
 * plain channel and engine names, what each site answer means, and the one
 * overlay switch (sheet on a touch device, right panel on the desk).
 */
import React from 'react'
import {
  CalendarCheck, CheckSquare, CircleDollarSign, Film, Globe, UserPlus, type LucideIcon,
} from '@/lib/icons'
import { ventureLabel } from '../../lib/ventureOptions'
import { PRODUCT_TONE, PRODUCTS, type Channel, type ProductSlug } from '../../lib/growth'
import { growthSlugOf, type NextMove } from '../../lib/growthModel'
import { BottomSheet } from '../mobile/BottomSheet'
import { SlideOver } from '../shared/SlideOver'

export type MoveKind = 'choice' | 'site' | 'review' | 'account' | 'clip' | 'spend' | 'place'

/** The kind a move reads as: a site ruling with answer chips is a quick choice. */
export function moveKind(m: NextMove): MoveKind {
  if (m.source === 'site') return m.choices?.length ? 'choice' : 'site'
  return m.source
}

export const KIND: Record<MoveKind, { label: string; icon: LucideIcon }> = {
  choice: { label: 'Quick choice', icon: CheckSquare },
  site: { label: 'From the site check', icon: Globe },
  review: { label: 'From Sunday\'s review', icon: CalendarCheck },
  account: { label: 'Account to make', icon: UserPlus },
  clip: { label: 'Clip to make', icon: Film },
  spend: { label: 'Money check', icon: CircleDollarSign },
  place: { label: 'A place to cover', icon: Globe },
}

/**
 * What each site answer MEANS, never what the system will do with it. The
 * registry stores one word per answer (proof, measure, park, live, retire);
 * a word on its own does not say what choosing it commits to.
 */
export const ANSWER_WORDS: Record<string, { label: string; hint: string }> = {
  proof: { label: 'Keep it as a proof piece', hint: 'It shows what you can build. It is not for sale.' },
  measure: { label: 'Just measure it for now', hint: 'Keep counting visits and decide again later.' },
  park: { label: 'Park it', hint: 'Leave it alone for now.' },
  live: { label: 'Yes, it is live', hint: 'It is a product you are selling.' },
  retire: { label: 'Retire it', hint: 'It is finished. Stop counting it.' },
}

/** Channel names a 12-year-old follows. The table's own labels say GEO and SEO. */
export const CHANNEL_WORDS: Record<Channel, string> = {
  seo: 'Google search',
  geo: 'AI answers',
  social_organic: 'Social posts',
  social_paid: 'Paid social',
  substack: 'Newsletter',
  partner: 'Partner',
  community: 'Community',
  product: 'Listing',
  podcast: 'Podcast',
  maven: 'Maven',
}

/** Google's AI answer is stored as `google_aio`; on screen it is just Google. */
export const ENGINE_WORDS: Record<string, string> = {
  chatgpt: 'ChatGPT', perplexity: 'Perplexity', google_aio: 'Google', claude: 'Claude', grok: 'Grok',
}

const PLATFORM: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', x: 'X', substack: 'Substack',
  linkedin: 'LinkedIn page', youtube: 'YouTube channel',
}
export function platformLabel(p: string): string { return PLATFORM[p.toLowerCase()] ?? p }

export function ProductTag({ slug, className = '' }: { slug: string | null | undefined; className?: string }) {
  if (!slug) return null
  const g = growthSlugOf(slug)
  const tone = g && PRODUCTS.includes(g as ProductSlug) ? PRODUCT_TONE[g as ProductSlug] : 'text-ink-muted bg-white/[0.04] border-white/10'
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-semibold whitespace-nowrap ${tone} ${className}`}>
      {ventureLabel(slug) ?? slug}
    </span>
  )
}

export function minutesLabel(m: number | null | undefined): string | null {
  if (m == null) return null
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

/** A sheet on a touch device, the right panel on the desk. Both are house overlays. */
export function Overlay({ open, onClose, label, mobile, children }: {
  open: boolean; onClose: () => void; label: string; mobile: boolean; children: React.ReactNode
}) {
  if (mobile) {
    return (
      <BottomSheet open={open} onClose={onClose} fullHeight={false} ariaLabel={label}>
        <div className="max-h-[calc(82dvh/var(--z,1))] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
          {children}
        </div>
      </BottomSheet>
    )
  }
  return (
    <SlideOver open={open} onClose={onClose} ariaLabel={label} label={label}>
      {children}
    </SlideOver>
  )
}
