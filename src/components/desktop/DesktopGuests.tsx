import React, { useMemo } from 'react'
import { Mic } from 'lucide-react'
import { useRealtimeGuests, type GuestRow, type GuestStatus, type GuestPodcastTarget } from '../../hooks/useRealtimeGuests'
import { GuestImportDropzone } from '../GuestImportDropzone'
import { GuestStatusLane } from './GuestStatusLane'

const PRIMARY_STATUSES: GuestStatus[] = ['scouted', 'enriched', 'pitched', 'responded', 'scheduled', 'confirmed', 'recorded', 'published', 'dropped']

const STATUS_META: Record<GuestStatus, { title: string; description: string }> = {
  scouted: { title: 'Scouted', description: 'Surfaced by Nell or imported, not yet enriched.' },
  enriched: { title: 'Enriched', description: 'Apollo-enriched, ready for outreach.' },
  pitched: { title: 'Pitched', description: 'Outreach sent, awaiting reply.' },
  responded: { title: 'Responded', description: 'Replied, awaiting scheduling.' },
  scheduled: { title: 'Scheduled', description: 'On the calendar. Confirm to fire the cascade.' },
  confirmed: { title: 'Confirmed', description: 'Cascade fired (prep, recording, promo drafts, email, follow-up).' },
  recorded: { title: 'Recorded', description: 'Episode in the can.' },
  published: { title: 'Published', description: 'Live in the feed.' },
  dropped: { title: 'Dropped', description: 'Not a fit, archived.' },
}

const TARGET_META: Record<GuestPodcastTarget, { title: string }> = {
  signal_noise: { title: 'Signal & Noise' },
  builder_economy: { title: 'Builder Economy' },
  either: { title: 'Either show' },
}

export function DesktopGuests({ onOpenGuest }: { onOpenGuest?: (id: string) => void } = {}) {
  const { guests, loading } = useRealtimeGuests()

  const byStatus = useMemo(() => groupByStatus(guests), [guests])
  const byTarget = useMemo(() => groupByTarget(guests), [guests])
  const activeCount = guests.filter(g => g.status !== 'dropped' && g.status !== 'published').length

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <Mic size={20} className="text-violet-300" />
            Guests
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            Signal &amp; Noise and Builder Economy guest pipeline. Drop a list, paste rows,
            or wait for Nell&rsquo;s daily scout.
          </p>
        </div>
        <span className="text-[11px] text-white/55 tabular-nums">
          {loading ? '…' : `${activeCount} active`}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_2fr] gap-5">
        <aside className="space-y-4">
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
              Import
            </h2>
            <GuestImportDropzone />
          </section>

          <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
              By show
            </h2>
            <ul className="space-y-1">
              {(Object.keys(TARGET_META) as GuestPodcastTarget[]).map(t => {
                const count = (byTarget[t] || []).length
                return (
                  <li key={t} className="flex items-center justify-between gap-2 py-1 text-[12px]">
                    <span className="text-white/75 truncate">{TARGET_META[t].title}</span>
                    <span className={`tabular-nums ${count > 0 ? 'text-white/85' : 'text-white/25'}`}>{count}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>

        <div className="space-y-3">
          {PRIMARY_STATUSES.map(s => (
            <GuestStatusLane
              key={s}
              status={s}
              title={STATUS_META[s].title}
              description={STATUS_META[s].description}
              guests={byStatus[s] || []}
              onOpen={onOpenGuest}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function groupByStatus(guests: GuestRow[]): Partial<Record<GuestStatus, GuestRow[]>> {
  const out: Partial<Record<GuestStatus, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.status] || (out[g.status] = [])
    arr.push(g)
  }
  return out
}

function groupByTarget(guests: GuestRow[]): Partial<Record<GuestPodcastTarget, GuestRow[]>> {
  const out: Partial<Record<GuestPodcastTarget, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.podcast_target] || (out[g.podcast_target] = [])
    arr.push(g)
  }
  return out
}
