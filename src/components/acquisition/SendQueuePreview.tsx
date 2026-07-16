import { formatDistanceToNow } from 'date-fns'
import { MailCheck } from 'lucide-react'
import type { QueuedSendPreview } from '../../hooks/useAcquisition'

/**
 * Send Queue — the newest queued nurture sends awaiting approval. Subjects
 * only (bodies stay behind the service-role API). The batch approval deck
 * replaces this preview in the approvals phase.
 */
export function SendQueuePreview({
  rows,
  totalQueued,
}: {
  rows: QueuedSendPreview[]
  totalQueued: number
}) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <MailCheck size={13} className="text-amber-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Send queue
        </h2>
        <span className="ml-auto text-[10px] text-white/30 tabular-nums">
          {totalQueued} awaiting approval
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          Queue is clear — nothing waiting on you.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {rows.map(s => (
            <div key={s.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wide flex-shrink-0">
                  T{s.touch_number}
                </span>
                <span className="text-[12px] text-white/85 truncate">
                  {s.rendered_subject || '(no subject)'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/30">
                <span>{s.lane}</span>
                <span>·</span>
                <span>{s.frame_version}</span>
                {s.queued_at && (
                  <span className="ml-auto">
                    queued {formatDistanceToNow(new Date(s.queued_at), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
