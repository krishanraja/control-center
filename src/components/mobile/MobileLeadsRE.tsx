import React, { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import { MobileShell, TabHeader, FeedCard, FeedRow, EmptyState } from './primitives'
import { ContactImportDropzone } from '../ContactImportDropzone'
import { ventureDisplayName } from '../ContactSourcePill'
import { humanAge } from '../../lib/ageHelpers'
import { useHaptics } from '../../hooks/useHaptics'
import { useRealtimeContacts, type ContactRow } from '../../hooks/useRealtimeContacts'

const VENTURES: Array<{ slug: string; label: string }> = [
  { slug: 'mindmaker', label: 'Mindmaker' },
  { slug: 'meliora', label: 'Meliora' },
  { slug: 'adfixus', label: 'AdFixus' },
  { slug: 'signal_noise', label: 'Signal & Noise' },
  { slug: 'builder_economy', label: 'Builder Economy' },
  { slug: 'fractionl', label: 'Fractionl' },
  { slug: 'investor', label: 'Investor' },
]

function heatDot(score?: number | null): string {
  const s = score ?? 0
  if (s >= 75) return 'bg-rose-400'
  if (s >= 60) return 'bg-amber-400'
  if (s >= 40) return 'bg-sky-400'
  return 'bg-white/30'
}

function contactName(c: ContactRow): string {
  return c.full_name || c.company || (c.email ? c.email.split('@')[0] : '—')
}

function contactSubtitle(c: ContactRow): string {
  return [c.title, c.company].filter(Boolean).join(' @ ')
}

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

/**
 * Mobile Relationship Engine "Leads". Lean: a pinned warm 1-by-1 list at top,
 * then a venture-filtered + searchable feed. Bulk actions are desktop-only;
 * here every row simply opens (no-op detail stub for now) so the phone stays a
 * quick-scan surface.
 */
export function MobileLeadsRE(_props: Props = {}) {
  const h = useHaptics()
  const [venture, setVenture] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)

  const { contacts, loading } = useRealtimeContacts({
    ventureIn: venture ? [venture] : undefined,
    search: search || undefined,
  })

  const { handQueue, feed } = useMemo(() => {
    const hand: ContactRow[] = []
    const rest: ContactRow[] = []
    for (const c of contacts) {
      const isHand =
        c.consent_tier === 'warm' || c.consent_tier === 'customer' || (c.heat_score ?? 0) >= 75
      if (isHand) hand.push(c)
      else rest.push(c)
    }
    const byHeat = (a: ContactRow, b: ContactRow) => (b.heat_score ?? 0) - (a.heat_score ?? 0)
    hand.sort(byHeat)
    rest.sort(byHeat)
    return { handQueue: hand, feed: rest }
  }, [contacts])

  const total = contacts.length

  return (
    <MobileShell
      header={
        <TabHeader
          title="Leads"
          subtitle={loading ? 'Loading…' : `${total} contacts`}
          trailing={
            <button
              onClick={() => { h.tap(); setShowImport(s => !s) }}
              className="px-5 py-3 rounded-full bg-white text-black text-[15px] font-semibold active:scale-95 transition-transform"
            >
              Import
            </button>
          }
        />
      }
    >
      {showImport && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 flex-shrink-0">
          <ContactImportDropzone />
        </div>
      )}

      {/* Venture filter chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0 -mx-1 px-1">
        <button
          onClick={() => { h.tap(); setVenture(null) }}
          className={`px-3 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${venture === null ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70'}`}
        >
          All
        </button>
        {VENTURES.map(v => (
          <button
            key={v.slug}
            onClick={() => { h.tap(); setVenture(v.slug) }}
            className={`px-3 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${venture === v.slug ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, company, campaign…"
        className="flex-shrink-0 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder:text-white/35 focus:border-violet-400/40 focus:outline-none"
      />

      {total === 0 && !loading && (
        <EmptyState label="No contacts in this filter. Tap Import to add a list." />
      )}

      {/* 1-by-1 warm list */}
      {handQueue.length > 0 && (
        <FeedCard title={`Handle 1-by-1 · ${handQueue.length}`}>
          {handQueue.slice(0, 20).map(c => (
            <FeedRow
              key={c.id}
              dotColor={heatDot(c.heat_score)}
              title={contactName(c)}
              detail={contactSubtitle(c) || ventureDisplayName(c.primary_venture)}
              trailing={
                <span className="flex items-center gap-1 text-[13px] text-white/45 tabular-nums">
                  <Flame size={12} className="text-rose-300" />
                  {c.heat_score ?? 0}
                </span>
              }
              onClick={() => h.select()}
              feedback={{ sourceTable: 'opportunities', sourceId: c.id, agentId: c.owner_agent }}
            />
          ))}
        </FeedCard>
      )}

      {/* General feed */}
      {feed.length > 0 && (
        <FeedCard title={`Review · ${feed.length}`}>
          {feed.slice(0, 40).map(c => (
            <FeedRow
              key={c.id}
              dotColor={heatDot(c.heat_score)}
              title={contactName(c)}
              detail={contactSubtitle(c) || c.origin_campaign || undefined}
              trailing={<span className="text-[13px] text-white/40 tabular-nums">{humanAge(c.updated_at)}</span>}
              onClick={() => h.select()}
            />
          ))}
          {feed.length > 40 && (
            <div className="px-7 py-4 text-[14px] text-white/35 text-center">
              +{feed.length - 40} more — narrow with filters
            </div>
          )}
        </FeedCard>
      )}
    </MobileShell>
  )
}
