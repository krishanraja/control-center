import { FileText } from 'lucide-react'
import type { ContentAttributionRow } from '../../hooks/useAcquisition'

/**
 * Content → Capture — which published piece (UTM-tagged per ATTR-001)
 * actually produced captures and paid customers. This is the zero-cost
 * feedback loop: what converts gets written more.
 */
export function ContentToCapturePanel({ rows }: { rows: ContentAttributionRow[] }) {
  const nonEmpty = rows.filter(r => r.captures > 0 || r.paid > 0)

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <FileText size={13} className="text-violet-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Content → capture
        </h2>
        <span className="ml-auto text-[10px] text-white/30 tabular-nums">{nonEmpty.length} converting</span>
      </header>

      {nonEmpty.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          No UTM-attributed captures yet. Published pieces carry utm_campaign
          (ATTR-001); once capture intakes stamp leads, conversion shows here.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {nonEmpty.slice(0, 8).map(r => (
            <div key={r.id} className="px-4 py-2.5">
              <p className="text-[12px] text-white/85 truncate">{r.idea || r.utm_campaign}</p>
              <div className="flex items-baseline gap-3 mt-0.5 text-[10.5px] tabular-nums">
                <span className="text-white/30 truncate">{r.utm_campaign}</span>
                <span className="ml-auto text-white/45 flex-shrink-0">{r.captures} captured</span>
                <span className={`flex-shrink-0 ${r.paid > 0 ? 'text-emerald-300' : 'text-white/35'}`}>{r.paid} paid</span>
                {r.mrr > 0 && <span className="text-emerald-300/80 flex-shrink-0">${r.mrr}/mo</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
