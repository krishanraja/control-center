import React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { SkeletonList } from '../shared/Skeleton'
import { CheckCircle2, Clock, Mail, RotateCcw, ExternalLink, Inbox } from 'lucide-react'
import type { SkillDelivery } from './types'

interface Props {
  deliveries: SkillDelivery[]
  loading: boolean
  onRegenerate: (delivery: SkillDelivery) => void
  onRefresh: () => void
}

export function SkillDeliveryHistory({ deliveries, loading, onRegenerate }: Props) {
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <Inbox size={12} className="text-white/40" />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Recent deliveries</h3>
        </div>
        <span className="text-[10px] text-white/30 font-mono tabular-nums">{deliveries.length}</span>
      </header>

      {loading ? (
        <div className="px-4 py-4"><SkeletonList rows={3} card={false} /></div>
      ) : deliveries.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-[12px] text-white/45 font-medium">No deliveries yet.</p>
          <p className="text-[11px] text-white/25 mt-1">Drafted skills will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {deliveries.map(d => (
            <li key={d.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[12.5px] font-medium text-white truncate">{d.client_name}</p>
                    <StatusPill shipped={!!d.shipped_at} emailSent={!!d.email_sent} />
                  </div>
                  {d.skill_names?.length > 0 && (
                    <p className="text-[11px] text-white/45 mt-0.5 truncate">
                      {d.skill_names.slice(0, 3).join(', ')}
                      {d.skill_names.length > 3 ? ` +${d.skill_names.length - 3}` : ''}
                    </p>
                  )}
                  <p className="text-[10.5px] text-white/30 mt-1 tabular-nums">
                    {formatDistanceToNow(new Date(d.shipped_at || d.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {d.zip_url && (
                    <a
                      href={d.zip_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md text-white/40 hover:text-violet-300 hover:bg-white/[0.04] transition-colors"
                      title="Download ZIP"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button
                    onClick={() => onRegenerate(d)}
                    className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/[0.04] transition-colors"
                    title="Regenerate from this transcript"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StatusPill({ shipped, emailSent }: { shipped: boolean; emailSent: boolean }) {
  if (shipped && emailSent) {
    return (
      <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
        <CheckCircle2 size={10} /> Shipped
      </span>
    )
  }
  if (shipped) {
    return (
      <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300">
        <Mail size={10} /> Sent (no email)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-white/55">
      <Clock size={10} /> Draft
    </span>
  )
}
