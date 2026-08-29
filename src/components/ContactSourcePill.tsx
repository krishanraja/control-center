import React from 'react'
import type { ConsentTier, ContactRow } from '../hooks/useRealtimeContacts'

/**
 * Relationship Engine provenance surface.
 *
 * ContactSourcePill answers "where did this person come from?" — the
 * immutable origin_venture + origin_campaign that tells Krish how he's
 * allowed to speak to them. ConsentTierBadge answers "how warm are they?".
 *
 * Mirrors LeadSourcePill's chip conventions (rounded border, tone classes)
 * but keyed off venture provenance rather than ingest source.
 */

// slug → display name + colour tone (border/bg/text triple, matching the
// existing pill vocabulary in LeadSourcePill).
const VENTURE_META: Record<string, { label: string; tone: string }> = {
  mindmake:       { label: 'Mindmake',       tone: 'text-violet-300 bg-violet-500/10 border-violet-500/20' },
  // Retired July 2026; kept so historical contacts still render a named pill.
  meliora:         { label: 'Meliora (retired)', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
  adfixus:         { label: 'AdFixus (retired)', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
  signal_noise:    { label: 'Signal & Noise',  tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' },
  builder_economy: { label: 'Builder Economy (retired)', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
  fractionl_pulse: { label: 'Fractionl Pulse', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/20' },
  investor:        { label: 'Investor',        tone: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20' },
}

const FALLBACK_VENTURE_TONE = 'text-white/70 bg-white/[0.06] border-white/10'

export function ventureDisplayName(slug?: string | null): string {
  if (!slug) return 'Unknown'
  return VENTURE_META[slug]?.label || slug.replace(/_/g, ' ')
}

interface Props {
  contact: ContactRow
  size?: 'xs' | 'sm'
}

export function ContactSourcePill({ contact, size = 'xs' }: Props) {
  const slug = contact.origin_venture || ''
  const meta = VENTURE_META[slug]
  const tone = meta?.tone || FALLBACK_VENTURE_TONE
  const label = meta?.label || (slug ? slug.replace(/_/g, ' ') : 'Unknown origin')
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-1 py-0.5 text-[9px]'
  const subSize = size === 'sm' ? 'text-[10px]' : 'text-[9px]'

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title="Where this contact came from">
      <span className={`inline-flex items-center gap-1 rounded border ${tone} ${padding} font-medium flex-shrink-0`}>
        <span className="truncate max-w-[120px]">{label}</span>
      </span>
      {contact.origin_campaign && (
        <span className={`${subSize} text-white/45 truncate max-w-[160px]`} title={contact.origin_campaign}>
          {contact.origin_campaign}
        </span>
      )}
    </span>
  )
}

// ─── Consent tier badge: "how warm are they / how can I speak to them" ────────

const TIER_META: Record<ConsentTier, { label: string; tone: string }> = {
  customer:     { label: 'Customer',  tone: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/25' },
  warm:         { label: 'Warm',      tone: 'text-rose-300 bg-rose-500/12 border-rose-500/25' },
  permissioned: { label: 'Permissioned', tone: 'text-amber-300 bg-amber-500/12 border-amber-500/25' },
  cold_engaged: { label: 'Cold · engaged', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
  cold_scraped: { label: 'Cold · scraped', tone: 'text-white/55 bg-white/[0.05] border-white/10' },
}

interface TierProps {
  tier?: ConsentTier | null
  size?: 'xs' | 'sm'
}

export function ConsentTierBadge({ tier, size = 'xs' }: TierProps) {
  if (!tier) return null
  const meta = TIER_META[tier]
  if (!meta) return null
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-1 py-0.5 text-[9px]'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border ${meta.tone} ${padding} font-semibold uppercase tracking-[0.06em] flex-shrink-0`}
      title={`Consent tier: ${meta.label}`}
    >
      {meta.label}
    </span>
  )
}
