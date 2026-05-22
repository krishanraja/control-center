import React, { useMemo } from 'react'
import { Mic } from 'lucide-react'
import { MobileShell } from './MobileShell'
import { TabHeader } from './TabHeader'
import { useRealtimeGuests, type GuestStatus, type GuestRow } from '../../hooks/useRealtimeGuests'
import { GuestImportDropzone } from '../GuestImportDropzone'
import { GuestCard } from '../GuestCard'

const ACTIVE_STATUSES: GuestStatus[] = ['scouted', 'enriched', 'pitched', 'responded', 'scheduled', 'confirmed', 'recorded']

const STATUS_LABEL: Record<GuestStatus, string> = {
  scouted: 'Scouted',
  enriched: 'Enriched',
  pitched: 'Pitched',
  responded: 'Responded',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  recorded: 'Recorded',
  published: 'Published',
  dropped: 'Dropped',
}

export function MobileGuests() {
  const { guests, loading } = useRealtimeGuests({ statusIn: ACTIVE_STATUSES })

  const grouped = useMemo(() => groupByStatus(guests), [guests])

  return (
    <MobileShell
      header={<TabHeader title="Guests" subtitle="Signal & Noise + Builder Economy" />}
    >
      <div className="px-3 pb-6 space-y-4">
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2 px-1 flex items-center gap-1">
            <Mic size={11} className="text-violet-300" />
            Import
          </h2>
          <GuestImportDropzone />
        </section>

        {loading && (
          <div className="text-[12px] text-white/45 text-center py-4">Loading…</div>
        )}

        {!loading && guests.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center">
            <p className="text-[12px] text-white/55">No active guests yet.</p>
            <p className="text-[11px] text-white/35 mt-1">Import a list or wait for Nell&rsquo;s next scout.</p>
          </div>
        )}

        {ACTIVE_STATUSES.map(s => {
          const rows = grouped[s] || []
          if (rows.length === 0) return null
          return (
            <section key={s}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2 px-1">
                {STATUS_LABEL[s]} <span className="text-white/30 tabular-nums">({rows.length})</span>
              </h3>
              <div className="space-y-2">
                {rows.slice(0, 8).map(g => (
                  <GuestCard key={g.id} guest={g} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </MobileShell>
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
