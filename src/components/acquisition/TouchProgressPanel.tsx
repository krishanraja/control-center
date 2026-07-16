import { ListOrdered } from 'lucide-react'
import type { AcquisitionLane } from '../../hooks/useAcquisition'
import { SEND_STATUS_TONE } from './laneMeta'

/**
 * Touch Progress — the acquisition_sends ledger rolled up per touch number:
 * how many are queued / sent / suppressed / rejected at each step of the
 * sequence, with the unsubscribe rate called out per touch.
 */
export function TouchProgressPanel({ lane }: { lane: AcquisitionLane }) {
  const byTouch = new Map<number, Record<string, number>>()
  for (const t of lane.touches) {
    const row = byTouch.get(t.touch_number) || {}
    row[t.status] = (row[t.status] || 0) + t.count
    byTouch.set(t.touch_number, row)
  }
  const touches = Array.from(byTouch.entries()).sort((a, b) => a[0] - b[0])

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <ListOrdered size={13} className="text-cyan-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Touch progress
        </h2>
      </header>

      {touches.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-white/35">
          No sends in the ledger yet. Once the nurture scheduler queues Touch 1,
          progress shows up here per touch.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {touches.map(([touchNo, counts]) => {
            const sent = counts.sent || 0
            const suppressed = counts.suppressed || 0
            const unsubPct = sent > 0 ? (suppressed / sent) * 100 : null
            const order: string[] = ['queued', 'approved', 'sent', 'rejected', 'suppressed', 'failed']
            const extras = Object.keys(counts).filter(s => !order.includes(s))
            return (
              <div key={touchNo} className="px-4 py-2.5 flex items-center gap-2 text-[11.5px]">
                <span className="w-8 font-semibold text-white/80">T{touchNo}</span>
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 tabular-nums">
                  {order.concat(extras).map(status =>
                    counts[status] ? (
                      <span key={status} className="inline-flex items-baseline gap-1">
                        <span className={`font-semibold ${SEND_STATUS_TONE[status] || 'text-white/70'}`}>
                          {counts[status]}
                        </span>
                        <span className="text-white/30">{status}</span>
                      </span>
                    ) : null,
                  )}
                </span>
                {unsubPct != null && unsubPct > 0 && (
                  <span className={`ml-auto text-[10px] tabular-nums ${unsubPct > 2 ? 'text-rose-300' : 'text-white/35'}`}>
                    {unsubPct.toFixed(1)}% unsub
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
